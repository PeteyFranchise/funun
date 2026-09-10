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
import { isSyncEntryComplete, isSyncEligibleProjectType } from '@/lib/sync-library/readiness'
import type { ReadinessItem, VaultProjectType } from '@/types'

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
// catalogue browse. Six live call sites depend on it — the buyer catalogue
// (lib/deals/catalog-query.ts), AE shortlists (lib/deals/shortlists.ts),
// Selects track queries (lib/selects/tracks-query.ts) and the Selects AI
// draft (lib/selects/ai-draft.ts, x2). Deliberately NOT a boolean flag
// column on vault_projects (RESEARCH Don't Hand-Roll) — a parallel flag
// would desync from the readiness pipeline the first time either changed,
// and there must never be a second rights definition.
//
// ─── CHANGED 2026-09-10: six specific items, not the aggregate score ─────
// The beta definition was: sync-library ADMITTED (26-06) AND
// vault_readiness_score >= CATALOG_READINESS_THRESHOLD AND
// computeStage3().canContinue. The MIDDLE condition is what changed.
//
// Owner decision 2026-09-09 (.planning/deliberations/sync-catalogue-entry-
// and-samples.md): the aggregate readiness score is the WRONG INSTRUMENT
// and is not used. It was designed for releasing on Spotify; 30 of its 100
// points (isrc_codes, distributor, pro_registration, mlc_registration) are
// release admin a music supervisor has no stake in. Under the old rule a
// song with every signature signed and a finished master read as
// unlicensable because nobody had picked a distributor.
//
// The gate is now the SIX items in SYNC_READINESS_KEYS
// (lib/sync-library/readiness.ts) — split sheets, copyright, producer
// agreements, audio files, metadata, cover art — every one of them
// 'complete'. A song can now pass this gate on an aggregate score of 50.
// That is the entire point of the change, and lib/deals/catalog.test.ts
// pins it as a named test.
//
// A FOURTH condition joined the gate on the second pass of 2026-09-10: the
// project's TYPE must be a released format (SYNC_ELIGIBLE_PROJECT_TYPES —
// 'single' | 'ep' | 'album'). That is not a new restriction in behaviour,
// it is the same restriction stated out loud: 'snippet' and 'unreleased'
// were already excluded, but only accidentally, via the readiness
// registry's applies_to tables. See the check itself below.
//
// The practical consequence of this change is therefore the REVERSE of the
// motivating anecdote: it does not admit songs the old bar rejected (there
// were none — six complete always cleared 60), it REJECTS songs the old bar
// admitted, e.g. a project at 85 that reached the threshold on ISRC + ISWC
// + distributor while having no cover art and no signed split sheet.
//
// ─── REMOVED 2026-09-10 (third pass): computeStage3().canContinue ────────
// This gate used to end `return stage3.canContinue`. It no longer does, and
// the reason matters more than the diff.
//
// Two owner decisions of 2026-09-09 CONTRADICTED EACH OTHER IN CODE:
//   (a) "sampled tracks ARE included, in the default browse", carrying a
//       label reading "Contains a sample — licensing needs clearance
//       first" and promising no timeline; and
//   (b) this gate, which ended on canContinue, which is
//       `readinessScore >= CONTINUE_THRESHOLD && !sampleBlock`
//       (lib/vault/stage3.ts).
// The label shipped (rightsBadge() returns 'contact' -> 'req' on
// sampleBlock, and the buyer Crate renders it) but the gate rejected those
// songs BEFORE the badge ever ran, so the "Contains a sample" state was
// UNREACHABLE in production. We had shipped copy for a state the gate
// forbade.
//
// The defect was not canContinue. It was that this gate BORROWED a signal
// built to answer a different question. canContinue answers the ARTIST's
// question — "may this project advance to Stage 4, Generate Assets?" — and
// for that question an uncleared sample MUST keep blocking, because you
// cannot distribute a track with an uncleared sample. The sync catalogue
// asks the BUYER's question — "may a supervisor see and license-enquire
// about this?" — and there the owner decided a sample must NOT block
// listing. One boolean cannot answer both. computeStage3() and canContinue
// are therefore DELIBERATELY UNCHANGED (lib/vault/stage3.test.ts pins that
// an uncleared sample still returns canContinue: false); only the SYNC gate
// stopped consuming them.
//
// Both halves of canContinue were wrong for sync anyway:
//   - `readinessScore >= 60` was REDUNDANT. The DB scoring function
//     (migration 070) awards 10+10+15+15+10+10 = 70 for exactly the six
//     entry items, so any project passing isSyncEntryComplete() already
//     scores at or above 60 (60 in the floor case where the visual asset is
//     a lyric_card/snippet_visual, which the TS engine counts and the DB
//     trigger does not). It could never reject a project the six-item check
//     accepted.
//   - `!sampleBlock` WAS the contradiction.
//
// The label now works on its own: a sampled track enters the catalogue and
// catalogRightsFromStage3() (below) marks it 'req' — "Contains a sample".
// The gate decides WHETHER a buyer sees the song; the badge decides WHAT it
// says about its rights. Keeping those two jobs in two places is the whole
// point of this change. Do not reintroduce a rights CONDITION here.
//
// The `stage3` PARAMETER was removed with the condition rather than left
// unread — see the signature note below.
//
// Pure: accepts an already-fetched project shape and an already-computed
// ReadinessItem[], so callers do the I/O and this stays unit-testable
// without a DB. The second parameter is the RAW item list, never a
// caller-computed boolean — "which items, and what counts as done" stays
// inside this authority rather than being re-decided at four call sites.

// ─── CATALOG_READINESS_THRESHOLD — no longer the catalogue gate ──────────
// NOT DEAD, but no longer used by isRightsReady(). Its one remaining
// consumer is computeArtistReadinessPassRate() in lib/deals/metrics.ts
// (GTM-06, artist readiness pass rate). Kept, and kept exported, because
// that metric still measures something real — how many requested projects
// clear the RELEASE-readiness bar — but the two have DIVERGED: this
// constant is no longer "a simplified proxy of isRightsReady()" as
// metrics.ts's comment used to claim. Flagged rather than removed, and
// rather than silently repurposed: whether GTM-06 should be re-specified
// against the six-item entry gate is a product decision, not a refactor.
export const CATALOG_READINESS_THRESHOLD = 60

// ─── ADDED 2026-09-10 (second pass): the project-TYPE condition ──────────
// `type` is REQUIRED, not optional, on purpose — the same discipline
// SyncReadinessInput.assets adopted earlier the same day. An optional
// `type` would let a caller silently omit it and get a default, which for
// a fail-OPEN field means shipping an ineligible project to buyers. A
// required field makes tsc, not production, find the caller that forgot;
// that requirement is precisely what surfaced the four call sites here.
//
// It is the RAW project type, never a caller-computed "isEligible" boolean
// — "which types may be licensed" stays inside this authority (and its
// SYNC_ELIGIBLE_PROJECT_TYPES constant) rather than being re-decided at
// four call sites.
export type CatalogProjectLike = {
  has_admitted_sync_listing: boolean | null
  type: VaultProjectType
}

// ─── The signature: no `stage3` parameter, on purpose ────────────────────
// When `return stage3.canContinue` went, the parameter went with it. It was
// not kept-but-unread: an unread parameter is invisible to tsc and to the
// tests, it makes every call site look like it is feeding this gate a
// rights signal when it is not, and — the practical reason — it leaves
// `stage3` sitting in the signature as an invitation for the next reader to
// reach for `canContinue` again, which is exactly the mistake being undone.
// A conflated signal that is HARD to reach for is the fix; one that is
// merely unused is the same bug with a comment on it.
//
// Cost of removing it: four call sites. Only ONE of them (loadCatalogPage
// in lib/deals/catalog-query.ts) still needs a Stage3Result at all, for
// catalogRightsFromStage3() and the staff rightsDetail string. The other
// three (lib/deals/shortlists.ts, lib/selects/tracks-query.ts and
// app/api/admin/selects/[id]/ai-draft/route.ts) were computing a full
// Stage3Result — document assembly over every vault_document on the project
// — SOLELY to feed this parameter, so removing it deleted real dead work
// rather than just shortening an argument list.
export function isRightsReady(
  project: CatalogProjectLike,
  readinessItems: ReadinessItem[]
): boolean {
  // FIRST, and deliberately so: the sync catalogue licenses released-format
  // recordings ('single' | 'ep' | 'album'). 'snippet' is a promo clip;
  // 'unreleased' was confirmed out of scope by the owner on 2026-09-09.
  // Before this line, both were excluded only as a SIDE EFFECT of the
  // readiness registry's applies_to tables not emitting four of the six
  // entry items for them — see SYNC_ELIGIBLE_PROJECT_TYPES
  // (lib/sync-library/readiness.ts) for why that was unsafe to rely on.
  // This check is independent of `readinessItems` entirely: even if the
  // registry started emitting all six items complete for an 'unreleased'
  // project, the gate still refuses.
  if (!isSyncEligibleProjectType(project.type)) return false
  if (!isAdmittedToSyncLibrary(project)) return false
  // The six decided entry items, all 'complete'. isSyncEntryComplete fails
  // closed on an absent key, on 'warning', and on an empty list — so a
  // caller that forgets to pass readiness items gets false, never true.
  if (!isSyncEntryComplete(readinessItems)) return false
  // No rights condition beyond this point, and deliberately none. A track
  // with an UNCLEARED SAMPLE reaches here and PASSES (owner decision
  // 2026-09-09): it is listed, and catalogRightsFromStage3() labels it
  // "Contains a sample". Sample clearance still blocks the ARTIST's
  // distribution path via computeStage3().canContinue — a different
  // question, asked and answered elsewhere.
  return true
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
