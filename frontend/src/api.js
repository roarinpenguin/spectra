/**
 * SPECTRA API client (v1.1).
 *
 * All backend requests go through this module so we can transparently
 * attach the per-browser X-Spectra-Session-Id header AND, for endpoints
 * that need it, the inline `session_config` derived from localStorage.
 *
 * The backend is stateless w.r.t. user data — it reconstructs the
 * RequestConfig from this payload on every call.
 */

import { getSessionId, getActiveDestination, getLLM } from './storage';

const SESSION_HEADER = 'X-Spectra-Session-Id';

/**
 * Build the session_config payload from current localStorage state.
 * Returns null if there is no active destination (caller decides what to do).
 */
export function currentSessionConfig() {
  const dest = getActiveDestination();
  const llm = getLLM();
  if (!dest) return null;
  return {
    mcp_server_url: dest.mcpServerUrl,
    llm: {
      provider: llm.provider || 'openai',
      model: llm.model || '',
      api_key: llm.apiKey || '',
    },
  };
}

function baseHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    [SESSION_HEADER]: getSessionId(),
    ...extra,
  };
}

async function parseResponse(res) {
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = (data && data.detail) || (typeof data === 'string' ? data : `HTTP ${res.status}`);
    const err = new Error(detail);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

export async function get(path) {
  const res = await fetch(path, { headers: baseHeaders() });
  return parseResponse(res);
}

export async function post(path, body = {}, { withSessionConfig = true } = {}) {
  const finalBody = { ...body };
  if (withSessionConfig) {
    const cfg = currentSessionConfig();
    if (!cfg) {
      throw new Error('No active console configured. Open Settings → Consoles.');
    }
    finalBody.session_config = cfg;
  }
  const res = await fetch(path, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify(finalBody),
  });
  return parseResponse(res);
}

// ---------------------------------------------------------------------------
// Endpoint-specific helpers (for clarity at call sites)
// ---------------------------------------------------------------------------

export const api = {
  // Static
  health: () => get('/health'),
  models: () => get('/api/settings/models'),
  // Live model discovery per API key. The key is sent once and NOT stored
  // server-side; the backend proxies to the provider's list-models endpoint.
  refreshModels: (provider, apiKey) =>
    post('/api/settings/models/refresh', { provider, api_key: apiKey }, { withSessionConfig: false }),
  agents: () => get('/api/agents'),
  categories: () => get('/api/categories'),
  logs: (lines = 200) => get(`/api/logs?container=all&lines=${lines}`),
  metrics: () => get('/api/metrics'),
  legacyBootstrap: () => get('/api/legacy/bootstrap'),

  // Per-session (need session_config)
  mcpHealth: () => post('/api/mcp-health', {}),
  listTools: () => post('/api/tools', {}),
  callTool: (tool_name, args) => post('/api/tool', { tool_name, arguments: args || {} }),
  query: (query, conversation_history = null) =>
    post('/api/query', { query, conversation_history }),
  purpleAi: (query) => post('/api/purple-ai', { query }),
};

/**
 * SSE streaming wrapper for /api/query — returns an EventSource-like
 * iterator using fetch + ReadableStream so we can attach headers.
 */
export async function streamQuery(query, conversation_history, onEvent) {
  const cfg = currentSessionConfig();
  if (!cfg) throw new Error('No active console configured.');
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: baseHeaders({ Accept: 'text/event-stream' }),
    body: JSON.stringify({ query, conversation_history, session_config: cfg }),
  });
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const txt = await res.text();
      const maybe = JSON.parse(txt);
      if (maybe?.detail) detail = maybe.detail;
    } catch {
      // non-JSON body; stick with HTTP status
    }
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = raw.split('\n');
      let evt = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) evt = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      try { onEvent({ event: evt, data: data ? JSON.parse(data) : null }); }
      catch { onEvent({ event: evt, data: null, raw: data }); }
    }
  }
}
