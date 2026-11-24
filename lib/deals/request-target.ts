import type { SupabaseClient } from '@supabase/supabase-js'
import type { VaultProjectType, SyncListingStatus } from '@/types'
import { isSyncEligibleProjectType } from '@/lib/sync-library/readiness'
import {
  trackExposure,
  resolveListingStatus,
  type ListingStatusRow,
} from '@/lib/sync-library/track-exposure'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { mustBlockActionBetween } from '@/lib/trust-safety/block-check'

// ─── authorizeRequestTarget (T-16-23) ─────────────────────────────────────
// Shared target authorization for the buyer request pathway. Both
// POST /api/buyer/requests and the composer's project/track lookup
// (app/sync/requests/new/page.tsx, 23-02: renamed from
// app/(buyer-portal)/buyers/requests/new/page.tsx) must apply the EXACT
// same sync-library-admission + Phase 13 visibility + block gate, so a
// buyer cannot reach a non-admitted, private, non-owned, or blocking
// artist's project by guessing/typing a project id (16-VALIDATION
// V16-03). Extracted here (Rule 2 — missing shared authorization would
// let the two call sites drift out of sync, a security-relevant DRY
// violation) rather than duplicated inline in both files.
//
// Runs on the SERVICE-ROLE client deliberately: tracks/vault_documents RLS
// (migration 078) scopes SELECT to the project owner or member, which a
// buyer session never is — a session-client read would return zero rows
// even for a project that should be requestable. The checks below stand
// in for that missing session-level visibility.
//
// 26-06: the admission check now delegates to lib/deals/catalog.ts's
// isAdmittedToSyncLibrary (the SAME helper lib/deals/catalog-query.ts's
// loadCatalogPage/isRightsReady call), replacing the old inline
// is_public-based eligibility check — one shared admission authority, no
// third copy (T-26-24). This function resolves has_admitted_sync_listing via a
// sync_listings existence lookup (status = 'admitted'), then applies
// readiness/stage3 (computeStage3().canContinue) and the Phase 13
// visibility/block gate on top, exactly as before.
//
// C-01 (.planning/deliberations/2026-10-05-pass-5-rights-eligibility-
// review.md): both the admission check AND the returned track list are
// now resolved per TRACK, not per PROJECT — admission is song-level
// (26-06), so a project with one admitted track and one never-reviewed
// sibling must stay requestable (project-level admission unchanged) while
// the sibling must never appear in `project.tracks`. Four call sites
// inherit this with no further code change:
// app/api/buyer/requests/route.ts, app/api/admin/deals/route.ts (staff
// manual intake — discovered during this fix to share the identical gap
// via this same function), app/sync/requests/new/page.tsx (via
// components/buyer/RequestComposer.tsx's track-selection chips), and
// app/api/buyer/shortlists/route.ts (unaffected in practice — it only
// reads the `ok` boolean, never `.tracks`, but still routes through the
// same gate).

// ─── 2026-10-11 (owner decision D-11, plan 50-05 Task 3) ─────────────────
// TWO refusals changed here, in opposite directions.
//
// REMOVED — the `computeStage3().canContinue` refusal. D-11: "Interest and
// request intake may proceed for a clearance-required track; licence execution
// and delivery stay gated." canContinue is `vault_readiness_score >= 60 &&
// !sampleBlock` — a rights-paperwork and sample-clearance question, i.e. exactly
// the clearance work D-11 says must not block intake. A supervisor asking about
// a song whose split sheet is unsigned is the ordinary case this product exists
// to serve; Funūn answers it and finishes the paperwork. Licence EXECUTION is a
// separate decision made elsewhere and is untouched by this change.
//
// ADDED — the project-type check. This function never had one, so a buyer could
// request a project type the catalogue would never have shown them (e.g.
// 'snippet'); the two surfaces disagreed. SYNC_ELIGIBLE_PROJECT_TYPES is
// consumed, not restated, and 'unreleased' is inside it, so nothing truthful is
// blocked.
//
// The admission check is now per-track EXPOSURE rather than project-level
// admission: the same trackExposure authority loadCatalogPage and
// loadShortlistEntries use, so what is requestable and what is discoverable
// cannot drift. A project with one admitted playable track and one incomplete
// sibling stays requestable, and only the exposed track is returned.

export type RequestTargetProject = {
  id: string
  title: string
  user_id: string
  tracks: { id: string; title: string | null }[]
}

export type RequestTargetResult = { ok: true; project: RequestTargetProject } | { ok: false }

type ProjectRow = {
  id: string
  title: string
  user_id: string
  type: string
  vault_readiness_score: number
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    /** D-11's proof of a playable master; required by trackExposure. */
    audio_file_url: string | null
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
}

export async function authorizeRequestTarget(
  service: SupabaseClient,
  buyerUserId: string,
  vaultProjectId: string
): Promise<RequestTargetResult> {
  const { data } = await service
    .from('vault_projects')
    .select(
      `
      id, title, user_id, type, vault_readiness_score,
      content_id_registered, content_id_dismissed_until,
      tracks (id, title, audio_file_url, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
      vault_documents (id, type, status, track_id, document_data)
      `
    )
    .eq('id', vaultProjectId)
    .maybeSingle()

  const project = data as ProjectRow | null
  if (!project) return { ok: false }

  // Project type: an admission precondition, re-checked here so this gate and
  // the catalogue agree on what exists (see the D-11 note in the header).
  const projectType = project.type as VaultProjectType
  if (!isSyncEligibleProjectType(projectType)) return { ok: false }

  // One query for this project's listing rows, no status filter — the same
  // shape and the same per-track precedence lib/deals/catalog-query.ts uses
  // (T-26-24: one admission authority, no drift). trackExposure's contract
  // covers the terminal states and ranks them first, so handing it a
  // pre-filtered admitted-only view would let it answer 'not_admitted' where the
  // truth is 'unavailable'. Keyed by track; the query is already scoped to one
  // project by the .eq below, so there is no cross-project key to guard here.
  const { data: listingRows } = await service
    .from('sync_listings')
    .select('track_id, status, created_at')
    .eq('vault_project_id', project.id)
  const listingRowsByTrack = new Map<string, ListingStatusRow[]>()
  for (const r of (listingRows ?? []) as {
    track_id: string | null
    status: SyncListingStatus
    created_at: string | null
  }[]) {
    if (!r.track_id) continue
    const rows = listingRowsByTrack.get(r.track_id) ?? []
    rows.push({ status: r.status, created_at: r.created_at })
    listingRowsByTrack.set(r.track_id, rows)
  }

  // D-11: exposure per exact track. A project is requestable when at least one
  // of its tracks is exposed, and ONLY the exposed tracks come back — an
  // incomplete or never-reviewed sibling must never ride along, and an
  // incomplete sibling must never hide an exposed one.
  const exposedTracks = (project.tracks ?? []).filter(
    t =>
      trackExposure({
        trackId: t.id,
        audioFileUrl: t.audio_file_url,
        listingStatus: resolveListingStatus(listingRowsByTrack.get(t.id) ?? []),
      }).status === 'exposed'
  )
  if (exposedTracks.length === 0) return { ok: false }

  const { data: owner } = await service
    .from('user_profiles')
    .select('profile_visibility')
    .eq('id', project.user_id)
    .maybeSingle()

  // Fail closed: an owning artist we cannot resolve is treated as not
  // visible, never as implicitly public.
  if (!owner) return { ok: false }
  const visibility = owner.profile_visibility === 'connections_only' ? 'connections_only' : 'public'
  // Buyers are a fully separate account model (D-11) — never a follower or
  // connection of the artist, so viewerIsConnection is always false here.
  if (!isProfileVisibleTo(visibility, false, false)) return { ok: false }

  // Fail closed for the same reason the `!owner` check two lines up does: a
  // block state we cannot read is not a licence to open a deal thread with
  // the artist. mustBlockActionBetween returns true when the lookup itself
  // fails, so this collapses into the same `{ ok: false }` every other
  // refusal here returns — the buyer sees "this isn't available", never a
  // reason.
  if (await mustBlockActionBetween(service, buyerUserId, project.user_id)) return { ok: false }

  return {
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      user_id: project.user_id,
      tracks: exposedTracks.map(t => ({ id: t.id, title: t.title })),
    },
  }
}
