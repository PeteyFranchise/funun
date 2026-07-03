// ─── Genre → platform advisory nudge map (D-08) ───────────────────────────────
// Hardcoded TS map — no DB table, no admin UI. Advisory only (D-09): surfaced
// as badges next to genre-recommended platforms in the selector, nothing is
// pre-checked. Mirrors lib/benchmarks/engine.ts's GENRE_FACTORS defensive
// lowercase/trim lookup + graceful `?? {}`-style fallback pattern.

import type { Platform } from '@/lib/launchpad/campaigns'

export type PlatformNudge = {
  platforms: Platform[]
  rationale: string
}

// Keyed by the 20 canonical genre slugs from lib/genres.ts.
export const GENRE_PLATFORM_NUDGES: Record<string, PlatformNudge> = {
  pop: {
    platforms: ['tiktok', 'instagram', 'youtube_shorts'],
    rationale: 'Short-form hook culture drives pop discovery; visual-forward',
  },
  hip_hop_rap: {
    platforms: ['tiktok', 'x', 'instagram'],
    rationale: 'TikTok sound-driven virality; X for culture/discourse',
  },
  rnb_soul: {
    platforms: ['instagram', 'tiktok', 'threads'],
    rationale: 'Visual mood + intimate captioning outperforms pure short-form churn',
  },
  rock: {
    platforms: ['instagram', 'youtube_shorts', 'facebook'],
    rationale: 'Older core audience skews Facebook/YouTube; Instagram for visuals',
  },
  electronic_dance: {
    platforms: ['tiktok', 'instagram', 'youtube_shorts'],
    rationale: 'Visual/audio-loop format matches EDM drops',
  },
  country: {
    platforms: ['facebook', 'instagram', 'tiktok'],
    rationale: 'Country audience over-indexes on Facebook vs. general population',
  },
  latin: {
    platforms: ['tiktok', 'instagram', 'youtube_shorts'],
    rationale: 'High TikTok/Reels penetration in Latin music discovery',
  },
  jazz: {
    platforms: ['instagram', 'facebook', 'youtube_shorts'],
    rationale: 'Older/niche audience, long-form-friendly platforms',
  },
  classical: {
    platforms: ['youtube_shorts', 'instagram', 'facebook'],
    rationale: 'Visual/performance clips; niche audience skews YouTube',
  },
  folk_americana: {
    platforms: ['instagram', 'facebook', 'youtube_shorts'],
    rationale: 'Story-driven captioning fits Instagram; older audience on Facebook',
  },
  reggae: {
    platforms: ['instagram', 'tiktok', 'facebook'],
    rationale: 'Broad diaspora reach across all three',
  },
  gospel_christian: {
    platforms: ['facebook', 'instagram', 'youtube_shorts'],
    rationale: 'Facebook remains a strong community hub for this audience',
  },
  metal: {
    platforms: ['instagram', 'youtube_shorts', 'x'],
    rationale: 'Visual + community-discourse platforms',
  },
  alternative: {
    platforms: ['instagram', 'tiktok', 'x'],
    rationale: 'Balanced across visual + discourse platforms',
  },
  indie: {
    platforms: ['instagram', 'tiktok', 'threads'],
    rationale: 'Text/photo-forward audience, early Threads adopters',
  },
  blues: {
    platforms: ['facebook', 'instagram', 'youtube_shorts'],
    rationale: 'Older core audience',
  },
  funk: {
    platforms: ['instagram', 'tiktok', 'youtube_shorts'],
    rationale: 'Dance/visual-forward genre',
  },
  afrobeats: {
    platforms: ['tiktok', 'instagram', 'youtube_shorts'],
    rationale: 'Extremely strong TikTok-driven global discovery pattern',
  },
  k_pop: {
    platforms: ['tiktok', 'instagram', 'x'],
    rationale: 'X/Twitter fandom-community culture is unusually strong for K-pop specifically',
  },
  world_global: {
    platforms: ['instagram', 'youtube_shorts', 'facebook'],
    rationale: 'Broadest-reach default when genre is highly specific/unmapped',
  },
}

// Common free-text forms (from vault_projects.genre, a plain text input) mapped
// to their canonical slug — the free-text field will never contain the
// underscore-slug form directly, so this closes the gap defensively.
export const GENRE_ALIASES: Record<string, string> = {
  'r&b': 'rnb_soul',
  rnb: 'rnb_soul',
  'r & b': 'rnb_soul',
  'hip-hop': 'hip_hop_rap',
  'hip hop': 'hip_hop_rap',
  hiphop: 'hip_hop_rap',
  rap: 'hip_hop_rap',
  edm: 'electronic_dance',
  electronic: 'electronic_dance',
  dance: 'electronic_dance',
  kpop: 'k_pop',
  'k-pop': 'k_pop',
  gospel: 'gospel_christian',
  christian: 'gospel_christian',
  americana: 'folk_americana',
  folk: 'folk_americana',
}

function resolveNudge(
  profileGenres: string[] | null | undefined,
  projectGenreFreeText: string | null | undefined
): PlatformNudge | null {
  if (Array.isArray(profileGenres) && profileGenres.length > 0) {
    for (const raw of profileGenres) {
      const slug = String(raw ?? '').trim().toLowerCase()
      if (slug && GENRE_PLATFORM_NUDGES[slug]) return GENRE_PLATFORM_NUDGES[slug]
    }
  }

  const freeText = String(projectGenreFreeText ?? '').trim().toLowerCase()
  if (!freeText) return null
  if (GENRE_PLATFORM_NUDGES[freeText]) return GENRE_PLATFORM_NUDGES[freeText]
  const aliased = GENRE_ALIASES[freeText]
  if (aliased && GENRE_PLATFORM_NUDGES[aliased]) return GENRE_PLATFORM_NUDGES[aliased]

  return null
}

/**
 * Resolve a genre (profile slugs preferred, project free text as fallback) to
 * a ranked platform advisory list. Degrades to an empty list on no match —
 * never an error, never a default — per D-09 "advisory-only, no broken UI."
 */
export function getPlatformNudges(
  profileGenres: string[] | null | undefined,
  projectGenreFreeText: string | null | undefined
): Platform[] {
  return resolveNudge(profileGenres, projectGenreFreeText)?.platforms ?? []
}

/** Same resolution as getPlatformNudges(), returning the badge rationale text (or ''). */
export function getPlatformNudgeRationale(
  profileGenres: string[] | null | undefined,
  projectGenreFreeText: string | null | undefined
): string {
  return resolveNudge(profileGenres, projectGenreFreeText)?.rationale ?? ''
}
