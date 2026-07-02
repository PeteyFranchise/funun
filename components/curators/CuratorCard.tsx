'use client'

import { PLATFORM_LABELS } from '@/lib/curators/schema'
import type { DirectoryCurator } from '@/lib/curators/response-rate'

// ─── CuratorCard ──────────────────────────────────────────────────────
// Renders a single curator in the directory grid. Reused later (06-04) by
// the pitch composer's multi-select in a compact mode via the same
// selectable/disabled props.
//
// Locked display states (UI-SPEC):
// - response-rate badge hidden entirely (not "0%") when response_rate is null
// - reach_signal null renders "Reach signal not yet available", never "0"
// - status pills use exact colors; drift pill always pairs an icon with text

const MAX_VISIBLE_GENRES = 3

function AmberWarningIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3 flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-2.96L13.71 3.86a2 2 0 0 0-3.42 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function formatReach(n: number): string {
  return `~${n.toLocaleString()}`
}

type Props = {
  curator: DirectoryCurator
  selectable?: boolean
  selected?: boolean
  disabled?: boolean
  disabledLabel?: string
  onToggle?: (curatorId: string) => void
}

export function CuratorCard({
  curator,
  selectable = false,
  selected = false,
  disabled = false,
  disabledLabel,
  onToggle,
}: Props) {
  const genres = curator.genre_focus ?? []
  const visibleGenres = genres.slice(0, MAX_VISIBLE_GENRES)
  const overflowCount = genres.length - visibleGenres.length

  return (
    <div
      className={[
        'relative rounded-[18px] border bg-card p-4',
        curator.drift_flagged ? 'border-hair border-l-2 border-l-amber-400/70' : 'border-hair',
        disabled ? 'opacity-60' : '',
      ].join(' ')}
    >
      {selectable && (
        <div className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle?.(curator.id)}
            aria-label={
              disabled
                ? `${curator.name} — already pitched, cannot re-select`
                : `Select ${curator.name} for pitch`
            }
            className="h-5 w-5 accent-brandindigo"
          />
        </div>
      )}

      <p className="pr-8 text-[14px] font-bold text-white">{curator.name}</p>
      {disabled && disabledLabel && <p className="mt-0.5 text-xs text-white/30">{disabledLabel}</p>}

      <p className="mt-1 text-[12.5px] text-lavdim">
        {curator.playlist_name ?? 'Untitled playlist'} · {PLATFORM_LABELS[curator.platform]}
      </p>

      {visibleGenres.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleGenres.map(genre => (
            <span
              key={genre}
              className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav"
            >
              {genre}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="rounded-full border border-hair bg-card2 px-2 py-0.5 text-[11px] text-lav">
              +{overflowCount} more
            </span>
          )}
        </div>
      )}

      <p className="mt-2 text-[12.5px] text-lavdim">
        {curator.reach_signal !== null
          ? `${formatReach(curator.reach_signal)} followers/subscribers`
          : 'Reach signal not yet available'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {curator.claimed && (
          <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
            Claimed profile
          </span>
        )}
        {!curator.email_valid && (
          <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
            Email bounced
          </span>
        )}
        {curator.drift_flagged && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            <AmberWarningIcon />
            Genre focus may have shifted
          </span>
        )}
        {curator.do_not_pitch && (
          <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/50">
            Unsubscribed
          </span>
        )}
      </div>

      {curator.response_rate !== null && (
        <p className="mt-3 text-right text-[12.5px] font-bold">
          <span className="gtext">{curator.response_rate}% response rate</span>
        </p>
      )}
    </div>
  )
}
