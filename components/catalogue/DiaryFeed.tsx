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
// the page in its own place, not here.
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
}

export type DiaryFeedLayout = 'compact' | 'rail'

export type DiaryFeedProps = {
  entries: DiaryFeedEntry[]
  /** 'compact' (001-C, desktop default) or 'rail' (001-A, mobile). Defaults to 'compact'. */
  layout?: DiaryFeedLayout
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

// ─── Compact rows (001-C) — the default ─────────────────────────────────

function CompactRow({ entry }: { entry: DiaryFeedEntry }) {
  return (
    <div className="border-b border-hair py-[10px] last:border-none">
      <div className="flex items-start justify-between gap-[10px]">
        <b className="text-[12px] text-lav">{entry.headline}</b>
        <span className="whitespace-nowrap text-[11px] text-lavdim">{timeAgo(entry.date)}</span>
      </div>
      {entry.consequence && <p className="mt-[2px] text-[11px] text-lavdim">{entry.consequence}</p>}
      <VersionPlayback entry={entry} />
    </div>
  )
}

// ─── Rail treatment (001-A) — kind chips on a connecting line ──────────

function RailRow({ entry, isLast }: { entry: DiaryFeedEntry; isLast: boolean }) {
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
      </div>
    </div>
  )
}

// ─── DiaryFeed ────────────────────────────────────────────────────────

export function DiaryFeed({ entries, layout = 'compact' }: DiaryFeedProps) {
  if (entries.length === 0) {
    // One quiet line — a brand-new song's page is already carrying the
    // composer's empty-state hero above, so this stays a footnote, not a
    // second pitch.
    return <p className="text-[11px] text-lavdim">Nothing recorded yet — it fills in as you add to this song above.</p>
  }

  if (layout === 'rail') {
    return (
      <div className="flex flex-col gap-0">
        {entries.map((entry, i) => (
          <RailRow key={entry.id} entry={entry} isLast={i === entries.length - 1} />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-[12px] border border-hair bg-card px-[14px]">
      {entries.map(entry => (
        <CompactRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}
