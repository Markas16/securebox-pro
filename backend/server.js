const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { initDb, run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'secure-cryptographic-hash-jwt-secret-key-capstone';

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(process.env.DATA_DIR || __dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // We name the file on disk as its database ID to prevent collusion/directory traversal
    const fileId = req.body.id || crypto.randomUUID();
    cb(null, fileId);
  }
});
const upload = multer({ storage });

// Database Initialization
initDb().then(() => {
  console.log('Database loaded.');
}).catch(err => {
  console.error('Failed to load database:', err);
});

// Helper for JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
};

// Helper to log user activities
const logActivity = async (userId, username, action, details) => {
  try {
    await run(
      'INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)',
      [userId, username, action, details]
    );
  } catch (err) {
    console.error('Logging error:', err);
  }
};

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  const { username, password, salt } = req.body;

  if (!username || !password || !salt) {
    return res.status(400).json({ error: 'Username, password, and vault salt are required.' });
  }

  try {
    const existingUser = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)',
      [username, passwordHash, salt]
    );

    await logActivity(result.id, username, 'REGISTER', 'User account successfully registered');
    res.status(201).json({ message: 'Registration successful.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    
    await logActivity(user.id, user.username, 'LOGIN', 'User logged in successfully');
    
    // Return token and salt (so client can derive PBKDF2 vault key)
    res.json({
      token,
      username: user.username,
      salt: user.salt
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// -------------------------------------------------------------
// File Management Endpoints
// -------------------------------------------------------------

// Upload encrypted file
app.post('/api/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const { id, originalName, mimeType, fileSize, sha256Hash, iv } = req.body;
  const ownerId = req.user.id;

  if (!id || !originalName || !fileSize || !sha256Hash || !iv) {
    return res.status(400).json({ error: 'Missing encryption file metadata.' });
  }

  try {
    await run(
      'INSERT INTO files (id, original_name, encrypted_filename, mime_type, file_size, owner_id, sha256_hash, iv) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, originalName, id, mimeType, fileSize, ownerId, sha256Hash, iv]
    );

    await logActivity(
      ownerId,
      req.user.username,
      'ENCRYPT_UPLOAD',
      `Encrypted file uploaded: ${originalName} (Size: ${fileSize} bytes, Hash: ${sha256Hash.substring(0, 10)}...)`
    );

    res.status(201).json({ message: 'File metadata stored and encrypted payload uploaded successfully.' });
  } catch (err) {
    console.error(err);
    // Cleanup physical file on DB failure
    const filePath = path.join(uploadsDir, id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: 'Database storage failed.' });
  }
});

// List owner's files
app.get('/api/files/list', authenticateToken, async (req, res) => {
  try {
    const files = await all('SELECT * FROM files WHERE owner_id = ? ORDER BY uploaded_at DESC', [req.user.id]);
    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve files.' });
  }
});

// Download an encrypted file
app.get('/api/files/download/:id', authenticateToken, async (req, res) => {
  const fileId = req.params.id;

  try {
    const fileRecord = await get('SELECT * FROM files WHERE id = ?', [fileId]);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Owner validation
    if (fileRecord.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filePath = path.join(uploadsDir, fileRecord.encrypted_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Encrypted file blob missing from disk.' });
    }

    await logActivity(
      req.user.id,
      req.user.username,
      'DOWNLOAD',
      `Downloaded encrypted payload for: ${fileRecord.original_name}`
    );

    // Send original file name, IV, and SHA256 in headers
    res.setHeader('X-Original-Name', encodeURIComponent(fileRecord.original_name));
    res.setHeader('X-File-IV', fileRecord.iv);
    res.setHeader('X-File-Hash', fileRecord.sha256_hash);
    res.setHeader('X-File-Mime', fileRecord.mime_type || 'application/octet-stream');

    res.download(filePath, fileRecord.original_name + '.enc');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Download retrieval failed.' });
  }
});

// Delete an encrypted file
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
  const fileId = req.params.id;

  try {
    const fileRecord = await get('SELECT * FROM files WHERE id = ? AND owner_id = ?', [fileId, req.user.id]);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or access denied.' });
    }

    // Remove physical file
    const filePath = path.join(uploadsDir, fileRecord.encrypted_filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove db file and shares
    await run('DELETE FROM files WHERE id = ?', [fileId]);
    await run('DELETE FROM shares WHERE file_id = ?', [fileId]);
    await run('DELETE FROM vault_keys WHERE file_id = ?', [fileId]);

    await logActivity(
      req.user.id,
      req.user.username,
      'DELETE',
      `Deleted file and key data for: ${fileRecord.original_name}`
    );

    res.json({ message: 'File deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete execution failed.' });
  }
});

// -------------------------------------------------------------
// Key Vault Endpoints
// -------------------------------------------------------------

// Upload / Back up encrypted AES key
app.post('/api/vault/keys', authenticateToken, async (req, res) => {
  const { fileId, encryptedKey, keyIv } = req.body;
  const userId = req.user.id;

  if (!fileId || !encryptedKey || !keyIv) {
    return res.status(400).json({ error: 'fileId, encryptedKey, and keyIv are required.' });
  }

  try {
    // Verify file exists and user owns it
    const fileRecord = await get('SELECT original_name FROM files WHERE id = ? AND owner_id = ?', [fileId, userId]);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or unauthorized.' });
    }

    await run(
      `INSERT INTO vault_keys (user_id, file_id, encrypted_key, key_iv) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, file_id) 
       DO UPDATE SET encrypted_key=excluded.encrypted_key, key_iv=excluded.key_iv`,
      [userId, fileId, encryptedKey, keyIv]
    );

    await logActivity(
      userId,
      req.user.username,
      'VAULT_BACKUP',
      `Backed up encrypted key to vault for: ${fileRecord.original_name}`
    );

    res.status(201).json({ message: 'Encrypted key stored in vault.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save key in vault.' });
  }
});

// Retrieve all key vault mappings for logged-in user
app.get('/api/vault/keys', authenticateToken, async (req, res) => {
  try {
    const keys = await all(
      `SELECT vk.*, f.original_name, f.file_size, f.sha256_hash 
       FROM vault_keys vk
       JOIN files f ON vk.file_id = f.id
       WHERE vk.user_id = ?`,
      [req.user.id]
    );
    res.json(keys);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch vault keys.' });
  }
});

// -------------------------------------------------------------
// Secure Sharing Endpoints
// -------------------------------------------------------------

// Share file (generates share link details on DB)
app.post('/api/files/share', authenticateToken, async (req, res) => {
  const { fileId, sharedWith } = req.body; // sharedWith is optional
  const ownerId = req.user.id;

  try {
    const fileRecord = await get('SELECT original_name FROM files WHERE id = ? AND owner_id = ?', [fileId, ownerId]);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found or unauthorized.' });
    }

    const shareId = crypto.randomBytes(16).toString('hex');
    await run(
      'INSERT INTO shares (id, file_id, owner_id, shared_with_username) VALUES (?, ?, ?, ?)',
      [shareId, fileId, ownerId, sharedWith || null]
    );

    await logActivity(
      ownerId,
      req.user.username,
      'SHARE',
      `Generated sharing link for: ${fileRecord.original_name}`
    );

    res.status(201).json({ shareId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create share.' });
  }
});

// Get file metadata for a share
app.get('/api/files/share-info/:shareId', async (req, res) => {
  const { shareId } = req.params;

  try {
    const share = await get('SELECT * FROM shares WHERE id = ?', [shareId]);
    if (!share) {
      return res.status(404).json({ error: 'Invalid share link or expired.' });
    }

    const fileRecord = await get(
      'SELECT id, original_name, mime_type, file_size, sha256_hash, iv FROM files WHERE id = ?',
      [share.file_id]
    );

    if (!fileRecord) {
      return res.status(404).json({ error: 'Shared file does not exist anymore.' });
    }

    res.json(fileRecord);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve share information.' });
  }
});

// Public download route for shared files (requires shareId)
app.get('/api/files/shared-download/:shareId', async (req, res) => {
  const { shareId } = req.params;

  try {
    const share = await get('SELECT * FROM shares WHERE id = ?', [shareId]);
    if (!share) {
      return res.status(404).json({ error: 'Invalid share link or expired.' });
    }

    const fileRecord = await get('SELECT * FROM files WHERE id = ?', [share.file_id]);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File does not exist.' });
    }

    const filePath = path.join(uploadsDir, fileRecord.encrypted_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Encrypted file blob missing.' });
    }

    // Log the download (owner is logger target)
    await logActivity(
      share.owner_id,
      'System (via Share Link)',
      'DOWNLOAD',
      `Shared file download execution for: ${fileRecord.original_name}`
    );

    res.setHeader('X-Original-Name', encodeURIComponent(fileRecord.original_name));
    res.setHeader('X-File-IV', fileRecord.iv);
    res.setHeader('X-File-Hash', fileRecord.sha256_hash);
    res.setHeader('X-File-Mime', fileRecord.mime_type || 'application/octet-stream');

    res.download(filePath, fileRecord.original_name + '.enc');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Shared file download failed.' });
  }
});

// -------------------------------------------------------------
// Logs & Dashboard Statistics Endpoints
// -------------------------------------------------------------

// Fetch activity logs for the logged-in user
app.get('/api/logs', authenticateToken, async (req, res) => {
  try {
    const logs = await all(
      'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100',
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve logs.' });
  }
});

// Allow client to log custom activities (e.g. client verification, decryption check)
app.post('/api/logs', authenticateToken, async (req, res) => {
  const { action, details } = req.body;

  if (!action) return res.status(400).json({ error: 'Action required.' });

  try {
    await logActivity(req.user.id, req.user.username, action, details);
    res.status(201).json({ message: 'Logged.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to write log.' });
  }
});

// Statistics endpoint for user dashboard
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const fileCountObj = await get('SELECT COUNT(*) as count, SUM(file_size) as totalSize FROM files WHERE owner_id = ?', [req.user.id]);
    const vaultCountObj = await get('SELECT COUNT(*) as count FROM vault_keys WHERE user_id = ?', [req.user.id]);
    const shareCountObj = await get('SELECT COUNT(*) as count FROM shares WHERE owner_id = ?', [req.user.id]);
    
    // Quick breakdown of files by general types
    const fileTypes = await all(
      `SELECT mime_type, COUNT(*) as count 
       FROM files 
       WHERE owner_id = ? 
       GROUP BY mime_type`, 
      [req.user.id]
    );

    // Recent 5 activities
    const recentActivities = await all(
      'SELECT action, details, timestamp FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
      [req.user.id]
    );

    res.json({
      totalFiles: fileCountObj.count || 0,
      totalSize: fileCountObj.totalSize || 0,
      vaultKeysCount: vaultCountObj.count || 0,
      totalShares: shareCountObj.count || 0,
      fileTypes,
      recentActivities
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compile stats.' });
  }
});

// Default root response
app.get('/', (req, res) => {
  res.send('Secure Crypto System Backend API Running.');
});

// Start Server
app.listen(PORT, () => {
  console.log(`Crypto API listening on port ${PORT}`);
});
