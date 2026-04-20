/**
 * SPECTRA browser storage (v1.1).
 *
 * In v1.1 the browser is the source of truth for ALL user state:
 *  - sessionId (stable per browser+origin)
 *  - destinations (SentinelOne consoles + their per-console MCP server URL + token)
 *  - active destination id
 *  - llm config (provider, model, api key)
 *  - investigation library
 *  - sensitive mode (do not persist secrets across reloads)
 *
 * The backend never stores any of this. This module:
 *  - reads/writes a single versioned localStorage key
 *  - exposes typed helpers for each slice of state
 *  - notifies subscribers on writes so React can react
 *  - honors a "sensitive mode" that keeps secrets in memory only
 */

const STORAGE_KEY = 'spectra:state:v1';
const SENSITIVE_FLAG_KEY = 'spectra:sensitive:v1';
const SCHEMA_VERSION = 1;

// In-memory fallback for sensitive mode
let memoryOnlySecrets = {
  destinationApiTokens: {}, // { [destId]: token }
  llmApiKey: '',
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: cryptoRandomId(),
    destinations: [],
    activeDestinationId: null,
    llm: { provider: 'openai', model: '', apiKey: '' },
    investigations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (shouldn't happen in modern browsers)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schemaVersion !== SCHEMA_VERSION) {
      // Future: migration logic. For now, accept any v1.
      parsed.schemaVersion = SCHEMA_VERSION;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRaw(state) {
  state.updatedAt = new Date().toISOString();
  try {
    if (isSensitiveMode()) {
      // Strip secrets before persisting; keep them in memory.
      const sanitized = JSON.parse(JSON.stringify(state));
      memoryOnlySecrets.llmApiKey = state.llm?.apiKey || memoryOnlySecrets.llmApiKey;
      sanitized.llm.apiKey = '';
      sanitized.destinations = sanitized.destinations.map((d) => {
        if (d.apiToken) {
          memoryOnlySecrets.destinationApiTokens[d.id] = d.apiToken;
        }
        return { ...d, apiToken: '' };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    notify();
  } catch (e) {
    // localStorage may throw on quota exceeded
    console.error('[storage] write failed:', e);
    throw e;
  }
}

function hydrateSecrets(state) {
  // When sensitive mode is on, the persisted blob has empty secrets;
  // re-attach in-memory copies so the running app keeps working until reload.
  if (!isSensitiveMode()) return state;
  const next = { ...state, llm: { ...state.llm } };
  if (memoryOnlySecrets.llmApiKey) next.llm.apiKey = memoryOnlySecrets.llmApiKey;
  next.destinations = state.destinations.map((d) => ({
    ...d,
    apiToken: memoryOnlySecrets.destinationApiTokens[d.id] || d.apiToken || '',
  }));
  return next;
}

let cached = null;
function load() {
  if (cached) return cached;
  cached = readRaw() || emptyState();
  // First-ever load: persist so the sessionId is stable
  if (!readRaw()) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cached)); } catch {}
  }
  cached = hydrateSecrets(cached);
  return cached;
}

function save(state) {
  cached = state;
  writeRaw(state);
}

// ---------------------------------------------------------------------------
// Subscribers (cheap pub/sub so React state can stay in sync)
// ---------------------------------------------------------------------------

const subscribers = new Set();
function notify() {
  for (const fn of subscribers) {
    try { fn(); } catch (e) { console.error('[storage] subscriber failed:', e); }
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ---------------------------------------------------------------------------
// Public API — getters
// ---------------------------------------------------------------------------

export function getSessionId() {
  return load().sessionId;
}

export function getState() {
  return load();
}

export function getDestinations() {
  return load().destinations;
}

export function getActiveDestination() {
  const s = load();
  return s.destinations.find((d) => d.id === s.activeDestinationId) || null;
}

export function getLLM() {
  return load().llm;
}

export function getInvestigations() {
  return load().investigations;
}

export function isSensitiveMode() {
  try { return localStorage.getItem(SENSITIVE_FLAG_KEY) === '1'; }
  catch { return false; }
}

// ---------------------------------------------------------------------------
// Public API — destinations
// ---------------------------------------------------------------------------

export function addDestination({ name, consoleUrl, apiToken, mcpServerUrl }) {
  const s = load();
  const now = new Date().toISOString();
  const id = cryptoRandomId().slice(0, 8);
  const dest = {
    id,
    name,
    consoleUrl,
    apiToken: apiToken || '',
    mcpServerUrl,
    createdAt: now,
    updatedAt: now,
    lastUsed: null,
  };
  s.destinations = [...s.destinations, dest];
  // First destination becomes active automatically
  if (!s.activeDestinationId) {
    s.activeDestinationId = id;
    dest.lastUsed = now;
  }
  save(s);
  return dest;
}

export function updateDestination(id, patch) {
  const s = load();
  s.destinations = s.destinations.map((d) => {
    if (d.id !== id) return d;
    const next = { ...d, updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.consoleUrl !== undefined) next.consoleUrl = patch.consoleUrl;
    if (patch.mcpServerUrl !== undefined) next.mcpServerUrl = patch.mcpServerUrl;
    // Empty token = keep existing
    if (patch.apiToken !== undefined && patch.apiToken !== '') next.apiToken = patch.apiToken;
    return next;
  });
  save(s);
  return s.destinations.find((d) => d.id === id);
}

export function deleteDestination(id) {
  const s = load();
  const wasActive = s.activeDestinationId === id;
  s.destinations = s.destinations.filter((d) => d.id !== id);
  if (wasActive) {
    // Promote the most-recently-used remaining one
    const sorted = [...s.destinations].sort((a, b) =>
      String(b.lastUsed || b.updatedAt || '').localeCompare(String(a.lastUsed || a.updatedAt || ''))
    );
    s.activeDestinationId = sorted[0]?.id || null;
    if (sorted[0]) sorted[0].lastUsed = new Date().toISOString();
  }
  save(s);
}

export function setActiveDestination(id) {
  const s = load();
  if (!s.destinations.find((d) => d.id === id)) return null;
  s.activeDestinationId = id;
  s.destinations = s.destinations.map((d) =>
    d.id === id ? { ...d, lastUsed: new Date().toISOString() } : d
  );
  save(s);
  return getActiveDestination();
}

// ---------------------------------------------------------------------------
// Public API — LLM
// ---------------------------------------------------------------------------

export function setLLM(patch) {
  const s = load();
  s.llm = { ...s.llm, ...patch };
  save(s);
  return s.llm;
}

// ---------------------------------------------------------------------------
// Public API — investigations
// ---------------------------------------------------------------------------

export function saveInvestigation({ id, title, description, messages, tags, evidenceIds }) {
  const s = load();
  const now = new Date().toISOString();
  if (id && s.investigations.find((i) => i.id === id)) {
    s.investigations = s.investigations.map((i) => {
      if (i.id !== id) return i;
      return {
        ...i,
        title,
        description,
        messages,
        tags,
        evidenceIds: evidenceIds !== undefined ? evidenceIds : (i.evidenceIds || []),
        updated_at: now,
      };
    });
    save(s);
    return s.investigations.find((i) => i.id === id);
  }
  // Honor a caller-supplied id when creating; this lets evidences be bound
  // to the eventual investigation id from the very first attachment.
  const newId = id || cryptoRandomId().slice(0, 8);
  const inv = {
    id: newId,
    title,
    description: description || '',
    messages: messages || [],
    tags: tags || [],
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : [],
    created_at: now,
    updated_at: now,
  };
  s.investigations = [...s.investigations, inv];
  save(s);
  return inv;
}

/**
 * Attach/detach evidence ids on an existing investigation without touching
 * the other fields. If the investigation does not yet exist (draft session),
 * callers should keep the ids in React state and persist them on the next
 * `saveInvestigation` call.
 */
export function setInvestigationEvidenceIds(id, evidenceIds) {
  if (!id) return null;
  const s = load();
  const inv = s.investigations.find((i) => i.id === id);
  if (!inv) return null;
  s.investigations = s.investigations.map((i) =>
    i.id === id
      ? { ...i, evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : [], updated_at: new Date().toISOString() }
      : i
  );
  save(s);
  return s.investigations.find((i) => i.id === id);
}

export function deleteInvestigation(id) {
  const s = load();
  s.investigations = s.investigations.filter((i) => i.id !== id);
  save(s);
}

// ---------------------------------------------------------------------------
// Public API — sensitive mode
// ---------------------------------------------------------------------------

export function setSensitiveMode(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(SENSITIVE_FLAG_KEY, '1');
      // Keep current secrets in memory and rewrite blob without them
      const s = load();
      memoryOnlySecrets.llmApiKey = s.llm.apiKey;
      memoryOnlySecrets.destinationApiTokens = {};
      for (const d of s.destinations) {
        if (d.apiToken) memoryOnlySecrets.destinationApiTokens[d.id] = d.apiToken;
      }
      writeRaw(s); // will strip secrets due to flag
    } else {
      localStorage.removeItem(SENSITIVE_FLAG_KEY);
      // Restore secrets from memory into the persisted blob
      const s = load();
      writeRaw(s);
    }
  } catch (e) {
    console.error('[storage] setSensitiveMode failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Public API — vault import/export
// ---------------------------------------------------------------------------

export function exportSnapshot() {
  // Always include hydrated secrets in the snapshot; encryption happens upstream.
  const s = load();
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: {
      sessionId: s.sessionId,
      destinations: s.destinations,
      activeDestinationId: s.activeDestinationId,
      llm: s.llm,
      investigations: s.investigations,
    },
  };
}

export function importSnapshot(snapshot, { mode = 'replace', keepSessionId = true } = {}) {
  if (!snapshot || !snapshot.state) throw new Error('Invalid snapshot');
  const incoming = snapshot.state;
  const current = load();

  let next;
  if (mode === 'merge') {
    // Merge by id; incoming wins on conflict
    const destMap = new Map(current.destinations.map((d) => [d.id, d]));
    for (const d of incoming.destinations || []) destMap.set(d.id, d);
    const invMap = new Map(current.investigations.map((i) => [i.id, i]));
    for (const i of incoming.investigations || []) invMap.set(i.id, i);
    next = {
      ...current,
      destinations: Array.from(destMap.values()),
      investigations: Array.from(invMap.values()),
      activeDestinationId: incoming.activeDestinationId || current.activeDestinationId,
      llm: incoming.llm || current.llm,
    };
  } else {
    // replace
    next = {
      ...emptyState(),
      sessionId: keepSessionId ? current.sessionId : (incoming.sessionId || cryptoRandomId()),
      destinations: incoming.destinations || [],
      activeDestinationId: incoming.activeDestinationId || null,
      llm: incoming.llm || { provider: 'openai', model: '', apiKey: '' },
      investigations: incoming.investigations || [],
    };
  }
  save(next);
  return next;
}

export function clearAll() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  cached = null;
  notify();
}
