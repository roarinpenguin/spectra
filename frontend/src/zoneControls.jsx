/**
 * Zone expand/collapse controls.
 *
 * The chat is composed of recurring "zones" across messages — the executive
 * summary, recommended actions, the per-message thought process, tool call
 * lists, evidence attachments, generic findings, etc. This module gives the
 * user one place to collapse/expand *categories* across the whole chat with a
 * single click (e.g. "collapse all thoughts", "only exec summaries").
 *
 * Mechanics:
 *  - Each `CollapsibleSection` registers its `zone` with `useZone()`.
 *  - The component derives its open/closed state from the zone's current
 *    state AND a per-section override (so users can still flip individual
 *    cards after applying a preset).
 *  - The toolbar applies presets by bumping `resetTick`, which clears all
 *    local overrides.
 */

import { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react'
import {
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  Eye,
  Brain,
  FileText,
  Wrench,
  Paperclip,
} from 'lucide-react'

// Canonical zone ids. `classifyZone` maps a section title to one of these.
export const ZONES = {
  EXEC: 'exec',          // Executive Summary, Summary, TL;DR
  ACTIONS: 'actions',    // Recommended Actions, Recommendations, Next Steps
  FINDINGS: 'findings',  // Everything else under a ## heading
  THOUGHTS: 'thoughts',  // Thought Process block
  TOOLS: 'tools',        // Tool call list inside Thought Process
  EVIDENCE: 'evidence',  // Evidence attachments on user messages
}

export const ZONE_LABELS = {
  [ZONES.EXEC]: 'Executive summary',
  [ZONES.ACTIONS]: 'Recommended actions',
  [ZONES.FINDINGS]: 'Findings',
  [ZONES.THOUGHTS]: 'Thought process',
  [ZONES.TOOLS]: 'Tool calls',
  [ZONES.EVIDENCE]: 'Evidence',
}

/**
 * Classify a section title into a zone. Case-insensitive substring match on
 * curated keywords. Unknown → FINDINGS.
 */
export function classifyZone(title) {
  const t = String(title || '').toLowerCase()
  if (!t) return ZONES.FINDINGS
  if (/(executive summary|^summary\b|tl;?dr|overview|at a glance)/.test(t)) return ZONES.EXEC
  if (/(recommend|next steps?|action items?|remediation|mitigation)/.test(t)) return ZONES.ACTIONS
  if (/thought process/.test(t)) return ZONES.THOUGHTS
  if (/tool calls?/.test(t)) return ZONES.TOOLS
  if (/evidence|attachment/.test(t)) return ZONES.EVIDENCE
  return ZONES.FINDINGS
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ZoneContext = createContext(null)

const DEFAULT_STATE = {
  // per-zone default-open flag
  [ZONES.EXEC]: true,
  [ZONES.ACTIONS]: true,
  [ZONES.FINDINGS]: false,
  [ZONES.THOUGHTS]: false,
  [ZONES.TOOLS]: false,
  [ZONES.EVIDENCE]: true,
}

export function ZoneProvider({ children }) {
  const [zoneOpen, setZoneOpen] = useState(DEFAULT_STATE)
  // Bumping this tick invalidates per-section overrides so the preset wins.
  const [resetTick, setResetTick] = useState(0)

  const api = useMemo(() => ({
    zoneOpen,
    resetTick,
    isOpenForZone: (zone) => !!zoneOpen[zone],
    expandAll: () => {
      setZoneOpen(Object.fromEntries(Object.keys(DEFAULT_STATE).map((k) => [k, true])))
      setResetTick((n) => n + 1)
    },
    collapseAll: () => {
      setZoneOpen(Object.fromEntries(Object.keys(DEFAULT_STATE).map((k) => [k, false])))
      setResetTick((n) => n + 1)
    },
    /** Expand only the given zones, collapse everything else. */
    onlyExpand: (zones) => {
      const set = new Set(zones)
      setZoneOpen(Object.fromEntries(Object.keys(DEFAULT_STATE).map((k) => [k, set.has(k)])))
      setResetTick((n) => n + 1)
    },
    toggleZone: (zone) => {
      setZoneOpen((prev) => ({ ...prev, [zone]: !prev[zone] }))
      setResetTick((n) => n + 1)
    },
    reset: () => {
      setZoneOpen(DEFAULT_STATE)
      setResetTick((n) => n + 1)
    },
  }), [zoneOpen, resetTick])

  return <ZoneContext.Provider value={api}>{children}</ZoneContext.Provider>
}

export function useZone() {
  return useContext(ZoneContext)
}

/**
 * Hook for a CollapsibleSection: given its zone, returns the current
 * open/closed state AND a setter. Local flips are remembered until the next
 * preset is applied (which bumps resetTick).
 */
export function useZoneSectionState(zone, { initialOpen } = {}) {
  const ctx = useContext(ZoneContext)
  const [localOpen, setLocalOpen] = useState(
    initialOpen !== undefined ? initialOpen : (ctx ? ctx.isOpenForZone(zone) : false)
  )
  const [lastTick, setLastTick] = useState(ctx ? ctx.resetTick : 0)

  // When a preset is applied, snap back to the zone default.
  useEffect(() => {
    if (!ctx) return
    if (ctx.resetTick !== lastTick) {
      setLocalOpen(ctx.isOpenForZone(zone))
      setLastTick(ctx.resetTick)
    }
  }, [ctx, zone, lastTick])

  return [localOpen, setLocalOpen]
}

// ---------------------------------------------------------------------------
// UI — compact toolbar above the messages list
// ---------------------------------------------------------------------------

function ZoneChip({ icon: Icon, label, active, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-smooth whitespace-nowrap ' +
        (active
          ? 'bg-purple-500/25 border-purple-400/50 text-purple-100'
          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200')
      }
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </button>
  )
}

export function ZoneControlsBar({ className = '' }) {
  const ctx = useZone()
  const [showMore, setShowMore] = useState(false)
  const popoverRef = useRef(null)
  const moreBtnRef = useRef(null)

  // Close the "More…" popover on outside click / Escape.
  useEffect(() => {
    if (!showMore) return
    const onDocClick = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        moreBtnRef.current && !moreBtnRef.current.contains(e.target)
      ) {
        setShowMore(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setShowMore(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [showMore])

  if (!ctx) return null
  const { zoneOpen, expandAll, collapseAll, onlyExpand, toggleZone } = ctx

  const btn = (extra = '') =>
    'flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 text-xs whitespace-nowrap ' + extra

  return (
    <div
      className={
        'glass rounded-full pl-3 pr-2 py-1.5 inline-flex items-center gap-2 text-xs relative ' + className
      }
    >
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        Zones visibility
      </span>

      {/* Group 1 — global presets */}
      <button type="button" onClick={expandAll} className={btn()} title="Expand every zone in every message">
        <ChevronsDown className="w-3 h-3" /> Expand all
      </button>
      <button type="button" onClick={collapseAll} className={btn()} title="Collapse every zone in every message">
        <ChevronsUp className="w-3 h-3" /> Collapse all
      </button>

      <span className="w-px h-4 bg-white/10" />

      {/* Group 2 — scoped presets */}
      <button
        type="button"
        onClick={() => onlyExpand([ZONES.EXEC])}
        className={btn()}
        title="Collapse everything except executive summaries"
      >
        <Eye className="w-3 h-3" /> Only exec
      </button>
      <button
        type="button"
        onClick={() => onlyExpand([ZONES.EXEC, ZONES.ACTIONS])}
        className={btn()}
        title="Expand executive summaries + recommended actions only"
      >
        <Eye className="w-3 h-3" /> Exec + actions
      </button>

      <span className="w-px h-4 bg-white/10" />

      {/* More… — reveals per-zone toggles */}
      <button
        ref={moreBtnRef}
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className={btn(showMore ? 'bg-purple-500/20 border-purple-400/40 text-purple-100' : '')}
        title="Show per-zone toggles"
        aria-expanded={showMore}
      >
        More…
        <ChevronDown className={'w-3 h-3 transition-transform ' + (showMore ? 'rotate-180' : '')} />
      </button>

      {showMore && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-2 z-20 glass-darker rounded-2xl border border-white/10 shadow-2xl p-3 min-w-[320px] animate-slide-up"
        >
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 px-1">
            Per-zone toggles
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ZoneChip
              icon={FileText}
              label="Exec"
              active={zoneOpen[ZONES.EXEC]}
              onClick={() => toggleZone(ZONES.EXEC)}
              title="Toggle executive summaries"
            />
            <ZoneChip
              icon={FileText}
              label="Actions"
              active={zoneOpen[ZONES.ACTIONS]}
              onClick={() => toggleZone(ZONES.ACTIONS)}
              title="Toggle recommended actions"
            />
            <ZoneChip
              icon={FileText}
              label="Findings"
              active={zoneOpen[ZONES.FINDINGS]}
              onClick={() => toggleZone(ZONES.FINDINGS)}
              title="Toggle generic findings"
            />
            <ZoneChip
              icon={Brain}
              label="Thoughts"
              active={zoneOpen[ZONES.THOUGHTS]}
              onClick={() => toggleZone(ZONES.THOUGHTS)}
              title="Toggle per-message thought process"
            />
            <ZoneChip
              icon={Wrench}
              label="Tools"
              active={zoneOpen[ZONES.TOOLS]}
              onClick={() => toggleZone(ZONES.TOOLS)}
              title="Toggle tool call lists"
            />
            <ZoneChip
              icon={Paperclip}
              label="Evidence"
              active={zoneOpen[ZONES.EVIDENCE]}
              onClick={() => toggleZone(ZONES.EVIDENCE)}
              title="Toggle evidence attachments"
            />
          </div>
        </div>
      )}
    </div>
  )
}
