/**
 * SPECTRA — MARP deck renderer (v1.3).
 *
 * Consumes the same conversation + evidence model as `bundleExport.js` and
 * produces a Marp-flavored Markdown scaffold plus a rendered `{ html, css }`
 * via `@marp-team/marpit`. The renderer is deliberately side-effect-free:
 * it never touches the DOM, never writes to IndexedDB, never triggers a
 * download — callers compose those behaviors on top.
 *
 * Two public surfaces:
 *
 *   buildDeckMarkdown(ctx) -> string           // Marp Markdown (for debugging / MARP CLI)
 *   renderDeck(ctx)        -> { markdown, html, css, slides, title }
 *
 *   where `ctx` = {
 *     title, messages, meta,                    // same as bundleExport
 *     evidences,                                // Array<{ id, name, mime, size, sha256, dataUrl? }>
 *     analyst, severity, timeframe              // optional cover-slide extras
 *   }
 *
 * Design notes
 * ------------
 *  - We use `Marpit` (the low-level engine) rather than `Marp Core` because
 *    Marpit has a much smaller bundle footprint (~40 KB vs ~1 MB). Marp Core
 *    adds Emoji / math / auto-fit shrinking which we don't need.
 *  - Images are inlined as `data:` URLs only for small thumbnails so the
 *    standalone `deck.html` works offline. The caller is responsible for
 *    resolving evidence data URLs before calling `renderDeck`.
 *  - The theme is a purple SPECTRA palette matching the app's aesthetic.
 *    It's registered inline so consumers don't need to ship a separate CSS
 *    asset — one HTML file is enough.
 *  - Section extraction reuses the same heuristics as the chat UI
 *    (`classifyZone`) so "Executive Summary" and "Recommended Actions"
 *    are lifted without duplicating keyword lists.
 */

import { Marpit } from '@marp-team/marpit'
import { classifyZone, ZONES } from './zoneControls.jsx'
import { groupByTactic } from './mitreAttack'

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const SPECTRA_THEME_NAME = 'spectra'

// SPECTRA logo — kept in sync with the `<SpectraLogo />` React component in
// `App.jsx` (converging data streams + central lens). Inlined as an SVG
// data URI so the deck is a single, self-contained HTML artefact — no
// network fetch, no CORS, no broken image if the file is opened from
// file:// or emailed as an attachment.
const SPECTRA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="sp" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="50%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#5B21B6"/>
    </linearGradient>
    <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C084FC"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="8" fill="url(#sp)"/>
  <circle cx="24" cy="24" r="4" fill="#1a0f2e"/>
  <circle cx="24" cy="24" r="2" fill="url(#sg)"/>
  <path d="M6 12 L18 20" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M6 36 L18 28" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M42 12 L30 20" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M42 36 L30 28" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M24 4 L24 16" stroke="url(#sg)" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <circle cx="6" cy="12" r="3" fill="url(#sp)" opacity="0.7"/>
  <circle cx="6" cy="36" r="3" fill="url(#sp)" opacity="0.7"/>
  <circle cx="42" cy="12" r="3" fill="url(#sp)" opacity="0.7"/>
  <circle cx="42" cy="36" r="3" fill="url(#sp)" opacity="0.7"/>
  <circle cx="24" cy="4" r="3" fill="url(#sp)" opacity="0.7"/>
  <path d="M8 24 A16 16 0 0 1 40 24" stroke="url(#sp)" stroke-width="1.5" fill="none" opacity="0.4"/>
  <path d="M8 24 A16 16 0 0 0 40 24" stroke="url(#sp)" stroke-width="1.5" fill="none" opacity="0.4"/>
</svg>`.replace(/\n\s*/g, ' ').trim()

// `encodeURIComponent` handles `#`, whitespace and quotes uniformly —
// important because gradient references (`url(#sp)`) embed literal `#`
// which must be percent-encoded when placed inside a data URI.
const SPECTRA_LOGO_DATA_URI =
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SPECTRA_LOGO_SVG)}`

// Self-sufficient theme: no `@import 'default'` (Marpit's default theme is
// not always reachable from an ESM bundle), no `@size` frontmatter directive
// (we pin `section { width; height }` explicitly below). This keeps the deck
// deterministic regardless of how Marpit is packed.
const SPECTRA_THEME_CSS = `
/* @theme spectra */

/* ---------- Engine reset (what Marpit's default theme would give us) ---- */
section {
  width: 1280px;
  height: 720px;
  box-sizing: border-box;
  display: flex;
  flex-flow: column nowrap;
  position: relative;
  overflow: hidden;
  font-size: 26px;
  line-height: 1.4;
}
section > * { flex-shrink: 0; }

/* Define palette on :root (for standalone HTML) AND on :host / section so
   the variables also cascade when the deck is mounted inside a Shadow DOM
   — :root does not match inside a shadow root. */
:root, :host, section {
  --spectra-bg-0: #0a0815;
  --spectra-bg-1: #12101f;
  --spectra-purple-500: #a855f7;
  --spectra-purple-400: #c084fc;
  --spectra-purple-300: #d8b4fe;
  --spectra-purple-200: #e9d5ff;
  --spectra-text: #e5e7eb;
  --spectra-muted: #9ca3af;
  --spectra-accent: #fbbf24;
}

section {
  background: radial-gradient(ellipse at top left,
    rgba(168, 85, 247, 0.18) 0%,
    var(--spectra-bg-0) 55%);
  color: var(--spectra-text);
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  /* Bottom padding is larger than the top one to reserve a ~56px strip at
     the foot of every slide for the pagination counter and the optional
     tools footer. Without this reserve, long tables/lists flow under
     the page number and look clipped (see bug-report screenshots). */
  padding: 60px 72px 72px 72px;
  justify-content: flex-start;
}

/* SPECTRA watermark logo — top-right on every slide. Pointer-events:none
   so it never captures clicks on interactive chips/links. On the cover
   slide we hide it because the title already carries the brand. */
section::before {
  content: '';
  position: absolute;
  top: 28px;
  right: 28px;
  width: 56px;
  height: 56px;
  background-image: url("${SPECTRA_LOGO_DATA_URI}");
  background-repeat: no-repeat;
  background-size: contain;
  background-position: center;
  opacity: 0.9;
  pointer-events: none;
  z-index: 5;
}
/* On the cover the logo is slightly larger and sits a little further in, so
   it reads as brand chrome rather than a repeating watermark. */
section.cover::before { top: 36px; right: 40px; width: 72px; height: 72px; opacity: 1; }

/* "(cont.)" marker in continuation headings — visually subdued so it
   reads as metadata rather than a distinct heading. */
section h2 .cont, section h3 .cont {
  color: var(--spectra-muted);
  font-weight: 400;
  font-size: 0.65em;
  margin-left: 8px;
  letter-spacing: 0.02em;
}

section h1, section h2, section h3 {
  color: var(--spectra-purple-300);
  font-weight: 700;
  letter-spacing: -0.02em;
}

section h1 {
  font-size: 58px;
  margin: 0 0 18px 0;
  background: linear-gradient(90deg, var(--spectra-purple-300), var(--spectra-purple-500));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

section h2 {
  font-size: 40px;
  margin: 0 0 20px 0;
  border-bottom: 2px solid rgba(168, 85, 247, 0.25);
  padding-bottom: 8px;
}

section h3 {
  font-size: 28px;
  color: var(--spectra-purple-200);
  margin-top: 24px;
}

section a { color: var(--spectra-purple-300); }

section strong { color: var(--spectra-purple-200); }

section code {
  background: rgba(168, 85, 247, 0.12);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.85em;
  color: var(--spectra-purple-200);
}

section pre {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 8px;
  padding: 18px;
  font-size: 18px;
  overflow: hidden;
}

section blockquote {
  border-left: 4px solid var(--spectra-purple-500);
  padding-left: 18px;
  color: var(--spectra-muted);
  font-style: italic;
}

section ul, section ol { margin-left: 6px; }

section li { margin: 8px 0; }

section table {
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 20px;
}

section table th, section table td {
  border: 1px solid rgba(168, 85, 247, 0.25);
  padding: 8px 12px;
  text-align: left;
}

section table th {
  background: rgba(168, 85, 247, 0.15);
  color: var(--spectra-purple-200);
}

/* Dense slides (exec summary, recommended actions) — smaller body text so
   long paragraphs fit inside the 720px frame without overflow. */
section.dense { font-size: 22px; line-height: 1.38; padding: 48px 72px; }
section.dense h2 { font-size: 34px; margin-bottom: 14px; }
section.dense p { margin: 0.45em 0; }
section.dense ul, section.dense ol { margin: 0.4em 0 0.4em 1.2em; }
section.dense li { margin: 4px 0; }

/* Cover slide */
section.cover {
  justify-content: center;
  text-align: center;
  background: radial-gradient(circle at center,
    rgba(168, 85, 247, 0.35) 0%,
    var(--spectra-bg-0) 70%);
}
section.cover h1 { font-size: 72px; }
section.cover .subtitle { font-size: 28px; color: var(--spectra-muted); margin-top: 8px; }
section.cover .meta {
  margin-top: 40px;
  font-size: 20px;
  color: var(--spectra-muted);
  display: flex;
  gap: 28px;
  justify-content: center;
}
section.cover .meta strong { color: var(--spectra-purple-300); margin-right: 6px; }

/* Accent chip (e.g. severity) */
section .severity-chip {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-top: 24px;
}
section .severity-chip.critical { background: #7f1d1d; color: #fecaca; }
section .severity-chip.high { background: #9a3412; color: #fed7aa; }
section .severity-chip.medium { background: #78350f; color: #fde68a; }
section .severity-chip.low { background: #064e3b; color: #a7f3d0; }

/* Page numbers — anchored to the bottom-right inside the reserved
   footer strip (see the section padding-bottom reserve above). */
section::after {
  content: attr(data-marpit-pagination) ' / ' attr(data-marpit-pagination-total);
  position: absolute;
  bottom: 22px;
  right: 32px;
  font-size: 14px;
  color: var(--spectra-muted);
  letter-spacing: 0.08em;
  z-index: 4;
}

/* Tools-used footer — lists the MCP tools that produced the slide's
   content. Sits in the same reserved bottom strip as the page number,
   but aligned left so the two don't collide. */
section footer.tools-footer {
  position: absolute;
  bottom: 20px;
  left: 32px;
  right: 120px;       /* leave room for the page counter */
  font-size: 13px;
  color: var(--spectra-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 4;
}
section footer.tools-footer strong {
  color: var(--spectra-purple-200);
  font-weight: 600;
  margin-right: 6px;
}
section footer.tools-footer code {
  background: rgba(168, 85, 247, 0.12);
  border: 1px solid rgba(168, 85, 247, 0.22);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
  color: var(--spectra-accent);
}

/* Evidence gallery grid */
section .gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 10px;
}
section .gallery .card {
  background: rgba(168, 85, 247, 0.08);
  border: 1px solid rgba(168, 85, 247, 0.25);
  border-radius: 10px;
  padding: 10px;
  font-size: 16px;
  color: var(--spectra-muted);
  overflow: hidden;
}
section .gallery .card .name {
  color: var(--spectra-purple-200);
  font-weight: 600;
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
section .gallery .card img {
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 6px;
}

/* MITRE technique grid — clickable chips linking to attack.mitre.org */
section .mitre-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 14px;
}
section .mitre-grid .tech {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(168, 85, 247, 0.12);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 15px;
  text-decoration: none;
  color: var(--spectra-text);
  transition: background 120ms ease, border-color 120ms ease;
}
section .mitre-grid .tech:hover {
  background: rgba(168, 85, 247, 0.22);
  border-color: rgba(168, 85, 247, 0.55);
}
section .mitre-grid .tech .id {
  color: var(--spectra-accent);
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 17px;
}
section .mitre-grid .tech .tactic-badge {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--spectra-purple-200);
  background: rgba(168, 85, 247, 0.22);
  border-radius: 999px;
  padding: 2px 8px;
  flex-shrink: 0;
}
section .mitre-grid .tech .count {
  margin-left: auto;
  font-size: 13px;
  color: var(--spectra-muted);
  white-space: nowrap;
}

/* Kill-chain swim-lane — one column per tactic in ATT&CK order */
section.killchain { padding: 48px 54px; font-size: 18px; }
section.killchain h2 { font-size: 32px; margin-bottom: 16px; }

section .killchain {
  display: flex;
  flex-direction: row;
  gap: 6px;
  align-items: stretch;
  width: 100%;
  flex: 1 1 auto;
  overflow: hidden;
}
section .killchain .lane {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: rgba(168, 85, 247, 0.06);
  border: 1px solid rgba(168, 85, 247, 0.20);
  border-radius: 10px;
  overflow: hidden;
}
section .killchain .lane-head {
  padding: 10px 8px 8px 8px;
  text-align: center;
  border-bottom: 1px solid rgba(168, 85, 247, 0.20);
  background: linear-gradient(180deg,
    rgba(168, 85, 247, 0.18),
    rgba(168, 85, 247, 0.06));
}
section .killchain .lane-head .lane-short {
  display: block;
  font-weight: 700;
  font-size: 14px;
  color: var(--spectra-purple-200);
  letter-spacing: 0.04em;
}
section .killchain .lane-head .lane-label {
  display: block;
  font-size: 10px;
  color: var(--spectra-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 2px;
}
section .killchain .lane-body {
  flex: 1 1 auto;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
section .killchain .killchain-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--spectra-accent);
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.28);
  border-radius: 6px;
  text-decoration: none;
  letter-spacing: 0.02em;
  transition: background 120ms ease, color 120ms ease;
}
section .killchain .killchain-chip:hover {
  background: rgba(251, 191, 36, 0.2);
  color: #fde68a;
}
section .killchain .killchain-chip .x {
  font-size: 10px;
  color: var(--spectra-muted);
  font-weight: 500;
}
section .killchain .killchain-more {
  text-align: center;
  font-size: 11px;
  color: var(--spectra-muted);
  padding: 2px 0;
}

/* Appendix / footer */
footer {
  color: var(--spectra-muted);
  font-size: 14px;
}
`

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Split a message body into `{ heading, body }` sections delimited by `## `
 * (same rule the chat UI uses).
 */
function splitMarkdownSections(md) {
  if (!md) return []
  const lines = md.split('\n')
  const sections = []
  let current = null
  for (const ln of lines) {
    const h = /^##\s+(.+)$/.exec(ln)
    if (h) {
      if (current) sections.push(current)
      current = { heading: h[1].trim(), lines: [] }
    } else {
      if (!current) {
        // Pre-heading preamble — attach as a synthetic "" heading.
        current = { heading: '', lines: [] }
      }
      current.lines.push(ln)
    }
  }
  if (current) sections.push(current)
  return sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() }))
}

/**
 * Pick sections by zone across every assistant message and return them
 * flattened, newest-first.
 */
function pickSectionsByZone(messages, zone) {
  const out = []
  for (const m of messages || []) {
    if (m.isUser) continue
    const sections = splitMarkdownSections(m.content || '')
    for (const s of sections) {
      if (!s.heading) continue
      if (classifyZone(s.heading) === zone) {
        out.push({ ...s, agent: m.agent, timestamp: m.timestamp })
      }
    }
  }
  return out
}

/**
 * Detect MITRE ATT&CK technique ids (Txxxx / Txxxx.xxx) anywhere in the
 * assistant messages. Returns deduped ordered list.
 */
function extractMitreTechniques(messages) {
  const re = /\bT\d{4}(?:\.\d{3})?\b/g
  const seen = new Map()
  for (const m of messages || []) {
    if (m.isUser) continue
    const hits = String(m.content || '').match(re)
    if (!hits) continue
    for (const id of hits) {
      if (!seen.has(id)) seen.set(id, 1)
      else seen.set(id, seen.get(id) + 1)
    }
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }))
}

/**
 * Truncate a Markdown body to fit a slide. Uses both a character budget
 * (dominant for long paragraphs) and a line budget (dominant for bullet
 * lists). Prefers to cut on paragraph boundaries; falls back to sentence
 * boundaries; last resort is a hard cut.
 */
function trimToFit(md, opts = {}) {
  return splitToFit(md, opts).head
}

/**
 * Paginate a Markdown chunk into an array of pages, each fitting a visual
 * weight budget. Returns an array of strings (always at least one entry,
 * empty-array only if the input is empty).
 *
 * Why weight-based, not line-based: our previous paginator counted raw
 * newlines, which treats a single table row the same as one paragraph
 * line. In reality a table row renders at ~1.6× the height of a text line,
 * code lines at ~1.1×, and list bullets at ~1.2×. That mismatch caused the
 * over-flow bugs shown in the screenshots (slides 3, 5, 8, 15, 22, 23).
 *
 * Strategy:
 *  1. Tokenise the input into atomic blocks (heading / paragraph / table /
 *     fenced code / list / blockquote) — splitting never cuts through a
 *     table or a code block, so tables and images stay anchored to their
 *     surrounding text.
 *  2. Assign each block a weight that roughly matches its on-screen height.
 *  3. Greedily append blocks to the current page until the next block
 *     would exceed the budget; start a new page.
 *  4. A single overweight block (e.g. an enormous paragraph) is force-
 *     pushed onto its own page rather than split mid-sentence — that
 *     avoids the "slide N content referred to slide N-1" bug.
 */
function paginateBlocks(md, { budget = 14 } = {}) {
  if (!md || !md.trim()) return []
  const blocks = parseBlocks(md)
  const pages = []
  let current = []
  let currentWeight = 0
  for (const b of blocks) {
    // Skip empty or whitespace-only blocks so we never emit blank pages.
    if (!b.text.trim()) continue
    const nextFits = currentWeight + b.weight <= budget
    if (!nextFits && current.length > 0) {
      // Orphan-heading guard: if the only thing on the current page is a
      // heading (or a heading followed by another heading), carry it to
      // the next page with the incoming block so the heading never sits
      // alone at the bottom of a slide separated from its body.
      const onlyHeadings = current.every((x) => x.kind === 'heading')
      if (onlyHeadings) {
        // Carry current forward by leaving it in `current`, then flush
        // nothing yet. If the incoming block STILL won't fit alongside
        // the heading(s), we let it land on this page anyway — a giant
        // block on its own page is better than losing the heading.
        current.push(b)
        currentWeight += b.weight
        continue
      }
      pages.push(current.map((x) => x.text).join('\n\n').trim())
      current = []
      currentWeight = 0
    }
    current.push(b)
    currentWeight += b.weight
  }
  if (current.length > 0) {
    pages.push(current.map((x) => x.text).join('\n\n').trim())
  }
  return pages.filter(Boolean)
}

/**
 * Legacy wrapper kept to avoid touching every call site. Paginates `md` and
 * returns `{ head, rest }` where `head` is the first page and `rest` is
 * the remainder joined together so a caller can itself loop.
 */
function splitToFit(md, { maxLines = 14 } = {}) {
  // Translate the old line budget into the block weight scale used by
  // `paginateBlocks`. 1 weight ≈ 1 normal text line.
  const pages = paginateBlocks(md, { budget: maxLines })
  if (pages.length === 0) return { head: '', rest: '' }
  if (pages.length === 1) return { head: pages[0], rest: '' }
  return { head: pages[0], rest: pages.slice(1).join('\n\n') }
}

/**
 * Split Markdown into atomic blocks with an estimated visual weight (in
 * units of "normal body lines"). Blocks are kept intact so tables and
 * code fences are never split mid-way.
 */
function parseBlocks(md) {
  const lines = String(md || '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Skip leading blanks between blocks.
    if (line.trim() === '') { i += 1; continue }

    // Fenced code block (``` ... ```): consume until closing fence or EOF.
    if (/^\s*```/.test(line)) {
      const start = i
      i += 1
      while (i < lines.length && !/^\s*```/.test(lines[i])) i += 1
      if (i < lines.length) i += 1 // consume closing fence
      const text = lines.slice(start, i).join('\n')
      const codeLines = i - start - 2 // approx content lines
      blocks.push({ kind: 'code', text, weight: Math.max(2, codeLines * 1.1 + 0.8) })
      continue
    }

    // Markdown table: a header row with `|`, followed by a separator line
    // of dashes. Consume while subsequent lines contain `|`.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
      const start = i
      i += 2 // header + separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') i += 1
      const text = lines.slice(start, i).join('\n')
      const rows = i - start // includes header
      // Tables have taller rows, plus padding and header chrome.
      blocks.push({ kind: 'table', text, weight: rows * 1.6 + 0.6 })
      continue
    }

    // HTML block (div, footer, etc.) — keep it intact.
    if (/^\s*<(?:div|footer|section|span|img|a)/i.test(line)) {
      const start = i
      i += 1
      while (i < lines.length && lines[i].trim() !== '') i += 1
      const text = lines.slice(start, i).join('\n')
      blocks.push({ kind: 'html', text, weight: Math.max(1, i - start) })
      continue
    }

    // Blockquote.
    if (/^\s*>/.test(line)) {
      const start = i
      while (i < lines.length && /^\s*>/.test(lines[i])) i += 1
      const text = lines.slice(start, i).join('\n')
      blocks.push({ kind: 'quote', text, weight: Math.max(1, (i - start) * 1.1) })
      continue
    }

    // List (bullet or ordered). Treat contiguous list items as one block
    // so we don't split a single logical list into orphaned fragments.
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const start = i
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        (/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]) || /^\s{2,}/.test(lines[i]))
      ) i += 1
      const text = lines.slice(start, i).join('\n')
      blocks.push({ kind: 'list', text, weight: (i - start) * 1.2 })
      continue
    }

    // Heading.
    if (/^\s*#{1,6}\s+/.test(line)) {
      blocks.push({ kind: 'heading', text: line, weight: 1.5 })
      i += 1
      continue
    }

    // Paragraph — consume until blank line or EOF.
    const start = i
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^\s*```/.test(lines[i]) &&
           !/^\s*#{1,6}\s+/.test(lines[i]) &&
           !/^\s*>/.test(lines[i]) &&
           !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i])) {
      i += 1
    }
    const text = lines.slice(start, i).join('\n')
    // Estimate wrapped lines at ~80 chars per line.
    const wrapped = Math.max(1, Math.ceil(text.length / 80))
    blocks.push({ kind: 'paragraph', text, weight: wrapped })
  }
  return blocks
}

// Threat-vocabulary keywords used by `inferDeckTitle` — matched as whole
// words on the full conversation transcript. Ordered loosely by specificity
// so more descriptive names win over generic terms.
const TITLE_KEYWORDS = [
  'ransomware', 'wiper', 'worm', 'rootkit', 'trojan', 'spyware', 'stealer',
  'backdoor', 'implant', 'botnet', 'loader', 'dropper', 'keylogger',
  'phishing', 'spearphishing', 'vishing', 'smishing', 'credential theft',
  'supply chain', 'lateral movement', 'exfiltration', 'data leak',
  'insider threat', 'intrusion', 'breach', 'compromise', 'incident',
  'campaign', 'apt', 'threat actor', 'vulnerability', 'exploit',
  'misconfiguration', 'malware', 'c2', 'command and control',
]

/**
 * Best-effort title derived from the conversation. Picks a capitalised
 * proper noun phrase near a threat keyword (e.g. "Apollo Ransomware"), or
 * falls back to the keyword itself, or finally to a generic label.
 *
 * Strategy: scan the concatenated user + assistant text. For each keyword
 * hit, look left/right for up to two capitalised tokens and build a phrase
 * like "Apollo Ransomware" or "Salt Typhoon Campaign". Return the highest-
 * scoring candidate.
 */
export function inferDeckTitle(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'SPECTRA Investigation'
  }
  const corpus = messages
    .map((m) => String(m?.content || ''))
    .join('\n')
  if (!corpus.trim()) return 'SPECTRA Investigation'

  const lower = corpus.toLowerCase()
  const candidates = []

  for (const kw of TITLE_KEYWORDS) {
    let idx = 0
    while ((idx = lower.indexOf(kw, idx)) !== -1) {
      const before = corpus.slice(Math.max(0, idx - 80), idx)
      const after = corpus.slice(idx + kw.length, idx + kw.length + 80)
      // Take up to 2 capitalised tokens immediately before the keyword.
      const leftMatch = before.match(/((?:[A-Z][a-zA-Z0-9]+\s+){0,2}[A-Z][a-zA-Z0-9]+)\s*$/)
      // Or up to 2 capitalised tokens immediately after.
      const rightMatch = after.match(/^\s*((?:[A-Z][a-zA-Z0-9]+\s+){0,2}[A-Z][a-zA-Z0-9]+)/)
      const proper = leftMatch?.[1] || rightMatch?.[1] || null
      const niceKw = kw.replace(/\b\w/g, (c) => c.toUpperCase())
      if (proper) {
        // Avoid double-counting if the proper noun already contains the keyword.
        const composed = proper.toLowerCase().includes(kw)
          ? proper
          : `${proper} ${niceKw}`
        candidates.push({ phrase: composed, score: 3 })
      } else {
        candidates.push({ phrase: niceKw, score: 1 })
      }
      idx += kw.length
    }
  }
  if (candidates.length === 0) return 'SPECTRA Investigation'

  // Pick the highest-scoring, most-frequently seen candidate.
  const tally = new Map()
  for (const c of candidates) {
    const key = c.phrase.trim()
    tally.set(key, (tally.get(key) || 0) + c.score)
  }
  let best = null
  let bestScore = -1
  for (const [phrase, score] of tally.entries()) {
    if (score > bestScore) { best = phrase; bestScore = score }
  }
  if (!best) return 'SPECTRA Investigation'
  return `Investigation — ${best}`
}

/**
 * Escape HTML entities (for inline `<div>` constructs in the Marp Markdown).
 */
function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Turn an agent handle (e.g. `alert_triage`, `threat-hunt`, `correlation`)
 * into a reader-friendly display label (e.g. `Alert Triage`, `Threat Hunt`,
 * `Correlation`). Known aliases are mapped explicitly so the spelling
 * matches the product's UI; anything else falls back to a generic
 * Title-Case conversion.
 */
const AGENT_DISPLAY_NAMES = {
  alert_triage: 'Alert Triage',
  alert_triaging: 'Alert Triage',
  threat_hunt: 'Threat Hunt',
  threat_hunting: 'Threat Hunt',
  correlation: 'Correlation',
  misconfiguration: 'Misconfiguration',
  misconfigurations: 'Misconfigurations',
  vulnerability: 'Vulnerability',
  vulnerabilities: 'Vulnerabilities',
  inventory: 'Inventory',
  purple_ai: 'Purple AI',
  purpleai: 'Purple AI',
  sdl: 'Data Lake',
  spectra: 'SPECTRA',
  general: 'General',
}
function formatAgentName(raw) {
  if (!raw) return 'SPECTRA'
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (AGENT_DISPLAY_NAMES[key]) return AGENT_DISPLAY_NAMES[key]
  // Fallback: snake/kebab case → Title Case.
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function severityClass(severity) {
  const s = String(severity || '').toLowerCase()
  if (s.includes('crit')) return 'critical'
  if (s.includes('high')) return 'high'
  if (s.includes('med')) return 'medium'
  if (s.includes('low')) return 'low'
  return ''
}

// ---------------------------------------------------------------------------
// Slide scaffold
// ---------------------------------------------------------------------------

/**
 * Build Marp-flavored Markdown from the conversation. Each slide is
 * separated by `---` as per Marpit conventions.
 *
 * Slide plan (Idea A):
 *   1. Cover
 *   2. Executive summary
 *   3..N. One slide per assistant agent finding
 *   N+1. Evidence gallery
 *   N+2. Kill-chain mapping (swim-lane grouped by tactic) — when any technique is mapped
 *   N+3. Recommended actions (paginated as needed)
 *   N+4. Appendix (console, timing)
 */
export function buildDeckMarkdown(ctx) {
  const {
    title = 'SPECTRA Investigation',
    messages = [],
    evidences = [],
    meta = {},
    analyst = null,
    severity = null,
    timeframe = null,
  } = ctx || {}

  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')

  // Note: we intentionally DO NOT emit a `size:` directive. The theme pins
  // `section { width: 1280px; height: 720px }` directly, which survives
  // bundling better than Marpit's `@size` declaration.
  const frontMatter = [
    '---',
    `marp: true`,
    `theme: ${SPECTRA_THEME_NAME}`,
    `paginate: true`,
    `title: ${JSON.stringify(title).slice(1, -1)}`,
    '---',
    '',
  ].join('\n')

  const slides = []

  // ---- Slide 1: cover -------------------------------------------------
  {
    const sevChip = severity
      ? `<span class="severity-chip ${severityClass(severity)}">${htmlEscape(severity)}</span>`
      : ''
    const metaBits = [
      meta.console ? `<div><strong>Console</strong>${htmlEscape(meta.console)}</div>` : null,
      timeframe ? `<div><strong>Timeframe</strong>${htmlEscape(timeframe)}</div>` : null,
      analyst ? `<div><strong>Analyst</strong>${htmlEscape(analyst)}</div>` : null,
      // NOTE: we intentionally do not print `meta.llm` here — the model used
      // to draft the briefing is not useful information for an executive
      // audience and can confuse non-technical stakeholders.
    ].filter(Boolean).join('\n')
    slides.push([
      '<!-- _class: cover -->',
      '',
      `# ${title}`,
      '',
      `<div class="subtitle">SPECTRA case briefing · ${when} UTC</div>`,
      '',
      sevChip,
      '',
      `<div class="meta">`,
      metaBits || `<div><strong>Generated</strong>${when}</div>`,
      `</div>`,
    ].join('\n'))
  }

  // ---- Slide 2: executive summary ------------------------------------
  // Paginate across as many slides as needed so a long summary is never
  // silently clipped. The dense class tightens the per-slide budget.
  const execSections = pickSectionsByZone(messages, ZONES.EXEC)
  {
    const body = execSections.length
      ? execSections.map((s) => s.body).join('\n\n')
      : '_No executive summary section was detected in this conversation._'
    const pages = paginateBlocks(body, { budget: 14 })
    pages.forEach((page, idx) => {
      slides.push([
        '<!-- _class: dense -->',
        idx === 0
          ? '## Executive summary'
          : `## Executive summary <span class="cont">(cont.)</span>`,
        '',
        page,
      ].join('\n'))
    })
  }

  // ---- Per-agent findings --------------------------------------------
  // One slide per assistant message that has an agent + content beyond exec.
  const findingAgents = []
  for (const m of messages) {
    if (m.isUser) continue
    if (!m.content) continue
    const sections = splitMarkdownSections(m.content)
    // Pull the first non-EXEC, non-ACTIONS section (prefer FINDINGS).
    const findingSection =
      sections.find((s) => s.heading && classifyZone(s.heading) === ZONES.FINDINGS) ||
      sections.find((s) => s.heading && classifyZone(s.heading) !== ZONES.EXEC && classifyZone(s.heading) !== ZONES.ACTIONS)
    if (!findingSection) continue
    findingAgents.push({
      agent: m.agent || 'SPECTRA',
      heading: findingSection.heading,
      body: findingSection.body,
      toolsUsed: m.toolsUsed || [],
    })
  }
  for (const f of findingAgents.slice(0, 6)) {
    const agentLabel = formatAgentName(f.agent)
    // Tools go in the Marpit `<footer>` — rendered at the bottom-left of
    // the slide chrome, next to the page number. This both fixes the
    // "orphaned tools blockquote" bug and ties each finding to the
    // concrete tools that produced it, per the product requirement.
    const toolsFooter = f.toolsUsed.length
      ? `<footer class="tools-footer"><strong>Tools:</strong> ${
          f.toolsUsed.map((t) => `<code>${htmlEscape(t)}</code>`).join(' · ')
        }</footer>`
      : ''
    const pages = paginateBlocks(f.body, { budget: 12 })
    pages.forEach((page, idx) => {
      const headingLine = idx === 0
        ? `## ${f.heading}`
        : `## ${f.heading} <span class="cont">(cont.)</span>`
      const subHeadingLine = idx === 0
        ? `### ${agentLabel}`
        : `### ${agentLabel} — continued`
      // Tools footer appears on every continuation too — the viewer
      // shouldn't have to flip back to page 1 to learn which tools drove
      // the finding.
      slides.push([
        headingLine,
        '',
        subHeadingLine,
        '',
        page,
        toolsFooter,
      ].filter(Boolean).join('\n'))
    })
  }

  // ---- Evidence gallery ----------------------------------------------
  if (evidences && evidences.length) {
    const cards = evidences.slice(0, 9).map((ev) => {
      const isImage = String(ev.mime || '').startsWith('image/') && ev.dataUrl
      const thumb = isImage
        ? `<img src="${ev.dataUrl}" alt="${htmlEscape(ev.name)}" />`
        : `<div style="height:110px;display:flex;align-items:center;justify-content:center;font-size:34px;opacity:0.6">📎</div>`
      const sha = ev.sha256 ? `<div>${ev.sha256.slice(0, 10)}…</div>` : ''
      const size = ev.size != null ? `<div>${formatBytes(ev.size)}</div>` : ''
      return [
        `<div class="card">`,
        thumb,
        `<div class="name">${htmlEscape(ev.name || 'evidence')}</div>`,
        size,
        sha,
        `</div>`,
      ].join('')
    }).join('\n')
    slides.push([
      `## Evidence gallery`,
      '',
      `<div class="gallery">`,
      cards,
      `</div>`,
    ].join('\n'))
  }

  // ---- MITRE ATT&CK kill-chain --------------------------------------
  // Previously we emitted a separate "technique grid" slide before the
  // kill-chain, but it showed the same techniques with less structure —
  // pure duplication. The kill-chain is the grid *plus* the tactic
  // grouping, so we keep only this slide. Each chip is still a clickable
  // deep-link into attack.mitre.org.
  const mitre = extractMitreTechniques(messages)
  if (mitre.length) {
    const groups = groupByTactic(mitre)
    if (groups.length) {
      const lanes = groups.map((g) => {
        const chips = g.techniques.slice(0, 12).map((tech) => (
          `<a class="killchain-chip" href="${tech.url || '#'}" ` +
          `target="_blank" rel="noopener noreferrer" title="${tech.id}${tech.count > 1 ? ` — ${tech.count}×` : ''}">` +
            `${tech.id}${tech.count > 1 ? `<span class="x">${tech.count}×</span>` : ''}` +
          `</a>`
        )).join('')
        const extra = g.techniques.length > 12
          ? `<span class="killchain-more">+${g.techniques.length - 12}</span>`
          : ''
        return (
          `<div class="lane">` +
            `<div class="lane-head">` +
              `<span class="lane-short">${htmlEscape(g.tactic.short)}</span>` +
              `<span class="lane-label">${htmlEscape(g.tactic.label)}</span>` +
            `</div>` +
            `<div class="lane-body">${chips}${extra}</div>` +
          `</div>`
        )
      }).join('\n')
      slides.push([
        '<!-- _class: killchain -->',
        `## Kill-chain mapping`,
        '',
        `<div class="killchain">`,
        lanes,
        `</div>`,
        '',
        `<footer>Tactics in canonical ATT&amp;CK order (Reconnaissance → Impact). Chips link to attack.mitre.org.</footer>`,
      ].join('\n'))
    }
  }

  // ---- Recommended actions -------------------------------------------
  const actionSections = pickSectionsByZone(messages, ZONES.ACTIONS)
  if (actionSections.length) {
    const body = actionSections.map((s) => s.body).join('\n\n')
    const pages = paginateBlocks(body, { budget: 14 })
    pages.forEach((page, idx) => {
      slides.push([
        '<!-- _class: dense -->',
        idx === 0
          ? `## Recommended actions`
          : `## Recommended actions <span class="cont">(cont.)</span>`,
        '',
        page,
      ].join('\n'))
    })
  }

  // ---- Appendix ------------------------------------------------------
  slides.push([
    `## Appendix`,
    '',
    `- **Generated by SPECTRA** — ${when} UTC`,
    meta.console ? `- **Console:** ${meta.console}` : null,
    // LLM reference intentionally omitted from the audience-facing deck.
    `- **Messages:** ${messages.length}`,
    `- **Evidences:** ${evidences?.length || 0}`,
    '',
    `<footer>SPECTRA · Security Posture Exploration &amp; Correlated Threat Response Assistant</footer>`,
  ].filter(Boolean).join('\n'))

  return frontMatter + slides.join('\n\n---\n\n') + '\n'
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Format bytes — tiny clone so this file has no runtime import on
 * `evidenceStore` (keeps the renderer pure).
 */
function formatBytes(n) {
  if (n == null) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1 }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

let _marpitInstance = null
function getMarpit() {
  if (_marpitInstance) return _marpitInstance
  // We deliberately disable `inlineSVG`: with it on, Marpit wraps every
  // slide in `<svg data-marpit-svg><foreignObject><section>` and scopes
  // the emitted CSS under `svg[data-marpit-svg] > foreignObject > section`.
  // Present mode extracts just the `<section>` from each slide and mounts
  // it inside a Shadow DOM — so those SVG-scoped selectors never match,
  // and the slide renders as unstyled text (see the bug report
  // screenshot). Plain `<section>` output keeps the selectors simple and
  // lets both Present mode and the standalone HTML share one code path.
  const marpit = new Marpit({
    inlineSVG: false,
    container: false,
    looseYAML: true,
    markdown: { html: true },
  })
  marpit.themeSet.default = marpit.themeSet.add(SPECTRA_THEME_CSS)
  _marpitInstance = marpit
  return marpit
}

/**
 * Render the deck to `{ markdown, html, css, slides, title }`.
 *
 * `html` is the concatenation of slide `<section>` elements emitted by
 * Marpit. To produce a standalone browsable file, use `wrapStandalone`.
 */
export function renderDeck(ctx) {
  const markdown = buildDeckMarkdown(ctx)
  const marpit = getMarpit()
  const { html, css } = marpit.render(markdown)
  // Split the rendered HTML into individual `<section>` chunks so the
  // presentation mode can page through them.
  const slides = splitSections(html)
  return {
    markdown,
    html,
    css,
    slides,
    title: ctx?.title || 'SPECTRA Investigation',
  }
}

function splitSections(html) {
  // Each slide is a top-level <section>...</section>. Use a regex that
  // handles nested <section> tags gracefully by consuming only balanced
  // top-level blocks (Marpit's output is flat, so the simple regex works).
  const out = []
  const re = /<section[^>]*>[\s\S]*?<\/section>/g
  let m
  while ((m = re.exec(html)) !== null) {
    out.push(m[0])
  }
  return out
}

/**
 * Wrap `{ html, css }` into a standalone HTML document — opens fine as
 * a file:// URL and prints to PDF cleanly from the browser.
 */
export function wrapStandalone({ html, css, title }) {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${htmlEscape(title || 'SPECTRA Deck')}</title>`,
    '<meta name="generator" content="SPECTRA (Marpit)" />',
    '<style>',
    // ---- Page chrome (the host page, not the slides themselves) ----
    'html, body { margin: 0; padding: 0; background: #05040d; color: #e5e7eb; font-family: Inter, system-ui, sans-serif; }',
    'body { min-height: 100vh; padding: 28px 0; }',
    '.deck-toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: center; gap: 12px; padding: 10px 0 22px 0; background: linear-gradient(180deg, rgba(5,4,13,0.95), rgba(5,4,13,0.6)); backdrop-filter: blur(8px); }',
    '.deck-toolbar button, .deck-toolbar a { background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #e9d5ff; padding: 6px 14px; border-radius: 999px; font-size: 13px; cursor: pointer; text-decoration: none; font-weight: 500; transition: background 0.15s; }',
    '.deck-toolbar button:hover, .deck-toolbar a:hover { background: rgba(168, 85, 247, 0.3); }',
    '.deck-wrapper { display: flex; flex-direction: column; align-items: center; gap: 28px; }',
    // Sections already have width/height from the theme; we just add a frame.
    '.deck-wrapper > section { border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(168,85,247,0.18); }',
    // Force every element to preserve background colours / gradients /
    // images when the user prints or exports to PDF. Without this rule,
    // Chromium's default "Background graphics: OFF" strips the radial
    // gradient on `<section>`, the purple `background-clip: text` on the
    // cover H1 (making it invisible on a dark page), and the logo
    // watermark — producing the washed-out PDF shown in the bug report.
    // `-webkit-print-color-adjust: exact` is ignored by the print dialog
    // toggle and honored by all current Chromium/WebKit builds; the
    // unprefixed `print-color-adjust` is the spec equivalent.
    'html, body, section, section *, .deck-wrapper, .deck-wrapper > section { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }',
    // Print mode: one slide per page, full bleed, no chrome.
    '@media print {',
    '  .deck-toolbar { display: none !important; }',
    '  body { padding: 0 !important; background: #0a0815 !important; }',
    '  .deck-wrapper { gap: 0 !important; }',
    '  .deck-wrapper > section { border-radius: 0 !important; box-shadow: none !important; page-break-after: always; break-after: page; margin: 0 !important; }',
    // Reassert the slide background in print — some browsers drop
    // shorthand radial gradients set via CSS variables when color-adjust
    // is negotiated, so we repeat the declaration with !important here.
    '  section { background: radial-gradient(ellipse at top left, rgba(168,85,247,0.18) 0%, #0a0815 55%) !important; }',
    // Cover H1 uses `background-clip: text` with a purple gradient so
    // the title shimmers in the live deck. `background-clip: text` is
    // notoriously unstable under Chromium\'s print path — if the gradient
    // fails to render the text falls back to `transparent` and becomes
    // invisible on a dark background (that is the exact glitch in the
    // reported PDF). Force a solid purple here as a defensive fallback
    // so the title is ALWAYS readable in PDF exports.
    '  section.cover h1 { -webkit-text-fill-color: #d8b4fe !important; color: #d8b4fe !important; background: none !important; -webkit-background-clip: initial !important; background-clip: initial !important; }',
    '  @page { size: 1280px 720px; margin: 0; }',
    '}',
    '</style>',
    '<style>',
    // ---- Marpit-rendered deck CSS (theme + engine) ----
    css,
    '</style>',
    '</head>',
    '<body>',
    '<div class="deck-toolbar">',
    `<span style="color:#9ca3af; padding: 6px 4px; font-size: 13px;">${htmlEscape(title || 'SPECTRA Deck')}</span>`,
    '<button onclick="window.print()">Print / Save as PDF</button>',
    '</div>',
    `<div class="deck-wrapper">${html}</div>`,
    '</body>',
    '</html>',
  ].join('\n')
}
