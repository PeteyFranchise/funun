// ─── Sync Readiness worklist — pure shaper (Phase 30, 30-05-PLAN.md) ─────
//
// Turns incomplete, non-terminal, non-admitted sync_listings rows into a
// staff-facing worklist: each row is one track plus EXACTLY what's still
// missing to reach Sync Readiness. Missing-item derivation is entirely
// delegated to lib/sync-library/readiness.ts's syncReadinessForTrack() +
// missingSyncItems() (30-01) — this module never invents its own
// readiness rule (30-CONTEXT.md "Reuse that engine; do not rebuild it").
//
// Pure: no I/O. Accepts already-fetched shapes (listings + batched
// track/project/artist lookups) — mirrors lib/sync-library/submission.ts's
// and lib/sync-library/readiness.ts's "accept an already-fetched shape,
// never throw" convention so this stays unit-testable without a DB.
import type { SyncListingStatus, VaultProjectType } from '@/types'
import { isTerminal } from './submission'
import {
  syncReadinessForTrack,
  missingSyncItems,
  syncIneligibleTypeReason,
  type SyncReadinessTrack,
} from './readiness'

export type WorklistMissingItem = { key: string; label: string }

export type WorklistRow = {
  listingId: string
  status: SyncListingStatus
  trackId: string
  trackTitle: string
  projectTitle: string
  artistName: string | null
  appliedAt: string
  missing: WorklistMissingItem[]
  // ─── The project-TYPE verdict (2026-09-10) ──────────────────────────────
  // `missing` answers "what is left to do?". It CANNOT answer "is this the
  // kind of work the catalogue lists at all?", and before these two fields
  // it silently claimed the wrong answer: for an 'unreleased' project the
  // readiness registry emits only audio_files + split_sheets of the six
  // entry keys, so with both complete missingSyncItems() returned [] and a
  // pending_admit row rendered as "Ready to admit / Checklist complete" —
  // for a song the buyer catalogue will never show (isRightsReady() refuses
  // the type outright).
  //
  // Derived from isSyncEligibleProjectType() via syncIneligibleTypeReason()
  // — the SAME authority the buyer gate and the admit route use, never a
  // second copy of the rule.
  /** False when the project's TYPE is outside SYNC_ELIGIBLE_PROJECT_TYPES. */
  syncEligible: boolean
  /** Why, in staff-facing words. Non-null exactly when syncEligible is false. */
  ineligibleReason: string | null
  qualityOk: boolean | null
  staffNotes: string | null
}

/** The one listing's own fields — everything NOT derivable from the track/project. */
export type WorklistListingInput = {
  id: string
  status: SyncListingStatus
  trackId: string
  appliedAt: string
  qualityOk: boolean | null
  staffNotes: string | null
}

/** The listing's track — the same shape syncReadinessForTrack() consumes, plus a title. */
export type WorklistTrackInput = SyncReadinessTrack & { title: string | null }

/**
 * The listing's project — type + title + the shared, project-level signals
 * syncReadinessForTrack() needs. `assets` (vault_assets rows) is REQUIRED
 * for the same reason it is required on SyncReadinessInput: `visual_asset`
 * joined SYNC_READINESS_KEYS on 2026-09-10, and an omitted list would pin
 * every worklist row to "Visual asset ready — missing" forever.
 */
export type WorklistProjectInput = {
  title: string | null
  type: VaultProjectType
  assets: { type: string }[]
  documents?: { type: string; status: string }[]
}

export type ShapeWorklistRowInput = {
  listing: WorklistListingInput
  track: WorklistTrackInput
  project: WorklistProjectInput
  artistName: string | null
}

/**
 * Shapes ONE listing + its track + its project's shared documents into a
 * WorklistRow. missing[] comes exclusively from
 * missingSyncItems(syncReadinessForTrack(...)) — never a bespoke check.
 */
export function shapeWorklistRow(input: ShapeWorklistRowInput): WorklistRow {
  const items = syncReadinessForTrack({
    type: input.project.type,
    track: input.track,
    assets: input.project.assets,
    documents: input.project.documents,
  })
  const missing: WorklistMissingItem[] = missingSyncItems(items).map(i => ({
    key: i.key,
    label: i.label,
  }))

  // An ineligible type is shown, not hidden — a submission a human still
  // has to decide about (reject it, or tell the artist) must not silently
  // vanish from the one surface that explains why a song is stuck. `missing`
  // is still computed truthfully; it is simply no longer the whole story,
  // and SyncReadinessWorklist.tsx renders this reason INSTEAD of the status
  // label and the "Checklist complete" chip.
  const ineligibleReason = syncIneligibleTypeReason(input.project.type)

  return {
    listingId: input.listing.id,
    status: input.listing.status,
    trackId: input.listing.trackId,
    trackTitle: input.track.title ?? 'Untitled track',
    projectTitle: input.project.title ?? 'Untitled project',
    artistName: input.artistName,
    appliedAt: input.listing.appliedAt,
    missing,
    syncEligible: ineligibleReason === null,
    ineligibleReason,
    qualityOk: input.listing.qualityOk,
    staffNotes: input.listing.staffNotes,
  }
}

// ─── buildWorklist — batched shaping over already-fetched lookups ────────

/** A raw sync_listings row, exactly the columns the worklist route selects. */
export type WorklistListingRow = {
  id: string
  status: string
  trackId: string
  projectId: string
  artistUserId: string
  appliedAt: string
  qualityOk: boolean | null
  staffNotes: string | null
}

export type WorklistLookups = {
  /** Batched track lookup keyed by track id. */
  tracksById: Map<string, WorklistTrackInput>
  /** Batched project lookup keyed by vault_project id. */
  projectsById: Map<string, WorklistProjectInput>
  /** Batched artist-name lookup keyed by artist_user_id. */
  artistNameById: Map<string, string | null>
}

/**
 * Maps a batch of already-fetched sync_listings rows to WorklistRow[],
 * excluding terminal (rejected/withdrawn/removed) and admitted listings,
 * ordered oldest-first by appliedAt. A listing whose track/project lookup
 * is missing is skipped rather than throwing — defensive, never throws on
 * well-typed input; a caller whose batched fetch came back incomplete
 * should see fewer rows, not a crash.
 */
export function buildWorklist(listings: WorklistListingRow[], lookups: WorklistLookups): WorklistRow[] {
  const rows: WorklistRow[] = []

  for (const listing of listings) {
    if (isTerminal(listing.status)) continue
    if (listing.status === 'admitted') continue

    const track = lookups.tracksById.get(listing.trackId)
    const project = lookups.projectsById.get(listing.projectId)
    if (!track || !project) continue

    rows.push(
      shapeWorklistRow({
        listing: {
          id: listing.id,
          status: listing.status as SyncListingStatus,
          trackId: listing.trackId,
          appliedAt: listing.appliedAt,
          qualityOk: listing.qualityOk,
          staffNotes: listing.staffNotes,
        },
        track,
        project,
        artistName: lookups.artistNameById.get(listing.artistUserId) ?? null,
      })
    )
  }

  return rows.sort((a, b) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime())
}
