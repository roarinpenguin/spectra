/**
 * SPECTRA evidence store (v1.2).
 *
 * Conversations can carry uploaded artefacts ("evidences") — binaries, JSON,
 * logs, PCAPs, screenshots, ZIPs, etc. localStorage is the wrong place for
 * bytes (5 MB cap, strings only), so evidences live in IndexedDB and are
 * referenced from investigations by `evidenceIds: string[]`.
 *
 * Schema (store `evidences`, keyPath `id`):
 *   { id, conversationId, name, mime, size, sha256,
 *     addedAt, tags, note, blob }
 *
 * Everything stays 100% browser-owned. No backend persistence.
 */

const DB_NAME = 'spectra-evidence';
const DB_VERSION = 1;
const STORE = 'evidences';

// Soft cap per conversation; UX warns the user past this.
export const EVIDENCE_PER_CONVERSATION_SOFT_CAP = 200 * 1024 * 1024; // 200 MB

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('conversationId', 'conversationId', { unique: false });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(mode = 'readonly') {
  return openDb().then((db) => {
    const transaction = db.transaction(STORE, mode);
    return transaction.objectStore(STORE);
  });
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function sha256Hex(arrayBuffer) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return [...new Uint8Array(hashBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Detect the "shape" of an evidence from its MIME/name.
 * The LLM wiring uses this to decide whether to inline the content or only
 * send metadata.
 */
export function classifyEvidence({ mime, name, size }) {
  const lower = (name || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml') return 'text';
  if (/\.(json|ya?ml|log|txt|csv|tsv|md|xml|ini|conf|sh|ps1|py|js|ts|sql)$/i.test(lower)) return 'text';
  if (m === 'application/zip' || /\.(zip|tar|gz|tgz|7z|rar)$/i.test(lower)) return 'archive';
  if (/\.(exe|dll|msi|so|dylib|bin|elf)$/i.test(lower)) return 'binary';
  return 'opaque';
}

// ---------------------------------------------------------------------------
// Subscribers — React can subscribe to evidence-list changes.
// ---------------------------------------------------------------------------

const subscribers = new Set();
function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch (e) { console.error('[evidenceStore] subscriber failed:', e); }
  }
}
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a File/Blob to a conversation. Returns the stored metadata (without the
 * blob) so callers can keep a lightweight summary in React state.
 */
export async function addEvidence({ conversationId, file, note = '', tags = [] }) {
  if (!file) throw new Error('addEvidence: file is required');
  const buf = await file.arrayBuffer();
  const sha256 = await sha256Hex(buf);
  const record = {
    id: cryptoRandomId(),
    conversationId: conversationId || null,
    name: file.name || 'unnamed',
    mime: file.type || 'application/octet-stream',
    size: file.size || buf.byteLength,
    sha256,
    addedAt: new Date().toISOString(),
    tags: Array.isArray(tags) ? tags : [],
    note: String(note || ''),
    blob: file instanceof Blob ? file : new Blob([buf], { type: file.type || 'application/octet-stream' }),
  };
  const store = await tx('readwrite');
  await promisifyRequest(store.add(record));
  notify();
  // Strip blob before returning — callers don't need it for list/state.
  const { blob: _blob, ...meta } = record;
  return meta;
}

export async function getEvidence(id, { includeBlob = false } = {}) {
  const store = await tx();
  const record = await promisifyRequest(store.get(id));
  if (!record) return null;
  if (!includeBlob) {
    const { blob: _blob, ...meta } = record;
    return meta;
  }
  return record;
}

export async function listEvidences(conversationId) {
  const store = await tx();
  const idx = store.index('conversationId');
  const records = await promisifyRequest(idx.getAll(conversationId));
  // Sort newest-first, strip blobs.
  return records
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

export async function listAllEvidences() {
  const store = await tx();
  const records = await promisifyRequest(store.getAll());
  return records.map(({ blob: _blob, ...meta }) => meta);
}

export async function updateEvidence(id, patch) {
  const store = await tx('readwrite');
  const current = await promisifyRequest(store.get(id));
  if (!current) throw new Error(`evidence ${id} not found`);
  const next = { ...current };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.note !== undefined) next.note = patch.note;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.conversationId !== undefined) next.conversationId = patch.conversationId;
  await promisifyRequest(store.put(next));
  notify();
  const { blob: _blob, ...meta } = next;
  return meta;
}

export async function deleteEvidence(id) {
  const store = await tx('readwrite');
  await promisifyRequest(store.delete(id));
  notify();
}

export async function deleteEvidencesForConversation(conversationId) {
  const ids = (await listEvidences(conversationId)).map((e) => e.id);
  const store = await tx('readwrite');
  await Promise.all(ids.map((id) => promisifyRequest(store.delete(id))));
  notify();
  return ids.length;
}

/** Total size in bytes for a given conversation — used by the UI quota meter. */
export async function conversationEvidenceSize(conversationId) {
  const list = await listEvidences(conversationId);
  return list.reduce((acc, e) => acc + (e.size || 0), 0);
}

/** Read a single evidence as text if it is reasonably small + text-like. */
export async function readEvidenceAsText(id, { maxBytes = 256 * 1024 } = {}) {
  const full = await getEvidence(id, { includeBlob: true });
  if (!full) return null;
  if (full.size > maxBytes) return null;
  const kind = classifyEvidence(full);
  if (kind !== 'text') return null;
  return await full.blob.text();
}

/** Read a single evidence as a data URL (for image preview / vision LLMs). */
export async function readEvidenceAsDataUrl(id) {
  const full = await getEvidence(id, { includeBlob: true });
  if (!full) return null;
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(full.blob);
  });
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
