import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStage3 } from '@/lib/vault/stage3'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { isBlockedRelativeTo } from '@/lib/trust-safety/block-check'

// ─── authorizeRequestTarget (T-16-23) ─────────────────────────────────────
// Shared target authorization for the buyer request pathway. Both
// POST /api/buyer/requests and the composer's project/track lookup
// (app/(buyer-portal)/buyers/requests/new/page.tsx) must apply the EXACT
// same rights-ready + Phase 13 visibility + block gate, so a buyer cannot
// reach a private, unready, non-owned, or blocking artist's project by
// guessing/typing a project id (16-VALIDATION V16-03). Extracted here
// (Rule 2 — missing shared authorization would let the two call sites
// drift out of sync, a security-relevant DRY violation) rather than
// duplicated inline in both files.
//
// Runs on the SERVICE-ROLE client deliberately: tracks/vault_documents RLS
// (migration 078) scopes SELECT to the project owner or member, which a
// buyer session never is — a session-client read would return zero rows
// even for a project that should be requestable. The checks below stand
// in for that missing session-level visibility, mirroring the rights-ready
// definition plan 16-05's lib/deals/catalog.ts (isRightsReady) will also
// express once that plan lands: public AND readiness-threshold AND
// computeStage3().canContinue, plus the Phase 13 visibility/block gate
// the catalog route applies on top.

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
  is_public: boolean | null
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
      id, title, user_id, type, is_public, vault_readiness_score,
      content_id_registered, content_id_dismissed_until,
      tracks (id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
      vault_documents (id, type, status, track_id, document_data)
      `
    )
    .eq('id', vaultProjectId)
    .maybeSingle()

  const project = data as ProjectRow | null
  if (!project) return { ok: false }
  if (project.is_public !== true) return { ok: false }

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

  if (await isBlockedRelativeTo(service, buyerUserId, project.user_id)) return { ok: false }

  return {
    ok: true,
    project: {
      id: project.id,
      title: project.title,
      user_id: project.user_id,
      tracks: (project.tracks ?? []).map(t => ({ id: t.id, title: t.title })),
    },
  }
}
