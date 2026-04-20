# MARP integration — parked ideas (for a later milestone)

These ideas were validated by the user during the v1.2 planning round and are
intentionally parked until evidence upload + case-bundle export are shipped and
stable. Keep this file as the source of truth so we can pick them up without
re-deriving the design.

## Why MARP
[Marp](https://marp.app/) turns plain Markdown into slide decks (HTML / PDF /
PPTX). It pairs naturally with SPECTRA because our agent outputs are already
Markdown-first (executive summary, findings, recommended actions). A deck is
just another renderer of the conversation model — same source, different view.

Recommended lib (client-side, no backend work): `@marp-team/marpit` (MIT,
~40 kB). Keeps the multi-tenant, browser-owned-state contract intact.

---

## Idea A — "Brief this case" (one-click executive deck)  [PRIORITY]

**What**
One button on any conversation → generate a ready-to-present deck from a
templated Markdown scaffold filled in with the conversation's content.

**Deck scaffold**
1. Cover slide — case title, severity, timeframe, console, analyst.
2. Executive summary — extracted from the matching `## Executive Summary`
   section(s).
3. One slide per agent finding — agent name, key facts, evidence thumbnails.
4. Evidence gallery — up to N images/logs surfaced from the evidence store.
5. MITRE ATT&CK mapping — tactics/techniques detected, rendered as a grid.
6. Recommended actions — checklist form.
7. Appendix — raw tool outputs, timeline, links.

**Use cases**
- SOC **shift handover** — export a PDF deck in seconds.
- Exec/CISO **read-out** — narrative without the tool-JSON clutter.
- MSSP **customer report** — branded Marp theme per tenant.

**Integration surface**
- Add alongside existing PDF export and the new Case Bundle export:
  a third checkbox "MARP deck (HTML)" and "MARP → PDF".
- Reuse the case bundle's content pipeline (Markdown + chart PNGs + evidence
  metadata) and feed it through a Marp template.

---

## Idea B — "Threat story" live presentation mode  [PRIORITY]

**What**
A full-screen "Present" view that renders the current conversation as a live
Marp deck, including charts and evidence thumbnails. Arrow keys advance slides.

**Speaker notes**
Auto-fill from the orchestrator's `thoughtProcess` reasoning (we already
capture classification + reason + tool calls). The presenter sees the rationale
behind each pivot; the audience sees only the narrative.

**Use cases**
- Tabletop exercises / **purple-team readouts** — walk alert → hunt →
  containment.
- **Training** — real investigations as teaching decks, with a redaction
  toggle (reuse the case-bundle redactor).
- All-hands **security reviews** — advance slides on the main screen while a
  side panel lets the presenter ask SPECTRA follow-up questions live.

**Integration surface**
- New toolbar button `Present` visible when a conversation has content.
- Route `/present/:conversationId` (hash-based to stay SPA-friendly).
- Keyboard controls: `←` / `→`, `b` blank, `esc` exit, `s` speaker notes.

---

## Idea C (optional, lower priority) — Playbook Studio

MARP-authored, MCP-backed living documents. Parked for later; see prior chat
summary for details if we return to it.

---

## Implementation order when we pick this up
1. Add `@marp-team/marpit` to `frontend/package.json`.
2. Add a `frontend/src/marpRenderer.js` that consumes the same conversation +
   evidence model used by `bundleExport.js` and returns `{ html, css }`.
3. Wire Idea A into the export modal (checkbox + download).
4. Wire Idea B as a new route / modal using the same renderer but with the
   Marp presentation chrome instead of a downloaded file.
