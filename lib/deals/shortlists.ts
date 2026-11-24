import type { SupabaseClient } from '@supabase/supabase-js'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'
import type { VaultProjectType, SyncListingStatus } from '@/types'
import { computeStage3 } from '@/lib/vault/stage3'
import { readinessItemsForProject } from '@/lib/vault/readiness'
import { isSyncEligibleProjectType } from '@/lib/sync-library/readiness'
import {
  trackExposure,
  resolveListingStatus,
  type ListingStatusRow,
} from '@/lib/sync-library/track-exposure'
import { trackClearance, type TrackClearance } from '@/lib/sync-library/track-clearance'

// ─── loadShortlistEntries (D-14c) ──────────────────────────────────────────
// Re-evaluates availability at READ time (not save time) — a project that has
// since gone private, had its listing withdrawn, or lost its master is marked
// stillAvailable: false, never silently dropped from the list (a stale entry
// must degrade loudly).
//
// 2026-10-11 (owner decision D-11, plan 50-05 Task 3) — the field was called
// `stillRightsReady` and was computed by isRightsReady, i.e. from rights
// paperwork. Two things were wrong with that under D-11, and the RENAME is the
// substantive half of this change rather than cosmetic:
//
//   - It asked the wrong question. Outstanding clearance work no longer removes
//     a track from the catalogue, so a saved entry whose split sheet is still
//     unsigned is availabe and requestable — it used to render "No longer
//     rights-ready" and have its Request licence link disabled.
//   - The name asserted more than the data carried. It now means "is any track
//     on this project still exposed in The Crate", which is availability, not
//     rights standing. Leaving the old name on the new meaning is precisely the
//     label-integrity defect this repo keeps a skill for — the UI copy in
//     components/buyer/ShortlistPanel.tsx was changed with it.
//
// `clearance` is carried alongside so a surface can say "contact Funūn" without
// re-deriving it; the two answers stay separate, as D-11 requires.
//
// Lives in lib/ (not the route.ts file) because Next.js route modules may
// only export HTTP method handlers plus a small route-config set — any
// other export fails Next's route type-checking at build time. Both
// GET /api/buyer/shortlists and app/sync/shortlists/page.tsx's (23-02:
// renamed from app/(buyer-portal)/buyers/shortlists/page.tsx)
// server-rendered list import this one implementation, so the
// re-evaluation rule and dual-level attribution can never drift between
// the two surfaces.

export type ShortlistEntry = {
  id: string
  vaultProjectId: string
  projectTitle: string
  savedBy: string | null
  savedAt: string
  /** Is ANY track on this project still exposed in The Crate? */
  stillAvailable: boolean
  /**
   * 50.5 Task 2 — availability could not be computed, as opposed to being
   * computed as false. Distinct on purpose: "No longer available" is a claim,
   * and we are not in a position to make it about a save that names a project.
   */
  availabilityWithheld?: boolean
  /** The representative exposed track's clearance; null when none is exposed. */
  clearance: TrackClearance['status'] | null
}

type ShortlistProjectRow = {
  id: string
  title: string
  type: string
  vault_readiness_score: number | null
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    /** D-11's proof of a playable master; required by trackExposure. */
    audio_file_url: string | null
    metadata: Record<string, unknown> | null
    writers: string[] | null
    producers: string[] | null
    mixing_engineer: string | null
    mastering_engineer: string | null
    has_sample: boolean | null
    sample_details: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
  // 2026-09-10: the six-item entry gate reads `visual_asset` from
  // vault_assets (cover_art_url is only a display mirror), and `metadata`
  // from tracks.metadata — both newly selected below so a saved shortlist
  // entry does not fail closed on data this query simply never fetched.
  vault_assets: { id: string; type: string }[]
}

export async function loadShortlistEntries(service: SupabaseClient, orgId: string): Promise<ShortlistEntry[]> {
  const { data } = await service
    .from('buyer_shortlists')
    .select('id, vault_project_id, created_by, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as { id: string; vault_project_id: string; created_by: string; created_at: string }[]
  if (rows.length === 0) return []

  const projectIds = Array.from(new Set(rows.map(r => r.vault_project_id)))
  const { data: projectRows } = await service
    .from('vault_projects')
    .select(
      `
      id, title, type, vault_readiness_score, content_id_registered, content_id_dismissed_until,
      tracks (id, title, audio_file_url, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
      vault_documents (id, type, status, track_id, document_data),
      vault_assets (id, type)
      `
    )
    .in('id', projectIds)
  const projectById = new Map(((projectRows ?? []) as ShortlistProjectRow[]).map(p => [p.id, p]))

  // ONE batched sync_listings lookup — the SAME shape and the same per-track
  // precedence lib/deals/catalog-query.ts uses, so the two surfaces cannot
  // disagree about what is in The Crate (T-26-24 — single admission authority,
  // no drift).
  //
  // 2026-10-11 (D-11): no longer `.eq('status','admitted')` and no longer
  // project-level. Exposure is per track and trackExposure's contract covers
  // the terminal states, so the query must hand it every row for the track and
  // let resolveListingStatus pick the one that describes it now. Keyed by
  // project AND track for the same reason catalog-query.ts is: a lookup that is
  // correct only because track ids happen to be globally unique is the shape of
  // a cross-project leak.
  const { data: listingRows } = await service
    .from('sync_listings')
    .select('vault_project_id, track_id, status, created_at')
    .in('vault_project_id', projectIds)
  const listingRowsByTrack = new Map<string, ListingStatusRow[]>()
  const listingKey = (projectId: string, trackId: string) => `${projectId}:${trackId}`
  for (const r of (listingRows ?? []) as {
    vault_project_id: string
    track_id: string | null
    status: SyncListingStatus
    created_at: string | null
  }[]) {
    if (!r.track_id) continue
    const key = listingKey(r.vault_project_id, r.track_id)
    const rows = listingRowsByTrack.get(key) ?? []
    rows.push({ status: r.status, created_at: r.created_at })
    listingRowsByTrack.set(key, rows)
  }

  const saverIds = Array.from(new Set(rows.map(r => r.created_by)))
  const saverNameById = new Map<string, string | null>()
  await Promise.all(
    saverIds.map(async id => {
      try {
        const { data: authUser } = await service.auth.admin.getUserById(id)
        saverNameById.set(
          id,
          (authUser?.user?.user_metadata as { display_name?: string } | undefined)?.display_name ?? null
        )
      } catch {
        saverNameById.set(id, null)
      }
    })
  )

  return rows.map(r => {
    const project = projectById.get(r.vault_project_id)
    let stillAvailable = false
    let clearance: TrackClearance['status'] | null = null
    let projectTitle = 'Unknown project'
    if (project) {
      projectTitle = project.title
      // vault_projects.type is TEXT in the row shape; narrowed ONCE and reused
      // by the eligibility check, the readiness engine and the clearance
      // evaluator.
      const projectType = project.type as VaultProjectType
      const tracks = project.tracks ?? []

      // Project type is an ADMISSION precondition re-checked here as defence in
      // depth, exactly as in loadCatalogPage — never as part of exposure, which
      // cannot express it.
      const exposedTracks = isSyncEligibleProjectType(projectType)
        ? tracks.filter(
            t =>
              trackExposure({
                trackId: t.id,
                audioFileUrl: t.audio_file_url,
                listingStatus: resolveListingStatus(
                  listingRowsByTrack.get(listingKey(project.id, t.id)) ?? []
                ),
              }).status === 'exposed'
          )
        : []

      // 50.5 Task 2 — WITHHELD. `exposedTracks.length > 0` makes the saved
      // entry available when ANY sibling is exposed, so a song the buyer never
      // chose can keep their save alive. The save names a PROJECT, so there is
      // no song whose availability we could report. Fail closed on the boolean
      // and carry the distinction separately, so the panel says "being
      // confirmed" rather than the false claim "No longer available".
      stillAvailable = isReadWithheld('shortlist_availability')
        ? false
        : exposedTracks.length > 0

      // The Stage3Result is computed ONLY when there is something to label —
      // the 2026-09-10 note that used to live here was right that assembling
      // one unconditionally was dead work, and that stays true: a shortlist row
      // for an unavailable project needs no clearance answer.
      // 50.5 Task 2 — WITHHELD. `exposedTracks[0]` is whichever sibling happens
      // to sort first, and its clearance was published as the saved entry's
      // answer. The save is keyed to a PROJECT, so there is no song to answer
      // for: a buyer who saved an EP did not tell us which recording they
      // meant. Leave `clearance` null and let the panel say so, rather than
      // pick a song on their behalf and label it.
      const representative = isReadWithheld('shortlist_availability') ? undefined : exposedTracks[0]
      if (representative) {
        const stage3 = computeStage3(
          project,
          tracks,
          project.vault_documents ?? [],
          project.vault_readiness_score ?? 0
        )
        const readinessItems = readinessItemsForProject({
          type: projectType,
          tracks,
          assets: project.vault_assets ?? [],
          documents: project.vault_documents ?? [],
        })
        clearance = trackClearance({
          exposure: {
            trackId: representative.id,
            audioFileUrl: representative.audio_file_url,
            listingStatus: resolveListingStatus(
              listingRowsByTrack.get(listingKey(project.id, representative.id)) ?? []
            ),
          },
          project: { has_admitted_sync_listing: true, type: projectType },
          readinessItems,
          stage3,
          // Interim until plan 50-02 lands — null is treated as unresolved and
          // can never reach 'rights_ready'. See loadCatalogPage's note.
          aiProvenance: null,
        }).status
      }
    }
    return {
      id: r.id,
      vaultProjectId: r.vault_project_id,
      projectTitle,
      savedBy: saverNameById.get(r.created_by) ?? null,
      savedAt: r.created_at,
      stillAvailable,
      availabilityWithheld: isReadWithheld('shortlist_availability') || undefined,
      clearance,
    }
  })
}
