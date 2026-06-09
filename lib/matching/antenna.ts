import type {
  Opportunity,
  MatchBreakdown,
  MatchFactor,
  VaultProjectType,
} from '@/types'

/**
 * The Antenna matching engine.
 *
 * Pure, deterministic scoring of a single opportunity against an artist's
 * vault projects. No I/O — callers (the /api/antenna/match route, opportunity
 * create, nightly job) fetch rows, normalize them into the shapes below, run
 * this, then persist the results into opportunity_matches.
 *
 * Scoring is out of 100:
 *   Genre        30  (full 30 / partial 15 / none 0)
 *   Readiness    20  (vault_readiness_score / 5, capped)
 *   Listeners    20  (in-range 20 / within 20% 10 / out 0 / no-requirement 20)
 *   Mood         20  ((matching tags / requested tags) * 20)
 *   Career stage 10  (artist stage in opportunity.career_stages)
 *
 * A match is only surfaced when score >= MATCH_THRESHOLD (50) AND the project
 * clears the opportunity's hard min_readiness_score gate.
 */

export const MATCH_THRESHOLD = 50

export type MatchableProject = {
  id: string
  title: string
  type: VaultProjectType
  genre: string | null
  vault_readiness_score: number
  /** Mood tags pulled from the project / its tracks, if any. */
  mood_tags?: string[]
}

export type MatchableArtist = {
  genre: string | null
  monthly_listeners: number | null
  career_stage: number
  location: string | null
  /** Mood tags from the artist's sound_identity, if analyzed. */
  mood_tags?: string[]
}

export type ProjectMatch = {
  projectId: string
  projectTitle: string
  score: number
  breakdown: MatchBreakdown
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

// ─── Genre (30) ───────────────────────────────────────────────────────
function scoreGenre(opp: Opportunity, project: MatchableProject, artist: MatchableArtist): MatchFactor {
  const wanted = opp.genres.map(norm).filter(Boolean)
  const candidates = [project.genre, artist.genre].filter(Boolean).map(g => norm(g as string))

  if (wanted.length === 0) {
    return { key: 'genre', label: 'Genre fit', earned: 30, max: 30, detail: 'Open to all genres' }
  }
  if (candidates.length === 0) {
    return { key: 'genre', label: 'Genre fit', earned: 0, max: 30, detail: 'No genre on the project yet' }
  }

  const exact = candidates.some(c => wanted.includes(c))
  if (exact) {
    return { key: 'genre', label: 'Genre fit', earned: 30, max: 30, detail: 'Exact genre match' }
  }

  // Partial: one side is a token-substring of the other (e.g. "Alt R&B" ⊃ "R&B").
  const partial = candidates.some(c => wanted.some(w => c.includes(w) || w.includes(c)))
  if (partial) {
    return { key: 'genre', label: 'Genre fit', earned: 15, max: 30, detail: 'Related genre' }
  }

  return { key: 'genre', label: 'Genre fit', earned: 0, max: 30, detail: 'Genre mismatch' }
}

// ─── Readiness (20) ───────────────────────────────────────────────────
function scoreReadiness(project: MatchableProject): MatchFactor {
  const earned = Math.max(0, Math.min(20, Math.round(project.vault_readiness_score / 5)))
  return {
    key: 'readiness',
    label: 'Vault readiness',
    earned,
    max: 20,
    detail: `Readiness ${project.vault_readiness_score}/100`,
  }
}

// ─── Listeners (20) ───────────────────────────────────────────────────
function scoreListeners(opp: Opportunity, artist: MatchableArtist): MatchFactor {
  const { min_monthly_listeners: min, max_monthly_listeners: max } = opp
  if (min == null && max == null) {
    return { key: 'listeners', label: 'Audience size', earned: 20, max: 20, detail: 'No audience requirement' }
  }
  const l = artist.monthly_listeners
  if (l == null) {
    return { key: 'listeners', label: 'Audience size', earned: 0, max: 20, detail: 'No monthly listeners on profile' }
  }

  const aboveMin = min == null || l >= min
  const belowMax = max == null || l <= max
  if (aboveMin && belowMax) {
    return { key: 'listeners', label: 'Audience size', earned: 20, max: 20, detail: 'Audience in target range' }
  }

  // Within 20% of the nearest boundary → half credit.
  const near =
    (min != null && l < min && l >= min * 0.8) ||
    (max != null && l > max && l <= max * 1.2)
  if (near) {
    return { key: 'listeners', label: 'Audience size', earned: 10, max: 20, detail: 'Just outside target range' }
  }

  return { key: 'listeners', label: 'Audience size', earned: 0, max: 20, detail: 'Audience outside target range' }
}

// ─── Mood (20) ────────────────────────────────────────────────────────
function scoreMood(opp: Opportunity, project: MatchableProject, artist: MatchableArtist): MatchFactor {
  const wanted = opp.mood_tags.map(norm).filter(Boolean)
  if (wanted.length === 0) {
    return { key: 'mood', label: 'Mood match', earned: 20, max: 20, detail: 'No mood requirement' }
  }
  const have = new Set([...(project.mood_tags ?? []), ...(artist.mood_tags ?? [])].map(norm))
  const hits = wanted.filter(w => have.has(w)).length
  const earned = Math.round((hits / wanted.length) * 20)
  return {
    key: 'mood',
    label: 'Mood match',
    earned,
    max: 20,
    detail: hits === 0 ? 'No matching mood tags' : `${hits} of ${wanted.length} mood tags match`,
  }
}

// ─── Career stage (10) ────────────────────────────────────────────────
function scoreCareer(opp: Opportunity, artist: MatchableArtist): MatchFactor {
  const stages = opp.career_stages?.length ? opp.career_stages : [1, 2, 3, 4]
  const ok = stages.includes(artist.career_stage)
  return {
    key: 'career',
    label: 'Career stage',
    earned: ok ? 10 : 0,
    max: 10,
    detail: ok ? 'Career stage in range' : 'Career stage outside target',
  }
}

function scoreProject(
  opp: Opportunity,
  project: MatchableProject,
  artist: MatchableArtist
): MatchBreakdown {
  const factors: MatchFactor[] = [
    scoreGenre(opp, project, artist),
    scoreReadiness(project),
    scoreListeners(opp, artist),
    scoreMood(opp, project, artist),
    scoreCareer(opp, artist),
  ]
  const total = factors.reduce((s, f) => s + f.earned, 0)
  return { total, factors }
}

/**
 * Score every project against one opportunity and return the qualifying
 * matches (>= MATCH_THRESHOLD, clearing the hard min_readiness_score gate),
 * sorted best-first.
 */
export function matchOpportunityToVault(
  opportunity: Opportunity,
  projects: MatchableProject[],
  artist: MatchableArtist
): ProjectMatch[] {
  const minReadiness = opportunity.min_readiness_score ?? 0
  const matches: ProjectMatch[] = []

  for (const project of projects) {
    // Hard gate: don't surface under-baked projects.
    if (project.vault_readiness_score < minReadiness) continue

    const breakdown = scoreProject(opportunity, project, artist)
    if (breakdown.total < MATCH_THRESHOLD) continue

    matches.push({
      projectId: project.id,
      projectTitle: project.title,
      score: breakdown.total,
      breakdown,
    })
  }

  return matches.sort((a, b) => b.score - a.score)
}
