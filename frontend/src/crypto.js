// Utility: ArrayBuffer to Base64
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Utility: Base64 to ArrayBuffer
export function base64ToBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Utility: ArrayBuffer to Hex String (for SHA-256 display)
export function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate a random AES-256 key (CryptoKey)
export async function generateAESKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

// Export CryptoKey to Base64 String
export async function exportKeyToBase64(key) {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return bufferToBase64(exported);
}

// Import CryptoKey from Base64 String
export async function importKeyFromBase64(base64Key) {
  const rawKey = base64ToBuffer(base64Key);
  return await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

// Calculate SHA-256 Hash of an ArrayBuffer
export async function calculateSHA256(arrayBuffer) {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
  return bufferToHex(hashBuffer);
}

// Encrypt File buffer using AES-GCM
// Returns { ciphertextBuffer: ArrayBuffer, ivBase64: String }
export async function encryptFileBuffer(arrayBuffer, cryptoKey) {
  // Generate random 12-byte IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    arrayBuffer
  );

  return {
    ciphertextBuffer,
    ivBase64: bufferToBase64(iv)
  };
}

// Decrypt File buffer using AES-GCM
// Returns ArrayBuffer (plaintext)
export async function decryptFileBuffer(ciphertextBuffer, cryptoKey, ivBase64) {
  const iv = new Uint8Array(base64ToBuffer(ivBase64));
  
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    ciphertextBuffer
  );
}

// Generate a random salt for a new user
export function generateSalt() {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return bufferToBase64(salt);
}

// Derive a KEK (Key Encrypting Key) from user password using PBKDF2
async function derivePBKDF2Key(password, saltBase64) {
  const enc = new TextEncoder();
  const passwordBuffer = enc.encode(password);
  const salt = new Uint8Array(base64ToBuffer(saltBase64));

  // Import raw password as key material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  // Derive master key
  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // KEK is not extractable (highly secure!)
    ['encrypt', 'decrypt']
  );
}

// Wrap a File AES key (string representation) using user's password KEK
// Returns { encryptedKeyBase64: String, keyIvBase64: String }
export async function wrapKeyForVault(aesKeyBase64, password, saltBase64) {
  const KEK = await derivePBKDF2Key(password, saltBase64);
  const textEncoder = new TextEncoder();
  const rawKeyBytes = textEncoder.encode(aesKeyBase64);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    KEK,
    rawKeyBytes
  );

  return {
    encryptedKeyBase64: bufferToBase64(encryptedKeyBuffer),
    keyIvBase64: bufferToBase64(iv)
  };
}

// Unwrap a File AES key (string representation) using user's password KEK
// Returns aesKeyBase64 (String)
export async function unwrapKeyFromVault(encryptedKeyBase64, keyIvBase64, password, saltBase64) {
  const KEK = await derivePBKDF2Key(password, saltBase64);
  const encryptedKeyBuffer = base64ToBuffer(encryptedKeyBase64);
  const iv = new Uint8Array(base64ToBuffer(keyIvBase64));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    KEK,
    encryptedKeyBuffer
  );

  const textDecoder = new TextDecoder();
  return textDecoder.decode(decryptedBuffer);
}
