'use client'

import { useMemo, useState } from 'react'
import type { DiaryAccent, DiaryEntryView } from '@/lib/catalogue/diary'

// ─── The diary — the reverse-chronological ledger (sketch 001-A / 001-C) ─
//
// RESEARCH PITFALL 1, READ THIS BEFORE TOUCHING THIS FILE: what is reused
// from components/profile/ActivityFeed.tsx is its render SHAPE ONLY (the
// leading badge, the body, the relative-timestamp helper) — never its
// table and never its emitter. ActivityFeed reads `activity_events`, a
// PUBLIC wall feed (`FOR SELECT USING (true)`) with a closed four-value
// kind enum whose emitter is explicitly allowed to swallow errors. None
// of that is acceptable for a private evidence trail. This component
// reads `work_diary_events` exclusively and imports nothing from
// lib/social/activity-emit.ts. `timeAgo()` below is a deliberate local
// copy of ActivityFeed's helper, not an import — ActivityFeed does not
// (and must not) export anything this component could pull in alongside
// its table/emitter.
//
// Every headline, consequence and date rendered here comes straight from
// `describeDiaryEvent()` (lib/catalogue/diary.ts, plan 04) — this
// component formats nothing and looks nothing up. That is what keeps the
// feed and the record identical: an AI entry's consequence line is the
// STORED citation, rendered as-is, never recomposed (T-37-24/T-37-61).
//
// Accent COLOUR comes from each entry's own `accent` field
// (DIARY_KIND_ACCENT, decided in plan 04) — this file only translates
// those token names into Tailwind classes; it does not re-decide which
// kind gets which accent.
//
// THE DIARY STAYS CLEAN (sketch 005-C): no re-author button, no splits
// prompt, no warning lives on a row here. Nudges live in GuidingLine,
// never stapled onto an entry — plan 09's ReauthorPrompt is mounted by
// the page in its own place, not here. The two on-row controls that DO
// exist are direct manipulation of the viewer's own content, not nudges:
// a version's play control (playback, in the sketches themselves) and a
// note's Remove (own hand-written line only, gated by `canRemove` +
// onRemoveNote). Neither ever appears on an auto-captured record.
//
// ONE component, two treatments — 001 was decided as C (compact,
// hairline-separated rows) on desktop and A (a left rail of kind chips
// connected by a thin line) on mobile. Plan 12 chooses per breakpoint;
// this component just honors whichever `layout` it's given. Reverse-
// chronological order comes from the query — this component never
// re-sorts what it's handed.

/**
 * `describeDiaryEvent()`'s own return shape, plus the two things only the
 * page can supply because they are not part of a diary row at all: a
 * stable `id` for the React key, and — for a `version` kind entry only —
 * the server-signed, short-lived playback URL (plan 06's batch signer)
 * and duration. Playback URLs are minted by the page, never constructed
 * here, and the numeral is the same derived value the page already
 * computed for `describeDiaryEvent()`'s own `context.versionNumerals` —
 * this component looks nothing up, it is handed what it needs to render.
 */
export type DiaryFeedEntry = DiaryEntryView & {
  id: string
  /** `version` kind only. The derived vN numeral (RENUMBERING RULE — never stored). */
  versionNumeral?: number | null
  /** `version` kind only. Absent → no player renders at all. */
  playbackUrl?: string | null
  /** `version` kind only. Seconds, rendered as m:ss beside the play control. */
  playbackDurationSeconds?: number | null
  /** `producer_handoff` kind only. URLs are short-lived and minted after work access is resolved. */
  handoff?: {
    recipientName: string
    note: string | null
    roughUrl: string | null
    vocalUrl: string | null
  }
  /**
   * True only for a `note` the viewer authored — the one hand-written kind,
   * and only one's own. Set by the page, which knows both the row's actor
   * and the viewer; the delete route re-checks both. Everything else in the
   * diary is an immutable record and never carries this.
   */
  canRemove?: boolean
}

export type DiaryFeedLayout = 'compact' | 'rail'

export type DiaryFeedProps = {
  entries: DiaryFeedEntry[]
  /** 'compact' (001-C, desktop default) or 'rail' (001-A, mobile). Defaults to 'compact'. */
  layout?: DiaryFeedLayout
  /** Remove a note (only entries with `canRemove`). Absent → no remove control renders at all. */
  onRemoveNote?: (id: string) => void
  /**
   * When set and the diary is longer than this, the feed collapses to this
   * many most-recent entries behind a "Show all" toggle, and a search box
   * appears so a long history can be filtered by anything in a row's text —
   * a person's handle or a section label, both of which live in the
   * headline. Unset (the default) renders the whole feed with no chrome, so
   * every existing caller and test is unchanged; the page opts in.
   */
  collapseAfter?: number
}

// ─── Relative timestamp helper — adapted from ActivityFeed.tsx's timeAgo() ─

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return ''
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Accent token → Tailwind class translation only (never a re-decision) ─

const ACCENT_TEXT_CLASS: Record<DiaryAccent, string> = {
  brandindigo: 'text-brandindigo',
  money: 'text-money',
  'emerald-400': 'text-emerald-400',
  'blue-400': 'text-blue-400',
  lavdim: 'text-lavdim',
}

const ACCENT_CHIP_CLASS: Record<DiaryAccent, string> = {
  brandindigo: 'bg-brandindigo/10 text-brandindigo',
  money: 'bg-money/10 text-money',
  'emerald-400': 'bg-emerald-400/10 text-emerald-400',
  'blue-400': 'bg-blue-400/10 text-blue-400',
  lavdim: 'bg-lav/[.08] text-lav',
}

function railChipLabel(entry: DiaryFeedEntry): string {
  if (entry.kind === 'version') return entry.versionNumeral ? `v${entry.versionNumeral}` : 'v·'
  if (entry.kind === 'sheet') return '§'
  if (entry.kind === 'ai_entry') return 'AI'
  if (entry.kind === 'producer_handoff') return '⇢'
  if (entry.kind === 'producer_handoff_received') return '✓'
  if (entry.kind === 'producer_mix_returned') return '↩'
  if (entry.kind === 'producer_mix_reviewed') return '✓'
  return '•'
}

// ─── Playback (version entries only, tolerant of an absent URL) ─────────

function VersionPlayback({ entry }: { entry: DiaryFeedEntry }) {
  if (entry.kind !== 'version' || !entry.playbackUrl) return null
  return (
    <div className="mt-[6px]">
      <button
        type="button"
        className="rounded-[9px] border border-hairstrong bg-lav/[.06] px-[10px] py-[5px] text-[11px] font-semibold text-lav hover:text-white"
      >
        ▶ {formatDuration(entry.playbackDurationSeconds)}
      </button>
    </div>
  )
}

function ProducerHandoffDownloads({ entry }: { entry: DiaryFeedEntry }) {
  if (entry.kind !== 'producer_handoff' || !entry.handoff) return null
  return (
    <div className="mt-[7px] rounded-[9px] border border-brandindigo/25 bg-brandindigo/[.04] p-2.5">
      {entry.handoff.note && <p className="mb-2 whitespace-pre-wrap text-[11px] leading-5 text-lav">“{entry.handoff.note}”</p>}
      <div className="flex flex-wrap items-center gap-2">
        {entry.handoff.roughUrl && <a href={entry.handoff.roughUrl} className="rounded-[8px] border border-hairstrong bg-card2 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:border-brandindigo">↓ Rough mix</a>}
        {entry.handoff.vocalUrl && <a href={entry.handoff.vocalUrl} className="rounded-[8px] border border-brandindigo/40 bg-brandindigo/10 px-2.5 py-1.5 text-[10px] font-semibold text-brandindigo hover:text-white">↓ Dry vocal · starts at 0:00</a>}
      </div>
    </div>
  )
}

// ─── Remove control — note rows only (own notes) ────────────────────────
// This is direct manipulation of the viewer's OWN hand-written line, not a
// nudge — the same category as the play control above, and explicitly NOT
// the kind of on-row CTA the file header forbids. It renders only when the
// page marked the entry `canRemove` (a note the viewer authored) AND passed
// an onRemoveNote handler; it can never appear on an auto-captured record.

function NoteRemoveControl({ onRemove }: { onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="mt-[6px]">
      {confirming ? (
        <span className="text-[11px]">
          <span className="text-lavdim">Remove note?</span>{' '}
          <button type="button" onClick={onRemove} className="font-semibold text-rose-400 hover:text-rose-300">
            Yes
          </button>{' '}
          <button type="button" onClick={() => setConfirming(false)} className="text-lavdim hover:text-lav">
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[11px] text-lavdim hover:text-rose-400"
        >
          Remove
        </button>
      )}
    </div>
  )
}

// ─── Compact rows (001-C) — the default ─────────────────────────────────

function CompactRow({ entry, onRemoveNote }: { entry: DiaryFeedEntry; onRemoveNote?: (id: string) => void }) {
  return (
    <div className="border-b border-hair py-[10px] last:border-none">
      <div className="flex items-start justify-between gap-[10px]">
        <b className="text-[12px] text-lav">{entry.headline}</b>
        <span className="whitespace-nowrap text-[11px] text-lavdim">{timeAgo(entry.date)}</span>
      </div>
      {entry.consequence && <p className="mt-[2px] text-[11px] text-lavdim">{entry.consequence}</p>}
      <VersionPlayback entry={entry} />
      <ProducerHandoffDownloads entry={entry} />
      {entry.canRemove && onRemoveNote && <NoteRemoveControl onRemove={() => onRemoveNote(entry.id)} />}
    </div>
  )
}

// ─── Rail treatment (001-A) — kind chips on a connecting line ──────────

function RailRow({
  entry,
  isLast,
  onRemoveNote,
}: {
  entry: DiaryFeedEntry
  isLast: boolean
  onRemoveNote?: (id: string) => void
}) {
  const accentClass = ACCENT_CHIP_CLASS[entry.accent]
  return (
    <div className="flex gap-[14px]">
      <div className="flex flex-col items-center">
        <span className={`rounded-[8px] px-[9px] py-[3px] text-[11px] font-semibold ${accentClass}`}>
          {railChipLabel(entry)}
        </span>
        {!isLast && <div className="w-px flex-1 bg-hair" />}
      </div>
      <div className="mb-[10px] flex-1 rounded-[12px] border border-hair bg-card px-[14px] py-[12px]">
        <div className="flex items-start justify-between gap-[10px]">
          <b className={`text-[12px] ${ACCENT_TEXT_CLASS[entry.accent]}`}>{entry.headline}</b>
          <span className="whitespace-nowrap text-[11px] text-lavdim">{timeAgo(entry.date)}</span>
        </div>
        {entry.consequence && <p className="mt-[4px] text-[11px] text-lavdim">{entry.consequence}</p>}
        <VersionPlayback entry={entry} />
        <ProducerHandoffDownloads entry={entry} />
        {entry.canRemove && onRemoveNote && <NoteRemoveControl onRemove={() => onRemoveNote(entry.id)} />}
      </div>
    </div>
  )
}

// ─── DiaryFeed ────────────────────────────────────────────────────────

// Search over exactly what a row SHOWS — its headline and consequence. A
// person's @handle and a section label ("Verse 2") both live in the headline,
// so a free-text match answers "find by person" and "find by section" without
// inventing structured fields the diary row does not carry. Exported so the
// match rule is unit-tested directly (this repo has no jsdom to drive the
// input). An empty query matches everything.
export function diaryMatchesQuery(
  entry: Pick<DiaryFeedEntry, 'headline' | 'consequence'>,
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${entry.headline} ${entry.consequence ?? ''}`.toLowerCase().includes(q)
}

function DiaryRows({
  entries,
  layout,
  onRemoveNote,
}: {
  entries: DiaryFeedEntry[]
  layout: DiaryFeedLayout
  onRemoveNote?: (id: string) => void
}) {
  if (layout === 'rail') {
    return (
      <div className="flex flex-col gap-0">
        {entries.map((entry, i) => (
          <RailRow key={entry.id} entry={entry} isLast={i === entries.length - 1} onRemoveNote={onRemoveNote} />
        ))}
      </div>
    )
  }
  return (
    <div className="rounded-[12px] border border-hair bg-card px-[14px]">
      {entries.map(entry => (
        <CompactRow key={entry.id} entry={entry} onRemoveNote={onRemoveNote} />
      ))}
    </div>
  )
}

export function DiaryFeed({ entries, layout = 'compact', collapseAfter, onRemoveNote }: DiaryFeedProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (normalizedQuery ? entries.filter(entry => diaryMatchesQuery(entry, normalizedQuery)) : entries),
    [entries, normalizedQuery]
  )

  if (entries.length === 0) {
    // One quiet line — a brand-new song's page is already carrying the
    // composer's empty-state hero above, so this stays a footnote, not a
    // second pitch.
    return <p className="text-[11px] text-lavdim">Nothing recorded yet — it fills in as you add to this song above.</p>
  }

  // Chrome (search + the collapse toggle) appears only once the diary is long
  // enough to need finding — a short one stays a plain list, per 005-C.
  const canCollapse = collapseAfter != null && entries.length > collapseAfter
  const collapsed = canCollapse && !expanded && !normalizedQuery && filtered.length > collapseAfter
  const visible = collapsed ? filtered.slice(0, collapseAfter) : filtered

  return (
    <div>
      {canCollapse && (
        <div className="mb-[10px]">
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search the diary"
            placeholder="Search updates — a name, a section…"
            className="w-full rounded-[9px] border border-hair bg-card px-[11px] py-[7px] text-[12px] text-white/95 outline-none placeholder:text-lavdim"
          />
        </div>
      )}

      {normalizedQuery && filtered.length === 0 ? (
        <p className="text-[11px] text-lavdim">No updates match “{query}”.</p>
      ) : (
        <DiaryRows entries={visible} layout={layout} onRemoveNote={onRemoveNote} />
      )}

      {collapsed && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-[10px] text-[11px] font-semibold text-lav hover:text-white"
        >
          Show all {filtered.length} updates ↓
        </button>
      )}
      {canCollapse && expanded && !normalizedQuery && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-[10px] text-[11px] font-semibold text-lavdim hover:text-lav"
        >
          Show fewer ↑
        </button>
      )}
    </div>
  )
}
