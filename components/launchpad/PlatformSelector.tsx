'use client'

import { getPlatformNudges } from '@/lib/launchpad/platform-nudges'
import { PLATFORM_VALUES, PLATFORM_LABELS } from '@/lib/launchpad/campaigns'
import { GENRES } from '@/lib/genres'
import type { Platform } from '@/lib/launchpad/campaigns'

// ─── PlatformSelector ────────────────────────────────────────────────────────
// Multi-select panel for social platforms. Shows advisory "Best fit for {Genre}"
// badges next to genre-recommended platforms (D-09), but nothing is pre-checked
// regardless of nudge badges — the artist makes the selection explicitly.
//
// Sibling model: CuratorCard.tsx (checkbox h-5 w-5 accent-brandindigo) +
// PitchComposer.tsx (outer card rounded-[18px] border border-hair bg-card p-5).

// Resolve a genre label from a slug or free-text string
function resolveGenreLabel(
  profileGenres: string[] | null,
  projectGenre: string | null
): string | null {
  const sources = [
    ...(profileGenres ?? []),
    ...(projectGenre ? [projectGenre] : []),
  ]
  for (const raw of sources) {
    const slug = String(raw ?? '').trim().toLowerCase()
    const match = GENRES.find(g => g.slug === slug)
    if (match) return match.label
    // Try free-text label match (case-insensitive)
    const labelMatch = GENRES.find(g => g.label.toLowerCase() === slug)
    if (labelMatch) return labelMatch.label
  }
  // Fallback: capitalize the first source value
  const first = sources[0]
  if (!first) return null
  const s = String(first).trim()
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

export function PlatformSelector({
  selected,
  onChange,
  profileGenres,
  projectGenre,
  onGenerate,
  generating,
}: {
  selected: Platform[]
  onChange: (next: Platform[]) => void
  profileGenres: string[] | null
  projectGenre: string | null
  onGenerate: () => void
  generating: boolean
}) {
  // Pure client-side nudge lookup — no fetch, no loading state
  const nudgedPlatforms = getPlatformNudges(profileGenres, projectGenre)
  const genreLabel = resolveGenreLabel(profileGenres, projectGenre)

  function togglePlatform(platform: Platform) {
    const next = selected.includes(platform)
      ? selected.filter(p => p !== platform)
      : [...selected, platform]
    onChange(next)
  }

  const isDisabled = selected.length === 0 || generating

  return (
    <div className="rounded-[18px] border border-hair bg-card p-5">
      <h2 className="text-[15px] font-bold text-white">Platforms</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PLATFORM_VALUES.map(platform => {
          const isSelected = selected.includes(platform)
          const isNudged = nudgedPlatforms.includes(platform)

          return (
            <label
              key={platform}
              className={[
                'flex cursor-pointer flex-col justify-between rounded-[14px] border px-4 py-3 transition',
                isSelected
                  ? 'border-brandindigo/50 bg-brandindigo/10'
                  : 'border-hair bg-card2',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                {/* Checkbox — native, mirrors CuratorCard.tsx accent-brandindigo pattern */}
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brandindigo"
                  checked={isSelected}
                  onChange={() => togglePlatform(platform)}
                  aria-label={`Select ${PLATFORM_LABELS[platform]}`}
                />
                <span
                  className={
                    isSelected
                      ? 'text-[14px] font-bold text-white'
                      : 'text-[14px] text-white/70'
                  }
                >
                  {PLATFORM_LABELS[platform]}
                </span>
              </div>

              {/* Genre nudge badge — advisory only, mirrors CuratorCard's "Claimed profile" pill */}
              {isNudged && genreLabel && (
                <span className="mt-1.5 inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
                  Best fit for {genreLabel}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {/* Generate CTA */}
      <div className="mt-5">
        <button
          type="button"
          onClick={onGenerate}
          disabled={isDisabled}
          title={selected.length === 0 ? 'Select at least one platform' : undefined}
          className={[
            'rounded-lg bg-grad px-4 py-2.5 text-sm font-bold text-white shadow-cta transition',
            isDisabled ? 'cursor-not-allowed opacity-40' : '',
          ].join(' ')}
        >
          {generating ? 'Generating…' : 'Generate calendar'}
        </button>
      </div>
    </div>
  )
}
