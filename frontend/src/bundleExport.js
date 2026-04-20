/**
 * SPECTRA Case Bundle exporter (v1.2).
 *
 * A "case bundle" is a single ZIP combining everything a reviewer needs to
 * understand the investigation offline:
 *
 *   case-<slug>-<date>.zip
 *   ├── manifest.json      — schema, options used, file checksums
 *   ├── README.txt         — plain-English description
 *   ├── conversation.md    — Markdown rendering of the whole chat (always on)
 *   ├── conversation.pdf   — optional, already produced by jsPDF upstream
 *   ├── artefacts/         — one JSON per agent/tool artefact (thoughtProcess)
 *   └── evidences/         — original uploaded bytes + sidecar metadata
 *
 * The user picks which sections to include via an options object. The ZIP is
 * assembled with `fflate` — small (~11 kB gzipped), streaming, pure-JS.
 */

import { zipSync, strToU8 } from 'fflate'
import * as evidenceStore from './evidenceStore'

// Bump when the on-disk layout changes in a breaking way.
//   v1 — original layout (Markdown-only, no messages.json).
//   v2 — added messages.json as the canonical structured source of truth,
//        making bundles round-trippable on import.
const SCHEMA_VERSION = 2

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(s, max = 40) {
  return String(s || 'case')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'case'
}

async function sha256Hex(bytes) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return ''
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Minimal, deterministic redactor — matches backend log_redactor intent. */
function redactString(s) {
  if (!s) return s
  return String(s)
    // JSON-like "api_key": "...", "token": "..."
    .replace(/("(?:api[_-]?key|token|authorization|secret|password)"\s*:\s*")[^"]+(")/gi, '$1***$2')
    // Bearer / Basic header values
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ***')
    // Long hex / base64-ish secrets (>=32 chars)
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, (m) => (m.length > 48 ? m.slice(0, 6) + '…***' : m))
}

// ---------------------------------------------------------------------------
// Markdown renderer for the conversation
// ---------------------------------------------------------------------------

function renderMarkdown({ title, messages, meta, redact }) {
  const lines = []
  const when = new Date().toISOString()
  lines.push(`# ${title || 'SPECTRA Investigation'}`)
  lines.push('')
  lines.push(`*Exported ${when}*`)
  if (meta?.console) lines.push(`*Console: ${meta.console}*`)
  if (meta?.llm) lines.push(`*LLM: ${meta.llm}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages || []) {
    const role = msg.isUser ? 'User' : (msg.agent ? `SPECTRA — ${msg.agent}` : 'SPECTRA')
    const ts = msg.timestamp ? ` · ${msg.timestamp}` : ''
    lines.push(`## ${role}${ts}`)
    lines.push('')
    const body = redact ? redactString(msg.content) : msg.content
    lines.push(body || '')
    lines.push('')

    if (msg.toolsUsed?.length) {
      lines.push(`_Tools used: ${msg.toolsUsed.join(', ')}_`)
      lines.push('')
    }
    if (msg.thoughtProcess) {
      lines.push('<details><summary>Thought process</summary>')
      lines.push('')
      if (msg.thoughtProcess.classification) {
        lines.push(`- **Classification:** ${msg.thoughtProcess.classification}`)
      }
      if (msg.thoughtProcess.reason) {
        lines.push(`- **Reason:** ${msg.thoughtProcess.reason}`)
      }
      if (msg.thoughtProcess.tool_calls?.length) {
        lines.push('- **Tool calls:**')
        for (const tc of msg.thoughtProcess.tool_calls) {
          const args = tc.args ? ` — \`${tc.args}\`` : ''
          lines.push(`  - \`${tc.tool}\`${args}`)
        }
      }
      lines.push('')
      lines.push('</details>')
      lines.push('')
    }

    if (msg.evidenceRefs?.length) {
      lines.push('**Evidence:**')
      for (const ref of msg.evidenceRefs) {
        lines.push(`- \`${ref.name}\` (${evidenceStore.formatBytes(ref.size)}) — \`evidences/${ref.fileName}\``)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

function renderReadme({ title, options, counts }) {
  return [
    `SPECTRA Case Bundle`,
    `===================`,
    ``,
    `Title: ${title || '(untitled)'}`,
    `Generated: ${new Date().toISOString()}`,
    `Schema: ${SCHEMA_VERSION}`,
    ``,
    `Contents:`,
    `  - manifest.json       Machine-readable index + checksums.`,
    `  - messages.json       Canonical structured conversation (used by import;` +
      `${options.redact ? ' redacted content' : ' full content'}).`,
    `  - conversation.md     Markdown export of the whole chat.`,
    options.includePdf ? `  - conversation.pdf    PDF rendering of the chat.` : null,
    counts.artefacts ? `  - artefacts/          ${counts.artefacts} agent/tool artefact(s).` : null,
    counts.evidences ? `  - evidences/          ${counts.evidences} evidence file(s) + .meta.json sidecars.` : null,
    ``,
    `Options used:`,
    `  Markdown:   always on`,
    `  PDF:        ${options.includePdf ? 'on' : 'off'}`,
    `  Artefacts:  ${options.includeArtefacts ? 'on' : 'off'}`,
    `  Evidences:  ${options.includeEvidences ? 'on' : 'off'}`,
    `  Redaction:  ${options.redact ? 'on' : 'off'}`,
    ``,
    `Re-import: drop this ZIP onto the SPECTRA Library "Import Bundle" button`,
    `to re-hydrate the conversation and its evidences.`,
    ``,
  ].filter((x) => x !== null).join('\n')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build and download a case bundle ZIP.
 *
 * @param {Object} args
 * @param {string} args.title              Case title (used in file name + MD).
 * @param {Array}  args.messages           The chat messages array.
 * @param {string} args.conversationId     Id used to look up evidences.
 * @param {Object} args.meta               { console, llm, tags } — free-form.
 * @param {Object} args.options            { includePdf, includeArtefacts, includeEvidences, redact }
 * @param {Blob}   [args.pdfBlob]          Pre-rendered PDF (from jsPDF).
 * @param {Function} [args.onProgress]     (msg: string) => void
 */
export async function exportCaseBundle({
  title,
  messages = [],
  conversationId,
  meta = {},
  options = {},
  pdfBlob,
  onProgress,
}) {
  const opts = {
    includePdf: !!(options.includePdf && pdfBlob),
    includeArtefacts: options.includeArtefacts !== false,
    includeEvidences: options.includeEvidences !== false,
    redact: !!options.redact,
  }

  const progress = (m) => { try { onProgress?.(m) } catch {} }
  progress('Preparing manifest…')

  // ----------------------- gather evidences -----------------------
  let evidencesMeta = []
  let evidenceFiles = {} // fileName -> Uint8Array
  if (opts.includeEvidences && conversationId) {
    progress('Loading evidences…')
    const list = await evidenceStore.listEvidences(conversationId)
    let idx = 0
    for (const ev of list) {
      const record = await evidenceStore.getEvidence(ev.id, { includeBlob: true })
      if (!record) continue
      idx += 1
      // Safe filename, preserve extension when possible
      const base = String(ev.name || 'evidence').replace(/[/\\?%*:|"<>]/g, '_')
      const prefix = String(idx).padStart(3, '0')
      const fileName = `${prefix}-${base}`
      const buf = new Uint8Array(await record.blob.arrayBuffer())
      evidenceFiles[`evidences/${fileName}`] = buf
      evidenceFiles[`evidences/${fileName}.meta.json`] = strToU8(JSON.stringify({
        id: ev.id,
        name: ev.name,
        mime: ev.mime,
        size: ev.size,
        sha256: ev.sha256,
        addedAt: ev.addedAt,
        tags: ev.tags || [],
        note: opts.redact ? redactString(ev.note || '') : (ev.note || ''),
        conversationId: ev.conversationId,
        fileName,
      }, null, 2))
      evidencesMeta.push({ ...ev, fileName })
    }
  }

  // Decorate messages with evidence refs for Markdown rendering.
  const evidenceByConv = evidencesMeta
  const decoratedMessages = (messages || []).map((msg) => {
    if (!msg.evidenceIds?.length) return msg
    const refs = msg.evidenceIds
      .map((id) => evidenceByConv.find((e) => e.id === id))
      .filter(Boolean)
      .map(({ name, size, fileName }) => ({ name, size, fileName }))
    return refs.length ? { ...msg, evidenceRefs: refs } : msg
  })

  // ----------------------- markdown -----------------------
  progress('Rendering Markdown…')
  const mdText = renderMarkdown({
    title,
    messages: decoratedMessages,
    meta,
    redact: opts.redact,
  })
  const mdBytes = strToU8(mdText)

  // ----------------------- messages.json (canonical) -----------------------
  // Structured conversation — used by the importer to re-hydrate losslessly.
  // Always emitted so bundles can always be re-imported. When `opts.redact`
  // is on, content strings (and any string fields inside thoughtProcess) are
  // run through `redactString` exactly as they are for the Markdown render,
  // so a redacted bundle never contains the unredacted source in any form.
  const redactDeep = (v) => {
    if (v == null) return v
    if (typeof v === 'string') return redactString(v)
    if (Array.isArray(v)) return v.map(redactDeep)
    if (typeof v === 'object') {
      const out = {}
      for (const [k, val] of Object.entries(v)) out[k] = redactDeep(val)
      return out
    }
    return v
  }
  const canonical = (messages || []).map((m) => {
    const base = {
      id: m.id,
      content: m.content,
      isUser: !!m.isUser,
      timestamp: m.timestamp || null,
      agent: m.agent || null,
      toolsUsed: m.toolsUsed || [],
      thoughtProcess: m.thoughtProcess || null,
      totalMs: m.totalMs || null,
      evidenceIds: m.evidenceIds || [],
    }
    return opts.redact ? redactDeep(base) : base
  })
  const messagesJsonBytes = strToU8(JSON.stringify(canonical, null, 2))

  // ----------------------- artefacts -----------------------
  const artefacts = {}
  if (opts.includeArtefacts) {
    progress('Collecting artefacts…')
    let seq = 0
    for (const msg of decoratedMessages) {
      if (!msg.thoughtProcess) continue
      seq += 1
      const name = `artefacts/${String(seq).padStart(4, '0')}-${msg.agent || 'general'}.json`
      const payload = {
        messageId: msg.id,
        timestamp: msg.timestamp,
        agent: msg.agent || null,
        toolsUsed: msg.toolsUsed || [],
        thoughtProcess: msg.thoughtProcess,
        totalMs: msg.totalMs || null,
      }
      const body = JSON.stringify(payload, null, 2)
      artefacts[name] = strToU8(opts.redact ? redactString(body) : body)
    }
  }

  // ----------------------- pdf -----------------------
  let pdfBytes = null
  if (opts.includePdf && pdfBlob) {
    progress('Attaching PDF…')
    pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer())
  }

  // ----------------------- checksums + manifest -----------------------
  progress('Computing checksums…')
  const files = {
    'conversation.md': mdBytes,
    ...artefacts,
    ...evidenceFiles,
  }
  files['messages.json'] = messagesJsonBytes
  if (pdfBytes) files['conversation.pdf'] = pdfBytes

  const checksums = {}
  for (const [name, bytes] of Object.entries(files)) {
    checksums[name] = await sha256Hex(bytes)
  }

  const manifest = {
    schema: SCHEMA_VERSION,
    title: title || null,
    conversationId: conversationId || null,
    exportedAt: new Date().toISOString(),
    meta,
    options: opts,
    counts: {
      messages: decoratedMessages.length,
      artefacts: Object.keys(artefacts).length,
      evidences: evidencesMeta.length,
    },
    evidences: evidencesMeta.map(({ id, name, mime, size, sha256, addedAt, tags, fileName }) => ({
      id, name, mime, size, sha256, addedAt, tags: tags || [], fileName,
    })),
    checksums,
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  files['README.txt'] = strToU8(renderReadme({
    title,
    options: opts,
    counts: manifest.counts,
  }))

  // ----------------------- zip -----------------------
  // Most bundle payloads are already compressed (PDFs, images, archives). We
  // pick per-file compression levels to keep ZIP assembly fast and deterministic:
  //   - text-like entries (markdown, manifest, JSON artefacts) get level 6
  //   - everything else (originals in evidences/, PDF) is stored (level 0)
  // We also use `zipSync` to avoid the fflate async callback path (which has
  // been observed to hang on some browsers with mixed binary payloads) and
  // yield to the UI thread before/after with a 0 ms timeout.
  progress('Packing ZIP…')
  await new Promise((r) => setTimeout(r, 0))

  const isTextEntry = (name) =>
    name === 'conversation.md' ||
    name === 'README.txt' ||
    name === 'manifest.json' ||
    name.startsWith('artefacts/') ||
    name.endsWith('.meta.json')

  const zipInput = {}
  for (const [name, bytes] of Object.entries(files)) {
    zipInput[name] = [bytes, { level: isTextEntry(name) ? 6 : 0 }]
  }

  let zipped
  try {
    zipped = zipSync(zipInput, { level: 0 })
  } catch (err) {
    console.error('[bundleExport] zipSync failed:', err)
    throw new Error(`ZIP packing failed: ${err.message || err}`)
  }

  await new Promise((r) => setTimeout(r, 0))

  const fname = `spectra-case-${slugify(title)}-${new Date().toISOString().slice(0, 10)}.zip`
  const blob = new Blob([zipped], { type: 'application/zip' })
  triggerDownload(blob, fname)
  progress(`Downloaded ${fname}`)
  return { fileName: fname, size: blob.size, manifest }
}
