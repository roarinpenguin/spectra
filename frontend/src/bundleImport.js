/**
 * SPECTRA Case Bundle importer (v1.2+).
 *
 * Reads a ZIP produced by `bundleExport.js` back into the browser:
 *   - parses `manifest.json` (preferred) to learn what's inside and which
 *     schema version the bundle was written with;
 *   - restores the structured conversation from `messages.json`;
 *   - (optionally) restores every evidence into IndexedDB, reusing the
 *     original ids where possible and handling SHA-256 collisions by
 *     skipping (de-dup) instead of duplicating bytes;
 *   - persists the investigation to localStorage via `storage.saveInvestigation`.
 *
 * The importer is conservative and never overwrites existing data without an
 * explicit `onConflict` decision supplied by the caller:
 *
 *   onConflict({ kind: 'investigation', existing, incoming })
 *     -> 'replace' | 'rename' | 'cancel'
 *
 *   onConflict({ kind: 'evidence', existing, incoming })
 *     -> 'skip' | 'add'          (default: 'skip' when sha256 matches)
 */

import { unzipSync, strFromU8 } from 'fflate'
import * as storage from './storage'
import * as evidenceStore from './evidenceStore'

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function sha256Hex(bytes) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return ''
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

function tryParseJson(bytes) {
  try { return JSON.parse(strFromU8(bytes)) } catch { return null }
}

function validateMessages(arr) {
  if (!Array.isArray(arr)) return false
  return arr.every((m) =>
    m && typeof m === 'object' &&
    typeof m.content === 'string' &&
    (typeof m.isUser === 'boolean' || m.isUser === undefined)
  )
}

/**
 * Best-effort reconstruction of messages from `conversation.md` for bundles
 * that don't ship a canonical `messages.json` (pre-v2 exports, or redacted
 * exports). Only the content, role, agent and timestamp round-trip; thought
 * process, tool calls and evidence links are NOT recovered.
 *
 * The renderer's format is:
 *
 *   # <title>
 *   *Exported ...*
 *   *Console: ...*
 *   *LLM: ...*
 *
 *   ---
 *
 *   ## <role>[ · <timestamp>]
 *
 *   <content lines ...>
 *
 *   _Tools used: ..._         (optional)
 *   <details>...</details>    (optional)
 *   **Evidence:**             (optional)
 *   - ...
 *
 *   ---
 */
function parseConversationMarkdown(md) {
  if (typeof md !== 'string' || md.length === 0) return null
  const blocks = md.split(/\n---\n/g).map((b) => b.trim()).filter(Boolean)
  if (blocks.length < 2) return null
  // blocks[0] is the header with the title and meta; everything else is a
  // message block starting with `## <role>`.
  const out = []
  for (let i = 1; i < blocks.length; i += 1) {
    const lines = blocks[i].split('\n')
    if (!lines[0] || !lines[0].startsWith('## ')) continue
    const header = lines[0].slice(3).trim()
    // Strip trailing timestamp after the last ' · '.
    let role = header
    let timestamp = null
    const sepIdx = header.lastIndexOf(' · ')
    if (sepIdx !== -1) {
      role = header.slice(0, sepIdx).trim()
      timestamp = header.slice(sepIdx + 3).trim() || null
    }
    const isUser = /^user$/i.test(role)
    let agent = null
    if (!isUser) {
      // "SPECTRA — <agent>" or plain "SPECTRA"
      const m = role.match(/^SPECTRA\s+[—-]\s+(.+)$/i)
      if (m) agent = m[1].trim()
    }
    // Content ends at the first of: _Tools used:_, <details>, **Evidence:**
    const bodyLines = []
    for (let j = 1; j < lines.length; j += 1) {
      const ln = lines[j]
      if (
        ln.startsWith('_Tools used:') ||
        ln.startsWith('<details>') ||
        ln.startsWith('**Evidence:**')
      ) break
      bodyLines.push(ln)
    }
    const content = bodyLines.join('\n').trim()
    if (!content) continue
    out.push({
      id: Date.now() + i,
      content,
      isUser,
      timestamp,
      agent,
      toolsUsed: [],
      thoughtProcess: null,
      totalMs: null,
      evidenceIds: [],
    })
  }
  return out.length ? out : null
}

/**
 * Infer the investigation's intended id. Prefer the manifest's
 * `conversationId`; fall back to the bundle file name (slug form) if missing.
 */
function inferInvestigationId(manifest, fileName) {
  if (manifest && typeof manifest.conversationId === 'string' && manifest.conversationId) {
    return manifest.conversationId
  }
  // Fall back to a shortened slug of the file name.
  const base = String(fileName || 'imported-case').replace(/\.zip$/i, '')
  return base.slice(0, 48)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inspect a ZIP file without committing anything — useful for the import UI
 * to show a preview ("2 evidences, 5 artefacts, title: …") and to let the
 * user decide how to handle conflicts.
 *
 * @param {File|Blob} file
 * @returns {Promise<{ manifest, messages, evidencesMeta, hasMessagesJson, fileName, existing }>}
 */
export async function inspectBundle(file) {
  if (!file) throw new Error('inspectBundle: file is required')
  const buf = new Uint8Array(await file.arrayBuffer())
  let entries
  try {
    entries = unzipSync(buf)
  } catch (e) {
    throw new Error(`Not a valid ZIP file: ${e.message || e}`)
  }

  const manifestBytes = entries['manifest.json']
  const manifest = manifestBytes ? tryParseJson(manifestBytes) : null

  const messagesBytes = entries['messages.json']
  let messages = messagesBytes ? tryParseJson(messagesBytes) : null
  let messagesSource = messagesBytes && validateMessages(messages) ? 'messages.json' : null
  // Fallback for pre-v2 / redacted exports: reconstruct from conversation.md.
  if (!messagesSource && entries['conversation.md']) {
    const md = strFromU8(entries['conversation.md'])
    const parsed = parseConversationMarkdown(md)
    if (parsed && parsed.length) {
      messages = parsed
      messagesSource = 'conversation.md'
    }
  }

  // Build evidence metadata list. Prefer sidecar .meta.json files; fall back
  // to manifest.evidences[] if sidecars are missing.
  const evidencesMeta = []
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith('evidences/')) continue
    if (!name.endsWith('.meta.json')) continue
    const meta = tryParseJson(bytes)
    if (!meta || typeof meta !== 'object') continue
    const payloadPath = 'evidences/' + String(meta.fileName || name.replace(/\.meta\.json$/, '').replace(/^evidences\//, ''))
    if (!entries[payloadPath]) continue
    evidencesMeta.push({ ...meta, _payloadPath: payloadPath })
  }
  if (evidencesMeta.length === 0 && manifest && Array.isArray(manifest.evidences)) {
    for (const meta of manifest.evidences) {
      const payloadPath = 'evidences/' + String(meta.fileName || '')
      if (!entries[payloadPath]) continue
      evidencesMeta.push({ ...meta, _payloadPath: payloadPath })
    }
  }

  // Look up whether an investigation with this id already exists.
  const incomingId = inferInvestigationId(manifest, file.name)
  const existingInvestigation = storage.getInvestigations().find((i) => i.id === incomingId) || null

  return {
    manifest,
    messages: validateMessages(messages) ? messages : null,
    messagesSource, // 'messages.json' (lossless) | 'conversation.md' (degraded) | null
    evidencesMeta,
    hasMessagesJson: !!messagesBytes,
    fileName: file.name,
    incomingId,
    existing: existingInvestigation,
    _entries: entries, // carried forward to importBundle; not part of the public contract
  }
}

/**
 * Commit a previously inspected bundle. `inspection` must come from
 * `inspectBundle`.
 *
 * @param {Object} params
 * @param {ReturnType<typeof inspectBundle>} params.inspection
 * @param {Function} [params.onConflict]
 * @param {Function} [params.onProgress]
 * @param {string}   [params.titleOverride]
 *
 * @returns {Promise<{ investigationId, addedEvidences, skippedEvidences }>}
 */
export async function importBundle({
  inspection,
  onConflict,
  onProgress,
  titleOverride,
}) {
  if (!inspection) throw new Error('importBundle: inspection is required')
  const { manifest, messages, evidencesMeta, existing, incomingId, _entries } = inspection
  if (!messages || messages.length === 0) {
    throw new Error(
      'This bundle contains no structured messages and no parseable conversation.md.'
    )
  }

  const progress = (m) => { try { onProgress?.(m) } catch {} }

  // --------------------------- investigation id ---------------------------
  let targetId = incomingId
  if (existing) {
    const decision = onConflict
      ? await onConflict({ kind: 'investigation', existing, incoming: { id: incomingId, manifest } })
      : 'rename'
    if (decision === 'cancel') {
      throw new Error('Import cancelled by user.')
    }
    if (decision === 'rename') {
      targetId = `${incomingId}-imp-${Math.random().toString(36).slice(2, 6)}`
    }
    // 'replace' keeps targetId = incomingId, overwriting the existing record.
  }

  // --------------------------- evidences ---------------------------
  progress('Restoring evidences…')
  const addedEvidences = []
  const skippedEvidences = []
  // Map original id -> restored id, so message.evidenceIds can be rewired.
  const idRemap = {}
  const existingForConv = await evidenceStore.listEvidences(targetId)
  const existingBySha = new Map(existingForConv.map((e) => [e.sha256, e]))

  for (const meta of evidencesMeta) {
    const payload = _entries[meta._payloadPath]
    if (!payload) continue
    // Re-compute hash so we trust bytes, not manifest claims.
    const actualSha = await sha256Hex(payload)
    if (meta.sha256 && meta.sha256 !== actualSha) {
      // Integrity problem — skip silently (logged).
      console.warn(`[bundleImport] sha256 mismatch for ${meta.name}; expected ${meta.sha256}, got ${actualSha}. Skipping.`)
      continue
    }

    const dup = existingBySha.get(actualSha)
    if (dup) {
      const decision = onConflict
        ? await onConflict({ kind: 'evidence', existing: dup, incoming: meta })
        : 'skip'
      if (decision === 'skip') {
        skippedEvidences.push({ name: meta.name, reason: 'already present (sha256 match)' })
        if (meta.id) idRemap[meta.id] = dup.id
        continue
      }
      // 'add' falls through to create a fresh row.
    }

    const blob = new Blob([payload], { type: meta.mime || 'application/octet-stream' })
    const file = new File([blob], meta.name || 'evidence', { type: meta.mime || 'application/octet-stream' })
    const restored = await evidenceStore.addEvidence({
      conversationId: targetId,
      file,
      note: meta.note || '',
      tags: meta.tags || [],
    })
    if (meta.id) idRemap[meta.id] = restored.id
    addedEvidences.push(restored)
  }

  // --------------------------- messages ---------------------------
  progress('Re-hydrating conversation…')
  const rehydratedMessages = messages.map((m) => {
    const nextIds = (m.evidenceIds || [])
      .map((id) => idRemap[id] || id)
      .filter(Boolean)
    return { ...m, evidenceIds: nextIds }
  })

  // --------------------------- investigation ---------------------------
  progress('Saving investigation…')
  const evidenceIds = Array.from(new Set(
    rehydratedMessages.flatMap((m) => m.evidenceIds || [])
  ))
  const inv = storage.saveInvestigation({
    id: targetId,
    title: titleOverride || (manifest && manifest.title) || 'Imported case',
    description: manifest && manifest.meta ? JSON.stringify(manifest.meta) : '',
    messages: rehydratedMessages,
    tags: ['imported'],
    evidenceIds,
  })

  progress('Done.')
  return {
    investigationId: inv.id,
    addedEvidences: addedEvidences.map((e) => ({ id: e.id, name: e.name, size: e.size })),
    skippedEvidences,
  }
}
