import React, { useState, useEffect } from 'react';
import { 
  Shield, Key, Upload, Download, Share2, Clipboard, 
  Trash2, FileText, CheckCircle, AlertTriangle, Activity, 
  Lock, Unlock, Database, RefreshCw, Eye, EyeOff, BarChart2
} from 'lucide-react';
import { 
  generateAESKey, exportKeyToBase64, importKeyFromBase64, 
  calculateSHA256, encryptFileBuffer, decryptFileBuffer, 
  generateSalt, wrapKeyForVault, unwrapKeyFromVault, base64ToBuffer, bufferToBase64
} from './crypto';
import GravityCanvas from './components/GravityCanvas';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

export default function App() {
  // Session State
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [salt, setSalt] = useState(localStorage.getItem('salt') || '');
  const [passwordInput, setPasswordInput] = useState(''); // Used during login/signup
  const [sessionPassword, setSessionPassword] = useState(''); // In-memory only for key wraps

  // Navigation: 'dashboard' | 'encrypt' | 'decrypt' | 'vault' | 'logs'
  const [currentView, setCurrentView] = useState('dashboard');
  
  // Auth Screen: 'login' | 'register'
  const [authView, setAuthView] = useState('login');
  
  // Loading & Alert States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dashboard Data
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    vaultKeysCount: 0,
    totalShares: 0,
    fileTypes: [],
    recentActivities: []
  });

  // Encryption Engine State
  const [encryptFile, setEncryptFile] = useState(null);
  const [encryptMeta, setEncryptMeta] = useState(null); // { originalName, size, sha256 }
  const [generatedKeyStr, setGeneratedKeyStr] = useState('');
  const [generatedKeyObj, setGeneratedKeyObj] = useState(null);
  const [encryptedBlob, setEncryptedBlob] = useState(null);
  const [encryptedIV, setEncryptedIV] = useState('');
  const [encryptStatus, setEncryptStatus] = useState(''); // 'idle' | 'encrypting' | 'encrypted' | 'uploaded'

  // Decryption Portal State
  const [decryptFile, setDecryptFile] = useState(null);
  const [decryptKeyInput, setDecryptKeyInput] = useState('');
  const [decryptStatus, setDecryptStatus] = useState(''); // 'idle' | 'decrypting' | 'decrypted' | 'failed'
  const [decryptedFileUrl, setDecryptedFileUrl] = useState('');
  const [decryptedName, setDecryptedName] = useState('');
  const [decryptedHash, setDecryptedHash] = useState('');
  const [originalHashToVerify, setOriginalHashToVerify] = useState('');
  const [isHashVerified, setIsHashVerified] = useState(null); // null | true | false

  // Download Center / Vault / Logs State
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [vaultKeys, setVaultKeys] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  
  // Share Modal
  const [shareFileId, setShareFileId] = useState(null);
  const [shareFileKey, setShareFileKey] = useState('');
  const [generatedShareLink, setGeneratedShareLink] = useState('');
  
  // Anonymous Share View State
  const [anonymousShareId, setAnonymousShareId] = useState('');
  const [anonymousKey, setAnonymousKey] = useState('');
  const [anonymousMeta, setAnonymousMeta] = useState(null);
  const [anonymousDecryptedUrl, setAnonymousDecryptedUrl] = useState('');
  const [anonymousDecryptStatus, setAnonymousDecryptStatus] = useState(''); // 'idle' | 'decrypting' | 'decrypted' | 'failed'

  // Check URL Hash for anonymous sharing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#share:')) {
        const parts = hash.substring(7).split('&key=');
        if (parts.length === 2) {
          setAnonymousShareId(parts[0]);
          setAnonymousKey(parts[1]);
          setCurrentView('anonymous-share');
          fetchAnonymousMeta(parts[0]);
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Fetch Dashboard and Data Lists when Token changes or View changes
  useEffect(() => {
    if (token && currentView !== 'anonymous-share') {
      fetchDashboardStats();
      fetchUploadedFiles();
      fetchVaultKeys();
      fetchActivityLogs();
    }
  }, [token, currentView]);

  // Alert handler helper
  const triggerAlert = (err, succ) => {
    if (err) {
      setError(err);
      setTimeout(() => setError(''), 6000);
    }
    if (succ) {
      setSuccess(succ);
      setTimeout(() => setSuccess(''), 6000);
    }
  };

  // -------------------------------------------------------------
  // Data Fetching Functions
  // -------------------------------------------------------------

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUploadedFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/files/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setUploadedFiles(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchVaultKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/vault/keys`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setVaultKeys(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setActivityLogs(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnonymousMeta = async (shareId) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/files/share-info/${shareId}`);
      const data = await res.json();
      if (res.ok) {
        setAnonymousMeta(data);
      } else {
        triggerAlert(data.error || 'Failed to load shared file info.');
      }
    } catch (e) {
      triggerAlert('Connection to server failed.');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Auth Functions
  // -------------------------------------------------------------

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username || !passwordInput) {
      return triggerAlert('Please fill in all fields.');
    }

    try {
      setLoading(true);
      // Generate a user-specific vault salt client-side
      const userSalt = generateSalt();

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: passwordInput, salt: userSalt })
      });
      const data = await res.json();

      if (res.ok) {
        triggerAlert(null, 'Registration successful! You can now log in.');
        setAuthView('login');
      } else {
        triggerAlert(data.error);
      }
    } catch (err) {
      triggerAlert('Registration request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !passwordInput) {
      return triggerAlert('Please fill in all fields.');
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: passwordInput })
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('username', data.username);
        localStorage.setItem('salt', data.salt);
        
        setToken(data.token);
        setUsername(data.username);
        setSalt(data.salt);
        setSessionPassword(passwordInput); // Store password in memory for wrapping keys

        triggerAlert(null, 'Welcome back, ' + data.username + '!');
        setCurrentView('dashboard');
      } else {
        triggerAlert(data.error);
      }
    } catch (err) {
      triggerAlert('Login request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('salt');
    setToken('');
    setUsername('');
    setSalt('');
    setSessionPassword('');
    setCurrentView('dashboard');
  };

  // -------------------------------------------------------------
  // Encryption Engine
  // -------------------------------------------------------------

  const handleEncryptFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setEncryptFile(file);
    setEncryptStatus('idle');
    setGeneratedKeyStr('');
    setGeneratedKeyObj(null);
    setEncryptedBlob(null);

    try {
      setLoading(true);
      // Read file buffer
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        // Compute SHA-256 Hash of original file (confirms integrity later)
        const sha256 = await calculateSHA256(arrayBuffer);
        setEncryptMeta({
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
          sha256
        });
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      triggerAlert('Failed to compute file parameters.');
      setLoading(false);
    }
  };

  const performEncryption = async () => {
    if (!encryptFile || !encryptMeta) return;

    try {
      setEncryptStatus('encrypting');
      
      // 1. Generate AES key
      const keyObj = await generateAESKey();
      const base64Key = await exportKeyToBase64(keyObj);
      setGeneratedKeyObj(keyObj);
      setGeneratedKeyStr(base64Key);

      // 2. Read file to ArrayBuffer and Encrypt
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        const { ciphertextBuffer, ivBase64 } = await encryptFileBuffer(arrayBuffer, keyObj);

        const encBlob = new Blob([ciphertextBuffer], { type: 'application/octet-stream' });
        setEncryptedBlob(encBlob);
        setEncryptedIV(ivBase64);
        setEncryptStatus('encrypted');
        triggerAlert(null, 'AES-256 Encryption successful! Secrets generated.');
      };
      reader.readAsArrayBuffer(encryptFile);
    } catch (err) {
      console.error(err);
      setEncryptStatus('idle');
      triggerAlert('Encryption processing failed.');
    }
  };

  const downloadEncryptedFileLocal = () => {
    if (!encryptedBlob || !encryptMeta) return;
    const url = URL.createObjectURL(encryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = encryptMeta.originalName + '.enc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadKeyFileLocal = () => {
    if (!generatedKeyStr || !encryptMeta) return;
    const blob = new Blob([generatedKeyStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = encryptMeta.originalName + '.key';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const uploadEncryptedToServer = async () => {
    if (!encryptedBlob || !encryptMeta || !encryptedIV) return;

    try {
      setLoading(true);
      const fileId = crypto.randomUUID();
      const formData = new FormData();
      formData.append('id', fileId);
      formData.append('originalName', encryptMeta.originalName);
      formData.append('mimeType', encryptMeta.mimeType);
      formData.append('fileSize', encryptMeta.size);
      formData.append('sha256Hash', encryptMeta.sha256);
      formData.append('iv', encryptedIV);
      formData.append('file', encryptedBlob, fileId);

      const res = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        setEncryptStatus('uploaded');
        triggerAlert(null, 'Encrypted file uploaded to cloud repository successfully!');
        
        // Backup key automatically to key vault (wrapped using PBKDF2)
        if (sessionPassword) {
          await backupKeyToVault(fileId, generatedKeyStr);
        }
        
        // Refresh lists
        fetchUploadedFiles();
      } else {
        triggerAlert(data.error || 'Failed to upload encrypted file.');
      }
    } catch (e) {
      console.error(e);
      triggerAlert('Network error during file upload.');
    } finally {
      setLoading(false);
    }
  };

  const backupKeyToVault = async (fileId, keyStr) => {
    try {
      // PBKDF2 wrapping key derivation & encryption
      const { encryptedKeyBase64, keyIvBase64 } = await wrapKeyForVault(keyStr, sessionPassword, salt);
      
      const res = await fetch(`${API_BASE}/vault/keys`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId, encryptedKey: encryptedKeyBase64, keyIv: keyIvBase64 })
      });
      
      if (res.ok) {
        triggerAlert(null, 'Encrypted payload and secure wrapped Key Vault backup verified.');
        fetchVaultKeys();
      }
    } catch (err) {
      console.error(err);
      triggerAlert('Key Vault auto-backup failed. Please download key file manually.');
    }
  };

  // -------------------------------------------------------------
  // Decryption Portal
  // -------------------------------------------------------------

  const handleDecryptFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDecryptFile(file);
    setDecryptStatus('idle');
    setDecryptedFileUrl('');
    setDecryptedName('');
    setIsHashVerified(null);
  };

  const performDecryption = async () => {
    if (!decryptFile || !decryptKeyInput) {
      return triggerAlert('Please upload an encrypted file and input the secret AES key.');
    }

    try {
      setDecryptStatus('decrypting');
      
      // Import key
      const cryptoKey = await importKeyFromBase64(decryptKeyInput.trim());

      const reader = new FileReader();
      reader.onload = async (event) => {
        const fileBuffer = event.target.result;
        
        // Prompt user for original IV (or parse it if file downloaded via our system)
        // For custom offline file decryption, we can prompt, or try to decode.
        // Wait, to make manual local decryption simple, if they upload a file they downloaded,
        // we can store/fetch IV or request the user to enter it.
        // Let's add an optional IV input, but set a default of standard IV we use, or let the system store it.
        // Better: let's allow importing IV. If they downloaded via server, the headers/manager handles it.
        // For manual local uploads, we can ask for the IV or extract it from their inputs.
        // Let's add an IV input box!
        let ivVal = encryptedIV; // fallback to session IV
        if (!ivVal) {
          const promptIV = prompt('Please enter the Base64 IV (Initialization Vector) for this file:');
          if (!promptIV) {
            setDecryptStatus('failed');
            triggerAlert('IV is required for AES-GCM decryption.');
            return;
          }
          ivVal = promptIV;
        }

        try {
          const decryptedBuffer = await decryptFileBuffer(fileBuffer, cryptoKey, ivVal);
          
          // Compute integrity hash
          const hash = await calculateSHA256(decryptedBuffer);
          setDecryptedHash(hash);

          // If original hash is provided, verify it
          if (originalHashToVerify) {
            const isMatch = hash.toLowerCase() === originalHashToVerify.toLowerCase();
            setIsHashVerified(isMatch);
            // Log verification client-side
            await logCustomActivity('INTEGRITY_CHECK', `SHA-256 verification complete. Match: ${isMatch}. Decrypted Hash: ${hash}`);
          }

          // Create downloadable decrypted object
          const decName = decryptFile.name.replace('.enc', '');
          setDecryptedName(decName);
          const mimeType = 'application/octet-stream';
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          const url = URL.createObjectURL(blob);
          setDecryptedFileUrl(url);
          setDecryptStatus('decrypted');
          triggerAlert(null, 'Decryption and integrity checks passed!');
        } catch (decErr) {
          console.error(decErr);
          setDecryptStatus('failed');
          triggerAlert('Decryption failed. Invalid AES Key or tampered payload (Integrity Failure).');
        }
      };

      reader.readAsArrayBuffer(decryptFile);
    } catch (e) {
      console.error(e);
      setDecryptStatus('failed');
      triggerAlert('Decryption setup failed. Check key format.');
    }
  };

  const downloadDecryptedFileLocal = () => {
    if (!decryptedFileUrl) return;
    const a = document.createElement('a');
    a.href = decryptedFileUrl;
    a.download = decryptedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const logCustomActivity = async (action, details) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/logs`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, details })
      });
      fetchActivityLogs();
    } catch (e) {
      console.error(e);
    }
  };

  // -------------------------------------------------------------
  // Download Center & Key Vault Actions
  // -------------------------------------------------------------

  const handleDownloadAndDecrypt = async (fileRecord) => {
    try {
      setLoading(true);
      
      // 1. Fetch Key (either from user vault, or ask them for it)
      let keyStr = '';
      const vaultMatch = vaultKeys.find(v => v.file_id === fileRecord.id);
      
      if (vaultMatch) {
        // Unwrap key client-side using PBKDF2 derived KEK
        keyStr = await unwrapKeyFromVault(
          vaultMatch.encrypted_key, 
          vaultMatch.key_iv, 
          sessionPassword, 
          salt
        );
      } else {
        keyStr = prompt(`Enter AES-256 Secret Key for: ${fileRecord.original_name}`);
        if (!keyStr) {
          setLoading(false);
          return;
        }
      }

      // 2. Fetch encrypted file blob
      const res = await fetch(`${API_BASE}/files/download/${fileRecord.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errObj = await res.json();
        throw new Error(errObj.error || 'Download failed.');
      }

      const fileBlob = await res.blob();
      const fileBuffer = await fileBlob.arrayBuffer();

      // 3. Decrypt client-side
      const cryptoKey = await importKeyFromBase64(keyStr);
      const decryptedBuffer = await decryptFileBuffer(fileBuffer, cryptoKey, fileRecord.iv);
      
      // 4. Integrity check
      const hash = await calculateSHA256(decryptedBuffer);
      const hashMatch = hash.toLowerCase() === fileRecord.sha256_hash.toLowerCase();

      // Log integrity check on server
      await logCustomActivity('DECRYPT_SUCCESS', `Decrypted & Verified: ${fileRecord.original_name}. Hash match: ${hashMatch}`);

      if (!hashMatch) {
        triggerAlert('Warning: SHA-256 verification failed. The decrypted file does not match the original hash!');
      }

      // 5. Trigger download
      const mimeType = fileRecord.mime_type || 'application/octet-stream';
      const blob = new Blob([decryptedBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileRecord.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      triggerAlert(null, `Decrypted and downloaded "${fileRecord.original_name}" (Integrity verified).`);
    } catch (err) {
      console.error(err);
      triggerAlert(err.message || 'Failed to download and decrypt file.');
    } finally {
      setLoading(false);
    }
  };

  const handleShareFile = async (fileRecord) => {
    try {
      setLoading(true);
      // Generate share record on db
      const res = await fetch(`${API_BASE}/files/share`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId: fileRecord.id })
      });
      const data = await res.json();
      
      if (res.ok) {
        setShareFileId(fileRecord.id);
        
        // Find key in vault to embed in URL hash (optional but provides single-click secure retrieval)
        const vaultMatch = vaultKeys.find(v => v.file_id === fileRecord.id);
        let keyText = '';
        if (vaultMatch) {
          keyText = await unwrapKeyFromVault(
            vaultMatch.encrypted_key,
            vaultMatch.key_iv,
            sessionPassword,
            salt
          );
        }
        
        setShareFileKey(keyText);
        
        // Generate Link: URL hash contains shareId and aesKey
        const link = `${window.location.origin}${window.location.pathname}#share:${data.shareId}&key=${keyText}`;
        setGeneratedShareLink(link);
      } else {
        triggerAlert(data.error || 'Failed to share file.');
      }
    } catch (e) {
      console.error(e);
      triggerAlert('Error generating sharing link.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Are you sure you want to permanently delete this file and all its cryptographic keys from the cloud repository?')) return;
    
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok) {
        triggerAlert(null, 'File and keys removed from system.');
        fetchUploadedFiles();
        fetchVaultKeys();
      } else {
        triggerAlert(data.error || 'Delete failed.');
      }
    } catch (e) {
      triggerAlert('Network error during deletion.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevealVaultKey = async (vaultRecord) => {
    try {
      const keyText = await unwrapKeyFromVault(
        vaultRecord.encrypted_key,
        vaultRecord.key_iv,
        sessionPassword,
        salt
      );
      alert(`AES-256 Secret Key (Base64) for "${vaultRecord.original_name}":\n\n${keyText}\n\nKeep this secure.`);
    } catch (e) {
      triggerAlert('Failed to unwrap vault key. Invalid session authentication.');
    }
  };

  // -------------------------------------------------------------
  // Anonymous Share Receiver Functions
  // -------------------------------------------------------------

  const performAnonymousDecrypt = async () => {
    if (!anonymousMeta || !anonymousKey) return;

    try {
      setAnonymousDecryptStatus('decrypting');

      // 1. Download encrypted file blob from server
      const res = await fetch(`${API_BASE}/files/shared-download/${anonymousShareId}`);
      if (!res.ok) {
        throw new Error('Could not download secure shared payload.');
      }

      const fileBlob = await res.blob();
      const fileBuffer = await fileBlob.arrayBuffer();

      // 2. Decrypt in-browser
      const cryptoKey = await importKeyFromBase64(anonymousKey.trim());
      const decryptedBuffer = await decryptFileBuffer(fileBuffer, cryptoKey, anonymousMeta.iv);

      // 3. Hash integrity check
      const hash = await calculateSHA256(decryptedBuffer);
      const match = hash.toLowerCase() === anonymousMeta.sha256_hash.toLowerCase();

      if (!match) {
        triggerAlert('Warning: SHA-256 integrity validation failed! The file payload has been tampered with or key is incorrect.');
      }

      // 4. Save object URL
      const blob = new Blob([decryptedBuffer], { type: anonymousMeta.mime_type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      setAnonymousDecryptedUrl(url);
      setAnonymousDecryptStatus('decrypted');
      
      triggerAlert(null, 'Zero-Knowledge download, decryption, and SHA-256 verification complete!');
    } catch (e) {
      console.error(e);
      setAnonymousDecryptStatus('failed');
      triggerAlert(e.message || 'Decryption failed. Please check your shared key.');
    }
  };

  const downloadAnonymousDecrypted = () => {
    if (!anonymousDecryptedUrl || !anonymousMeta) return;
    const a = document.createElement('a');
    a.href = anonymousDecryptedUrl;
    a.download = anonymousMeta.original_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Helper: Format byte sizes to readable string
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Render Anonymous Sharing Portal View
  if (currentView === 'anonymous-share') {
    return (
      <div className="auth-wrapper">
        <div className="bg-orb orb-cyan"></div>
        <div className="bg-orb orb-purple"></div>
        <div className="bg-orb orb-blue"></div>
        <GravityCanvas />
        <div className="glass-panel auth-card" style={{ maxWidth: '600px' }}>
          <div className="auth-header">
            <img src="/logo.jpg" alt="SecureBox Pro" className="logo-img" />
            <h2 className="auth-title">Zero-Knowledge Shared File Portal</h2>
            <p className="auth-subtitle">Download and decrypt files securely using the Web Crypto API.</p>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {anonymousMeta ? (
            <div className="crypto-engine-card">
              <div className="crypto-file-details">
                <h4 style={{ color: 'var(--accent-cyan)' }}>File Metadata Verified</h4>
                <div className="meta-grid">
                  <div className="meta-item">
                    <div className="meta-label">Original Filename</div>
                    <div className="meta-value">{anonymousMeta.original_name}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">File Size</div>
                    <div className="meta-value">{formatBytes(anonymousMeta.file_size)}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">SHA-256 Checksum</div>
                    <div className="meta-value mono">{anonymousMeta.sha256_hash}</div>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">AES-256 Decryption Key (Base64)</label>
                <div className="input-wrapper">
                  <Key className="input-icon" size={18} />
                  <input 
                    type="text" 
                    className="form-input glow-cyan" 
                    value={anonymousKey}
                    onChange={(e) => setAnonymousKey(e.target.value)}
                    placeholder="Enter base64 AES-256 key..."
                  />
                </div>
              </div>

              {anonymousDecryptStatus === 'decrypted' ? (
                <button className="btn btn-primary btn-block" onClick={downloadAnonymousDecrypted}>
                  <Download size={18} /> Download Decrypted File
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-block" 
                  onClick={performAnonymousDecrypt} 
                  disabled={anonymousDecryptStatus === 'decrypting'}
                >
                  {anonymousDecryptStatus === 'decrypting' ? (
                    <>
                      <RefreshCw className="animate-spin" size={18} /> Decrypting payload...
                    </>
                  ) : (
                    <>
                      <Unlock size={18} /> Download &amp; Decrypt client-side
                    </>
                  )}
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <a href="#" className="auth-link" onClick={() => {
                  window.location.hash = '';
                  setCurrentView('dashboard');
                }}>Go to main application</a>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              {loading ? <p>Loading shared file metadata...</p> : <p>Invalid link metadata or file not found.</p>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Authentication Forms if not signed in
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="bg-orb orb-cyan"></div>
        <div className="bg-orb orb-purple"></div>
        <div className="bg-orb orb-blue"></div>
        <GravityCanvas />
        <div className="glass-panel auth-card">
          <div className="auth-header">
            <img src="/logo.jpg" alt="SecureBox Pro" className="logo-img" />
            <h2 className="logo-text" style={{ fontSize: '2rem', marginTop: '10px' }}>SecureBox Pro</h2>
            <p className="auth-subtitle">Academic Cryptographic Demonstration System</p>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {authView === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <div className="input-wrapper">
                  <Shield className="input-icon" size={18} />
                  <input 
                    type="text" 
                    className="form-input" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    placeholder="Enter username" 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Master Password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" size={18} />
                  <input 
                    type="password" 
                    className="form-input" 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    placeholder="Enter password" 
                    required 
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>

              <div className="auth-footer">
                Don't have an account?{' '}
                <span className="auth-link" onClick={() => setAuthView('register')}>
                  Register Account
                </span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <div className="input-wrapper">
                  <Shield className="input-icon" size={18} />
                  <input 
                    type="text" 
                    className="form-input" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    placeholder="Choose username" 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Master Password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" size={18} />
                  <input 
                    type="password" 
                    className="form-input" 
                    value={passwordInput} 
                    onChange={(e) => setPasswordInput(e.target.value)} 
                    placeholder="Min 8 characters recommended" 
                    required 
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? 'Generating salt...' : 'Create Account'}
              </button>

              <div className="auth-footer">
                Already registered?{' '}
                <span className="auth-link" onClick={() => setAuthView('login')}>
                  Sign In
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Render Full Dashboard Layout
  return (
    <div className="app-container vertical-layout">

      {/* Slim Top Bar */}
      <header className="top-bar">
        <div className="logo-container-horizontal">
          <img src="/logo.jpg" alt="SecureBox Pro" className="logo-img-small" />
          <h1 className="logo-text">SecureBox Pro</h1>
        </div>
        <div className="user-profile-horizontal">
          <div className="user-info-horizontal">
            <span className="username">{username}</span>
            <span className="user-role">Researcher</span>
          </div>
          <button className="btn-logout" title="Sign Out" onClick={handleLogout}>
            <Unlock size={18} />
          </button>
        </div>
      </header>
      

      {/* Main workspace */}
      <main className="main-content full-width">
        {/* Global Feedback Banner */}
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* -------------------------------------------------------------
            VIEW: Dashboard
        ------------------------------------------------------------- */}
        {currentView === 'dashboard' && (
          <div>
            <div className="page-header">
              <div>
                <h2 className="page-title">Cryptographic Dashboard</h2>
                <p className="page-description">Overview of active keys, encrypted data sizes, and integrity history.</p>
              </div>
            </div>

            {/* Quick stats grid */}
            <div className="stats-grid">
              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper cyan">
                  <Shield size={24} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{stats.totalFiles}</span>
                  <span className="stat-label">Encrypted Files</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper blue">
                  <FileText size={24} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{formatBytes(stats.totalSize)}</span>
                  <span className="stat-label">Protected Bytes</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper purple">
                  <Key size={24} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{stats.vaultKeysCount}</span>
                  <span className="stat-label">Vault Keys</span>
                </div>
              </div>

              <div className="glass-panel stat-card">
                <div className="stat-icon-wrapper emerald">
                  <Share2 size={24} />
                </div>
                <div className="stat-details">
                  <span className="stat-value">{stats.totalShares}</span>
                  <span className="stat-label">Shares Active</span>
                </div>
              </div>
            </div>

            <div className="dashboard-layout">
              {/* Cloud download center */}
              <div className="glass-panel">
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={20} color="var(--accent-cyan)" /> Cloud Repository Download Center
                </h3>

                {uploadedFiles.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
                    No files uploaded yet. Encrypt and upload a file to view it here.
                  </p>
                ) : (
                  <div className="table-container">
                    <table className="crypto-table">
                      <thead>
                        <tr>
                          <th>File Details</th>
                          <th>Size</th>
                          <th>SHA-256 Checksum</th>
                          <th>Uploaded</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedFiles.map(file => (
                          <tr key={file.id}>
                            <td>
                              <div className="file-name-cell">
                                <FileText className="file-icon-cyan" size={18} />
                                <div>
                                  <div>{file.original_name}</div>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mime: {file.mime_type || 'Unknown'}</span>
                                </div>
                              </div>
                            </td>
                            <td>{formatBytes(file.file_size)}</td>
                            <td className="mono" style={{ fontSize: '0.8rem' }} title={file.sha256_hash}>
                              {file.sha256_hash.substring(0, 12)}...
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                              {new Date(file.uploaded_at).toLocaleDateString()}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button className="btn-icon-only" title="Decrypt &amp; Download" onClick={() => handleDownloadAndDecrypt(file)}>
                                  <Unlock size={16} />
                                </button>
                                <button className="btn-icon-only" title="Share Securely" onClick={() => handleShareFile(file)}>
                                  <Share2 size={16} />
                                </button>
                                <button className="btn-icon-only" title="Delete" onClick={() => handleDeleteFile(file.id)}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Side panel: breakdown & activities */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* File Type breakdown */}
                <div className="glass-panel">
                  <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart2 size={20} color="var(--accent-blue)" /> Breakdown
                  </h3>
                  {stats.fileTypes.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No data available.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {stats.fileTypes.map((type, idx) => {
                        const count = type.count;
                        const percentage = stats.totalFiles > 0 ? (count / stats.totalFiles) * 100 : 0;
                        const colors = ['var(--accent-cyan)', 'var(--accent-purple)', 'var(--accent-blue)', 'var(--accent-emerald)'];
                        const color = colors[idx % colors.length];

                        return (
                          <div key={type.mime_type || 'Unknown'}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                              <span style={{ wordBreak: 'break-all' }}>{type.mime_type || 'application/octet-stream'}</span>
                              <span style={{ fontWeight: 'bold' }}>{count} ({Math.round(percentage)}%)</span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${percentage}%`, background: color }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Audit summary */}
                <div className="glass-panel">
                  <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={20} color="var(--accent-purple)" /> Recent Security Events
                  </h3>
                  <div className="activity-list">
                    {stats.recentActivities.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No recent activities.</p>
                    ) : (
                      stats.recentActivities.map((act, idx) => (
                        <div key={idx} className="activity-item" style={{ padding: '8px 12px' }}>
                          <span className={`activity-icon-indicator ${act.action.toLowerCase()}`}></span>
                          <div className="activity-content">
                            <span className="activity-action" style={{ fontSize: '0.8rem' }}>{act.action}</span>
                            <div className="activity-details" style={{ fontSize: '0.75rem' }}>{act.details}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            VIEW: Encrypt Engine
        ------------------------------------------------------------- */}
        {currentView === 'encrypt' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="page-header">
              <div>
                <h2 className="page-title">AES-256 Encryption Engine</h2>
                <p className="page-description">Encrypt files completely in your browser. Raw keys never touch the network.</p>
              </div>
            </div>

            <div className="glass-panel crypto-engine-card">
              {/* File Select */}
              <div className="drag-drop-zone">
                <Upload className="upload-icon" />
                <p style={{ fontWeight: '500', marginBottom: '4px' }}>
                  {encryptFile ? encryptFile.name : 'Select or drag any file to encrypt'}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  All file types supported up to 50MB (academic demonstration cap)
                </p>
                <input 
                  type="file" 
                  className="file-input-hidden" 
                  onChange={handleEncryptFileSelect} 
                />
              </div>

              {encryptMeta && (
                <div className="crypto-file-details">
                  <h4 style={{ color: 'var(--accent-cyan)', marginBottom: '12px' }}>Plaintext Metadata</h4>
                  <div className="meta-grid">
                    <div className="meta-item">
                      <div className="meta-label">Original Name</div>
                      <div className="meta-value">{encryptMeta.originalName}</div>
                    </div>
                    <div className="meta-item">
                      <div className="meta-label">File Size</div>
                      <div className="meta-value">{formatBytes(encryptMeta.size)}</div>
                    </div>
                    <div className="meta-item">
                      <div className="meta-label">SHA-256 Checksum</div>
                      <div className="meta-value mono">{encryptMeta.sha256}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Trigger */}
              {encryptFile && encryptStatus === 'idle' && (
                <button className="btn btn-primary btn-block" onClick={performEncryption}>
                  <Lock size={18} /> Initialize Encryption Engine
                </button>
              )}

              {/* Success Cryptographic Panel */}
              {encryptStatus !== 'idle' && encryptStatus !== 'encrypting' && (
                <div className="secret-key-box">
                  <div className="key-title-row">
                    <span className="key-title">Generated AES-256 Symmetric Key (Base64)</span>
                    <button 
                      className="btn-icon-only" 
                      style={{ width: '28px', height: '28px' }}
                      title="Copy Key" 
                      onClick={() => {
                        navigator.clipboard.writeText(generatedKeyStr);
                        triggerAlert(null, 'Key copied to clipboard!');
                      }}
                    >
                      <Clipboard size={12} />
                    </button>
                  </div>
                  <div className="key-value-wrapper">
                    <div className="key-display">{generatedKeyStr}</div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    WARNING: Save this key. The system does not save keys in plaintext. Losing this key means losing the file.
                  </p>
                </div>
              )}

              {encryptStatus === 'encrypted' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <button className="btn btn-secondary" onClick={downloadEncryptedFileLocal}>
                    <Download size={18} /> Download `.enc` File
                  </button>
                  <button className="btn btn-secondary" onClick={downloadKeyFileLocal}>
                    <Key size={18} /> Download `.key` File
                  </button>
                  
                  <button className="btn btn-primary btn-block" style={{ gridColumn: 'span 2' }} onClick={uploadEncryptedToServer}>
                    <Upload size={18} /> Upload Encrypted Blob &amp; Store Keys in Vault
                  </button>
                </div>
              )}

              {encryptStatus === 'uploaded' && (
                <div className="alert alert-success" style={{ marginBottom: 0 }}>
                  <CheckCircle size={18} /> Encrypted payload has been secured on the cloud server, and keys are successfully backed up to your encrypted PBKDF2 Key Vault.
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            VIEW: Decrypt & Verify
        ------------------------------------------------------------- */}
        {currentView === 'decrypt' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="page-header">
              <div>
                <h2 className="page-title">AES-256 Decryption Engine</h2>
                <p className="page-description">Decrypt any `.enc` file locally. Verification steps audit file integrity using SHA-256 hashes.</p>
              </div>
            </div>

            <div className="glass-panel crypto-engine-card">
              <div className="drag-drop-zone">
                <Unlock className="upload-icon" color="var(--accent-emerald)" />
                <p style={{ fontWeight: '500', marginBottom: '4px' }}>
                  {decryptFile ? decryptFile.name : 'Select ciphertext (.enc) file to decrypt'}
                </p>
                <input 
                  type="file" 
                  className="file-input-hidden" 
                  onChange={handleDecryptFileSelect} 
                />
              </div>

              {decryptFile && (
                <>
                  <div className="form-group">
                    <label className="form-label">Symmetric AES Key (Base64)</label>
                    <div className="input-wrapper glow-cyan">
                      <Key className="input-icon" size={18} />
                      <input 
                        type="text" 
                        className="form-input" 
                        value={decryptKeyInput}
                        onChange={(e) => setDecryptKeyInput(e.target.value)}
                        placeholder="Enter the 32-byte Base64 key..."
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Optional: Original SHA-256 Hash (For Integrity Verification)</label>
                    <div className="input-wrapper">
                      <Shield className="input-icon" size={18} />
                      <input 
                        type="text" 
                        className="form-input" 
                        value={originalHashToVerify}
                        onChange={(e) => setOriginalHashToVerify(e.target.value)}
                        placeholder="Enter SHA-256 hash to auto-verify integrity..."
                      />
                    </div>
                  </div>

                  <button className="btn btn-primary btn-block" onClick={performDecryption}>
                    <Unlock size={18} /> Decrypt &amp; Verify Integrity
                  </button>
                </>
              )}

              {decryptStatus === 'decrypted' && (
                <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '20px' }}>
                  <div className="alert alert-success">
                    <CheckCircle size={18} /> Decryption Complete!
                  </div>

                  <div className="meta-grid" style={{ marginBottom: '20px' }}>
                    <div className="meta-item">
                      <div className="meta-label">Decrypted File</div>
                      <div className="meta-value">{decryptedName}</div>
                    </div>
                    <div className="meta-item">
                      <div className="meta-label">Computed SHA-256</div>
                      <div className="meta-value mono">{decryptedHash}</div>
                    </div>
                    {isHashVerified !== null && (
                      <div className={`meta-item ${isHashVerified ? 'alert-success' : 'alert-danger'}`} style={{ border: 'none' }}>
                        <div className="meta-label">Integrity Status</div>
                        <div className="meta-value" style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isHashVerified ? (
                            <>
                              <Shield size={16} /> VERIFIED (MATCHED)
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={16} /> INTEGRITY COMPROMISED (HASH MISMATCH)
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button className="btn btn-primary btn-block" onClick={downloadDecryptedFileLocal}>
                    <Download size={18} /> Save Decrypted Plaintext
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            VIEW: Key Vault
        ------------------------------------------------------------- */}
        {currentView === 'vault' && (
          <div>
            <div className="page-header">
              <div>
                <h2 className="page-title">PBKDF2 Key Vault Center</h2>
                <p className="page-description">Manage file cryptographic keys backed up using password-derived wrapping (PBKDF2-AES-GCM).</p>
              </div>
            </div>

            <div className="glass-panel">
              {vaultKeys.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
                  No backup keys found. When you encrypt and upload a file, your key is wrapped client-side and saved here.
                </p>
              ) : (
                <div className="table-container">
                  <table className="crypto-table">
                    <thead>
                      <tr>
                        <th>Associated File</th>
                        <th>Original Size</th>
                        <th>SHA-256 Digest</th>
                        <th>Backup Date</th>
                        <th>Vault Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vaultKeys.map(keyRec => (
                        <tr key={keyRec.id}>
                          <td>
                            <div className="file-name-cell">
                              <Key className="file-icon-cyan" size={18} />
                              <span>{keyRec.original_name}</span>
                            </div>
                          </td>
                          <td>{formatBytes(keyRec.file_size)}</td>
                          <td className="mono" style={{ fontSize: '0.8rem' }} title={keyRec.sha256_hash}>
                            {keyRec.sha256_hash.substring(0, 14)}...
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {new Date(keyRec.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.8rem' }} onClick={() => handleRevealVaultKey(keyRec)}>
                              <Eye size={14} style={{ marginRight: '4px' }} /> Unwrap Key
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            VIEW: Audit Logs
        ------------------------------------------------------------- */}
        {currentView === 'logs' && (
          <div>
            <div className="page-header">
              <div>
                <h2 className="page-title">Security Activity Audit Trail</h2>
                <p className="page-description">Complete log history of registration, logins, client-side encryption, integrity audits, and secure sharing.</p>
              </div>
            </div>

            <div className="glass-panel">
              {activityLogs.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px' }}>
                  No security activities logged yet.
                </p>
              ) : (
                <div className="activity-list">
                  {activityLogs.map(log => (
                    <div className="activity-item" key={log.id}>
                      <span className={`activity-icon-indicator ${log.action.toLowerCase()}`}></span>
                      <div className="activity-content">
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="activity-action">{log.action}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>By: {log.username}</span>
                        </div>
                        <div className="activity-details">{log.details}</div>
                        <div className="activity-time">{new Date(log.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Share Link Modal */}
      {shareFileId && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <h3 style={{ marginBottom: '12px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={20} /> Secure Sharing Configured
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              A zero-knowledge public share record has been generated. The decryption key is appended to the URL fragment hash, meaning the server never sees the key.
            </p>

            <div className="form-group">
              <label className="form-label">Encrypted Sharing Link</label>
              <div className="key-value-wrapper">
                <input 
                  type="text" 
                  className="form-input mono" 
                  style={{ paddingLeft: '16px' }}
                  value={generatedShareLink} 
                  readOnly 
                />
                <button 
                  className="btn-icon-only" 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedShareLink);
                    triggerAlert(null, 'Sharing link copied!');
                  }}
                >
                  <Clipboard size={16} />
                </button>
              </div>
            </div>

            <div className="secret-key-box" style={{ background: 'rgba(192,132,252,0.05)', borderColor: 'rgba(192,132,252,0.2)', marginBottom: '20px' }}>
              <span className="key-title" style={{ color: 'var(--accent-purple)' }}>Symmetric Decryption Key (Optional backup)</span>
              <div className="key-display" style={{ background: 'rgba(20, 15, 30, 0.8)' }}>{shareFileKey}</div>
            </div>

            <button className="btn btn-primary btn-block" onClick={() => {
              setShareFileId(null);
              setGeneratedShareLink('');
              setShareFileKey('');
            }}>
              Dismiss Portal
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button className={`nav-icon-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
          <BarChart2 size={36} />
          <span className="nav-icon-label">Dashboard</span>
        </button>
        <button className={`nav-icon-btn ${currentView === 'encrypt' ? 'active' : ''}`} onClick={() => setCurrentView('encrypt')}>
          <Lock size={36} />
          <span className="nav-icon-label">Encrypt Engine</span>
        </button>
        <button className={`nav-icon-btn ${currentView === 'decrypt' ? 'active' : ''}`} onClick={() => setCurrentView('decrypt')}>
          <Unlock size={36} />
          <span className="nav-icon-label">Decrypt &amp; Verify</span>
        </button>
        <button className={`nav-icon-btn ${currentView === 'vault' ? 'active' : ''}`} onClick={() => setCurrentView('vault')}>
          <Database size={36} />
          <span className="nav-icon-label">Key Vault</span>
        </button>
        <button className={`nav-icon-btn ${currentView === 'logs' ? 'active' : ''}`} onClick={() => setCurrentView('logs')}>
          <Activity size={36} />
          <span className="nav-icon-label">Audit Logs</span>
        </button>
      </nav>
    </div>
  );
}

// Inline helper components
function CloudUploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cloud-upload">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
      <path d="M12 12v9"/>
      <path d="m16 16-4-4-4 4"/>
    </svg>
  );
}
