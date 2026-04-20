/**
 * SPECTRA Vault crypto helpers (v1.1).
 *
 * Encrypts/decrypts a JSON snapshot of the user's localStorage state with
 * a passphrase, using only the browser's built-in Web Crypto API (no
 * third-party crypto libraries).
 *
 * Algorithm:
 *  - PBKDF2 (SHA-256, 600 000 iterations) derives a 256-bit key from the passphrase.
 *  - AES-GCM (256-bit, 96-bit IV) encrypts the JSON payload with a fresh random IV.
 *  - The wrapped envelope is itself JSON, so it's safe to email or store anywhere.
 *
 * Output envelope:
 *   {
 *     "format": "spectra-vault",
 *     "version": 1,
 *     "kdf":  { "alg": "PBKDF2-SHA256", "iterations": 600000, "saltB64": "..." },
 *     "enc":  { "alg": "AES-GCM-256",  "ivB64": "..." },
 *     "ciphertextB64": "..."
 *   }
 */

const PBKDF2_ITERS = 600_000;
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;
const SALT_LENGTH_BYTES = 16;
const VAULT_FORMAT = 'spectra-vault';
const VAULT_VERSION = 1;

// ---------------------------------------------------------------------------
// Base64 helpers (binary-safe)
// ---------------------------------------------------------------------------

function bytesToB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

async function deriveKey(passphrase, salt) {
  const subtle = window.crypto.subtle;
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a JSON-serializable payload with a passphrase. Returns the
 * envelope object ready to be stringified and downloaded.
 */
export async function encryptVault(payload, passphrase) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto API not available (HTTPS required)');
  }

  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveKey(passphrase, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    kdf: { alg: 'PBKDF2-SHA256', iterations: PBKDF2_ITERS, saltB64: bytesToB64(salt) },
    enc: { alg: 'AES-GCM-256', ivB64: bytesToB64(iv) },
    ciphertextB64: bytesToB64(ciphertext),
  };
}

/**
 * Decrypt an envelope (object or JSON string) with a passphrase.
 * Returns the original payload object.
 */
export async function decryptVault(envelopeOrJson, passphrase) {
  const env = typeof envelopeOrJson === 'string' ? JSON.parse(envelopeOrJson) : envelopeOrJson;
  if (!env || env.format !== VAULT_FORMAT) {
    throw new Error('Not a SPECTRA vault file');
  }
  if (env.version !== VAULT_VERSION) {
    throw new Error(`Unsupported vault version: ${env.version}`);
  }

  const salt = b64ToBytes(env.kdf.saltB64);
  const iv = b64ToBytes(env.enc.ivB64);
  const ciphertext = b64ToBytes(env.ciphertextB64);
  const key = await deriveKey(passphrase, salt);

  let plaintext;
  try {
    plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Wrong passphrase or corrupted vault');
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Convenience: trigger a browser download of a vault envelope as a JSON file.
 */
export function downloadVault(envelope, filename = null) {
  const fname = filename || `spectra-vault-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Convenience: trigger a download of a plaintext (UNENCRYPTED) snapshot.
 * Useful only when the user is OK with cleartext export.
 */
export function downloadPlain(snapshot, filename = null) {
  const fname = filename || `spectra-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Convenience: prompt the user for a JSON file and return its parsed contents.
 */
export function pickJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result))); }
        catch (e) { reject(new Error('File is not valid JSON')); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    };
    input.click();
  });
}
