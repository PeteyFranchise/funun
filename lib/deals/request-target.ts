import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStage3 } from '@/lib/vault/stage3'
import { isAdmittedToSyncLibrary } from '@/lib/deals/catalog'
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
      tracks (id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
      vault_documents (id, type, status, track_id, document_data)
      `
    )
    .eq('id', vaultProjectId)
    .maybeSingle()

  const project = data as ProjectRow | null
  if (!project) return { ok: false }

  // 26-06: admission is the single gate authority — the SAME
  // isAdmittedToSyncLibrary helper lib/deals/catalog.ts's isRightsReady
  // uses. C-01: the lookup now selects every admitted row's track_id
  // (mirrors catalog-query.ts:200-207's existing batched-query shape,
  // scoped to one project instead of a page of them) instead of a single
  // existence row — the project-level admission DECISION is unchanged,
  // only how the per-track ids get collected changes.
  const { data: admittedRows } = await service
    .from('sync_listings')
    .select('track_id')
    .eq('vault_project_id', project.id)
    .eq('status', 'admitted')
  const admittedTrackIds = new Set(
    ((admittedRows ?? []) as { track_id: string | null }[])
      .map(r => r.track_id)
      .filter((id): id is string => id != null)
  )
  if (!isAdmittedToSyncLibrary({ has_admitted_sync_listing: admittedTrackIds.size > 0 })) {
    return { ok: false }
  }

  // Stage 3's canContinue answers the artist's own distribution-readiness
  // question, not the buyer's per-track admission question (same
  // separation lib/deals/catalog.ts's isRightsReady header comment
  // documents for a different gate) — it must keep receiving EVERY track,
  // never just the admitted ones.
  const stage3 = computeStage3(
    project,
    project.tracks ?? [],
    project.vault_documents ?? [],
    project.vault_readiness_score
  )
  if (!stage3.canContinue) return { ok: false }

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
      tracks: (project.tracks ?? [])
        .filter(t => admittedTrackIds.has(t.id))
        .map(t => ({ id: t.id, title: t.title })),
    },
  }
}
