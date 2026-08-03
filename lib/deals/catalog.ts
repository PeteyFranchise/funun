import type { Stage3Result } from '@/lib/vault/stage3'
import {
  MOOD_VALUES,
  ENERGY_VALUES,
  VOCAL_VALUES,
  readDescriptors,
  type Mood,
  type EnergyLevel,
  type VocalType,
} from '@/lib/metadata/schema'
import { ALL_GENRE_SLUGS } from '@/lib/genres'

// ─── isRightsReady (D-16, RESEARCH Open Question 3 / Assumption A4) ──────
// The SINGLE named helper expressing the rights-ready definition for buyer
// catalog browse. CATALOG_READINESS_THRESHOLD is deliberately TUNABLE in
// this one place — the beta definition is public AND readiness at or above
// the threshold AND computeStage3().canContinue, and product may raise or
// lower it after observing how much catalog surfaces. Deliberately NOT a
// boolean flag column on vault_projects (RESEARCH Don't Hand-Roll) — a
// parallel flag would desync from the readiness pipeline the first time
// either changes.
//
// Pure: accepts an already-fetched project shape and an already-computed
// Stage3Result, so callers do the I/O (see app/api/buyer/catalog/route.ts,
// lib/deals/request-target.ts) and this stays unit-testable without a DB.
export const CATALOG_READINESS_THRESHOLD = 60

export type CatalogProjectLike = {
  is_public: boolean | null
  vault_readiness_score: number | null
}

export function isRightsReady(project: CatalogProjectLike, stage3: Stage3Result): boolean {
  if (project.is_public !== true) return false
  if (project.vault_readiness_score == null) return false // fail closed on missing readiness
  if (project.vault_readiness_score < CATALOG_READINESS_THRESHOLD) return false
  return stage3.canContinue
}

// ─── normalizeKeySignature (D-16b) ────────────────────────────────────────
// tracks.key_signature is an unconstrained TEXT column with no CHECK, so
// existing rows may hold varied notations ("F major", "F", "Fmaj", "Fm",
// "F minor", "Bb", "Bbmin", "C#"...). Normalizes to a canonical short form
// (note letter + optional accidental '#'/'b' + optional trailing 'm' for
// minor) so the key filter matches every notation of the same key
// consistently. Returns null for unparseable/empty input — callers treat
// null exactly like a missing key_signature (excluded when the filter is
// active, included when it is not).
export function normalizeKeySignature(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const letterMatch = trimmed.match(/^[A-Ga-g]/)
  if (!letterMatch) return null
  const letter = letterMatch[0].toUpperCase()

  let rest = trimmed.slice(1)
  let accidental = ''
  if (rest[0] === '#' || rest[0] === '♯') {
    accidental = '#'
    rest = rest.slice(1)
  } else if (rest[0] === 'b' || rest[0] === '♭') {
    accidental = 'b'
    rest = rest.slice(1)
  }

  const remainder = rest.trim().toLowerCase()
  const isMinor = /^(minor|min|m)\b/.test(remainder)

  return `${letter}${accidental}${isMinor ? 'm' : ''}`
}

// ─── Catalog filter vocabulary (D-16) ─────────────────────────────────────
// No free-text query parameter — filtered browse only. buildCatalogFilter
// normalizes/validates raw (string | null) query-param input into a typed
// filter object the route applies; unrecognized/invalid values are dropped
// silently (mirrors sanitizeDescriptors' convention), never thrown.

export type CatalogFilter = {
  genre: string | null
  mood: Mood | null
  energy: EnergyLevel | null
  vocal: VocalType | null
  usageCleared: boolean
  /** Normalized key signatures (see normalizeKeySignature); empty = inactive. */
  keys: string[]
  bpmMin: number | null
  bpmMax: number | null
}

export type RawCatalogParams = {
  genre?: string | null
  mood?: string | null
  energy?: string | null
  vocal?: string | null
  usageCleared?: string | null
  /** Comma-separated raw key signatures, normalized internally. */
  key?: string | null
  bpmMin?: string | null
  bpmMax?: string | null
}

function parseBpmBound(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

export function buildCatalogFilter(params: RawCatalogParams): CatalogFilter {
  const genre =
    typeof params.genre === 'string' && ALL_GENRE_SLUGS.includes(params.genre) ? params.genre : null

  const mood =
    typeof params.mood === 'string' && MOOD_VALUES.includes(params.mood as Mood)
      ? (params.mood as Mood)
      : null

  const energy =
    typeof params.energy === 'string' && ENERGY_VALUES.includes(params.energy as EnergyLevel)
      ? (params.energy as EnergyLevel)
      : null

  const vocal =
    typeof params.vocal === 'string' && VOCAL_VALUES.includes(params.vocal as VocalType)
      ? (params.vocal as VocalType)
      : null

  const usageCleared = params.usageCleared === 'true' || params.usageCleared === '1'

  const keys =
    typeof params.key === 'string' && params.key.trim() !== ''
      ? Array.from(
          new Set(
            params.key
              .split(',')
              .map(k => normalizeKeySignature(k))
              .filter((k): k is string => k != null)
          )
        )
      : []

  let bpmMin = parseBpmBound(params.bpmMin)
  let bpmMax = parseBpmBound(params.bpmMax)
  // A caller-inverted range (min > max) is treated as no active filter on
  // either bound rather than silently excluding every project.
  if (bpmMin != null && bpmMax != null && bpmMin > bpmMax) {
    bpmMin = null
    bpmMax = null
  }

  return { genre, mood, energy, vocal, usageCleared, keys, bpmMin, bpmMax }
}

// ─── Track-level predicates (D-16b) ────────────────────────────────────────
// Key/BPM live on TRACKS while the catalog browses PROJECTS: a project
// matches when ANY of its tracks matches. A project whose tracks are all
// null on the relevant column is EXCLUDED only when that specific filter is
// active — never silently dropped from an unfiltered browse. Range
// boundaries are inclusive on both ends.

export type CatalogTrackLike = {
  bpm?: number | null
  key_signature?: string | null
}

export function projectMatchesKeyBpm(tracks: CatalogTrackLike[], filter: CatalogFilter): boolean {
  const bpmActive = filter.bpmMin != null || filter.bpmMax != null
  if (bpmActive) {
    const anyBpmMatch = tracks.some(t => {
      if (t.bpm == null) return false
      if (filter.bpmMin != null && t.bpm < filter.bpmMin) return false
      if (filter.bpmMax != null && t.bpm > filter.bpmMax) return false
      return true
    })
    if (!anyBpmMatch) return false
  }

  const keyActive = filter.keys.length > 0
  if (keyActive) {
    const anyKeyMatch = tracks.some(t => {
      const norm = normalizeKeySignature(t.key_signature)
      return norm != null && filter.keys.includes(norm)
    })
    if (!anyKeyMatch) return false
  }

  return true
}

// ─── Descriptor predicates (D-16c) ─────────────────────────────────────────
// Mood/energy/vocal read tracks.metadata's `descriptors` object (plan
// 16-00). Like key/BPM these are track-level, so the same any-track-matches
// rule applies. Reuses readDescriptors rather than re-parsing the JSONB.

export type CatalogTrackWithMetadata = CatalogTrackLike & {
  metadata?: Record<string, unknown> | null
}

export function projectMatchesDescriptors(
  tracks: CatalogTrackWithMetadata[],
  filter: CatalogFilter
): boolean {
  if (!filter.mood && !filter.energy && !filter.vocal) return true
  return tracks.some(t => {
    const d = readDescriptors(t.metadata)
    if (!d) return false
    if (filter.mood && !d.moods.includes(filter.mood)) return false
    if (filter.energy && d.energy !== filter.energy) return false
    if (filter.vocal && d.vocal !== filter.vocal) return false
    return true
  })
}

// ─── Usage-cleared predicate (D-15) ────────────────────────────────────────
// "Usage cleared" means the project has pre-cleared terms set at all
// (project_license_terms row exists) — a request against it can match
// automatically rather than routing to admin negotiation (D-15a). The route
// resolves project-id membership in one batched query; this stays pure.
export function projectMatchesUsageCleared(hasPreclearedTerms: boolean, filter: CatalogFilter): boolean {
  if (!filter.usageCleared) return true
  return hasPreclearedTerms
}

// ─── CatalogCard — client-safe display shape ───────────────────────────────
// No owner contact details and no non-public availability signals (D-14a).
// Shared between the API route and the server-rendered first page so both
// surfaces agree on exactly what a buyer may see.
export type CatalogCard = {
  id: string
  title: string
  type: string
  genre: string | null
  coverArtUrl: string | null
  tracks: { id: string; title: string | null; bpm: number | null; keySignature: string | null }[]
}
