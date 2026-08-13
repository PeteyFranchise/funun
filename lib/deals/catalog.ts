import type { Stage3Result } from '@/lib/vault/stage3'
import {
  MOOD_VALUES,
  ENERGY_VALUES,
  VOCAL_VALUES,
  MOOD_LABELS,
  ENERGY_LABELS,
  VOCAL_LABELS,
  INSTRUMENT_LABELS,
  readDescriptors,
  type Mood,
  type EnergyLevel,
  type VocalType,
} from '@/lib/metadata/schema'
import { ALL_GENRE_SLUGS } from '@/lib/genres'
import { rightsBadge, RIGHTS_BADGE_TO_CATALOG_RIGHTS, type CatalogRightsCode } from '@/lib/sync-library/gate'

// ─── isAdmittedToSyncLibrary (26-06) ──────────────────────────────────────
// The SINGLE admission-authority predicate for buyer-catalogue membership,
// replacing the beta is_public-based eligibility placeholder (RESEARCH
// Open Question 3). A project is admitted only when it has at least one
// sync_listings row with status = 'admitted' (SONG-LEVEL per
// 26-CONTEXT.md — a project may have several tracks, only some of which
// are admitted; callers resolve has_admitted_sync_listing per PROJECT by
// checking existence across its tracks/rows before calling this). Pure:
// accepts the already-resolved boolean signal, no I/O — both catalogue
// callers (lib/deals/catalog-query.ts's loadCatalogPage and
// lib/deals/request-target.ts's authorizeRequestTarget) do the sync_listings
// lookup and call this ONE helper (T-26-24 — no third inline copy).
// Fails closed: null/false/missing all resolve to false, never to
// "assume admitted".
export function isAdmittedToSyncLibrary(project: { has_admitted_sync_listing: boolean | null }): boolean {
  return project.has_admitted_sync_listing === true
}

// ─── isRightsReady (D-16, RESEARCH Open Question 3 / Assumption A4) ──────
// The SINGLE named helper expressing the rights-ready definition for buyer
// catalog browse. CATALOG_READINESS_THRESHOLD is deliberately TUNABLE in
// this one place — the beta definition is sync-library ADMITTED (26-06,
// replacing the old is_public placeholder) AND readiness at or above the
// threshold AND computeStage3().canContinue, and product may raise or
// lower the threshold after observing how much catalog surfaces.
// Deliberately NOT a boolean flag column on vault_projects (RESEARCH
// Don't Hand-Roll) — a parallel flag would desync from the readiness
// pipeline the first time either changes.
//
// Pure: accepts an already-fetched project shape and an already-computed
// Stage3Result, so callers do the I/O (see lib/deals/catalog-query.ts,
// lib/deals/request-target.ts, lib/deals/shortlists.ts) and this stays
// unit-testable without a DB.
export const CATALOG_READINESS_THRESHOLD = 60

export type CatalogProjectLike = {
  has_admitted_sync_listing: boolean | null
  vault_readiness_score: number | null
}

export function isRightsReady(project: CatalogProjectLike, stage3: Stage3Result): boolean {
  if (!isAdmittedToSyncLibrary(project)) return false
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

// ─── descriptorsToDisplay (30-07) ──────────────────────────────────────────
// Turns a track's CONFIRMED descriptors (readDescriptors — artist-authored,
// never ai_suggested/pending) into the plain display strings CatalogRow
// expects. CatalogRow.mood/energy/vocal are single display strings, not
// lists, so the headline mood is the first confirmed mood (mirrors the
// SAMPLE_CATALOG_ROWS fixture's one-mood-per-row shape). Untagged/missing
// descriptors resolve to blank strings/empty array — never throw, never
// synthesize a placeholder. Uses the SAME controlled vocab (MOOD_LABELS/
// ENERGY_LABELS/VOCAL_LABELS/INSTRUMENT_LABELS, lib/metadata/schema.ts) the
// artist-facing MetadataStudio and the buyer filters already share — no
// second instrument/mood vocabulary defined here (30-RESEARCH "Layered
// Tagging" gap, now closed by 30-02's INSTRUMENT_VALUES).
export type CatalogDescriptorDisplay = {
  mood: string
  energy: string
  vocal: string
  instruments: string[]
}

export function descriptorsToDisplay(track: {
  metadata?: Record<string, unknown> | null
}): CatalogDescriptorDisplay {
  const d = readDescriptors(track.metadata)
  if (!d) return { mood: '', energy: '', vocal: '', instruments: [] }
  return {
    mood: d.moods.length > 0 ? MOOD_LABELS[d.moods[0]] : '',
    energy: d.energy ? ENERGY_LABELS[d.energy] : '',
    vocal: d.vocal ? VOCAL_LABELS[d.vocal] : '',
    instruments: (d.instruments ?? []).map(i => INSTRUMENT_LABELS[i]),
  }
}

// ─── catalogRightsFromStage3 (30-07) ───────────────────────────────────────
// Maps an already-computed Stage3Result to the catalogue's tri-state rights
// code via rightsBadge() (lib/sync-library/gate.ts, 30-01) — the SAME rights
// authority the sync-library gate uses, never a second/hardcoded rights
// definition (T-30-11). CatalogRightsCode ('ok'|'part'|'req') is imported,
// not redefined, from gate.ts so CatalogCard.rights and CatalogBrowserLight's
// CatalogRow.rights ('ok'|'part'|'req', components/buyer/CatalogBrowserLight.tsx)
// stay structurally the SAME literal union rather than two hand-copied ones.
export function catalogRightsFromStage3(stage3: Stage3Result): CatalogRightsCode {
  return RIGHTS_BADGE_TO_CATALOG_RIGHTS[rightsBadge(stage3)]
}

export type { CatalogRightsCode }

// ─── CatalogCard — client-safe display shape ───────────────────────────────
// No owner contact details and no non-public availability signals (D-14a).
// Shared between the API route and the server-rendered first page so both
// surfaces agree on exactly what a buyer may see.
//
// 30-07: enriched additively with the real authored display fields (artist/
// mood/energy/vocal/instruments) + the real tri-state rights code — the
// minimal 22-05 slice. Still no owner contact details or non-public signal.
export type CatalogCard = {
  id: string
  title: string
  type: string
  genre: string | null
  coverArtUrl: string | null
  artist: string
  mood: string
  energy: string
  vocal: string
  instruments: string[]
  rights: CatalogRightsCode
  tracks: { id: string; title: string | null; bpm: number | null; keySignature: string | null }[]
}
