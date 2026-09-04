import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { isAssignedToOrg } from '@/lib/staff/scope'
import { computeStage3 } from '@/lib/vault/stage3'
import { descriptorsToDisplay, type CatalogProjectLike } from '@/lib/deals/catalog'
import { coerceBrief, type Brief } from '@/lib/buyer/brief'
import {
  draftSelectsFromBrief,
  AI_DRAFT_CANDIDATE_CAP,
  type AiDraftCandidate,
} from '@/lib/selects/ai-draft'
import { aiAdmissionError, aiProviderSignal, claimAiUsage, finishAiUsage } from '@/lib/ai/admission'

// ─── POST /api/admin/selects/[id]/ai-draft (D-11) ──────────────────────────
// "AI drafts, AE curates": populates a rights-ready-first ~10-track starter
// (tracklist + cover note + per-track "why it fits") into a draft Selects,
// off the brief it is linked to. Own-book-scoped exactly like every other
// /api/admin/selects/* route (T-31-10) — requireStaff() then, for
// non-leadership, isAssignedToOrg on the Selects' buyer_org before ANY read
// of brief/catalogue data, and a 404 (not 403) on scope denial so an
// uncovered Selects' existence is never leaked.
//
// The candidate pool is intentionally NOT filtered to rights-ready-only
// (D-11) — lib/selects/ai-draft.ts's orderCandidatesRightsReadyFirst puts
// cleared tracks first via the single lib/deals/catalog.ts isRightsReady
// authority, but a near-ready track can still be chosen; the route flags
// (rightsReady) rather than drops.

// Bounded raw project fetch feeding the candidate pool — several times
// AI_DRAFT_CANDIDATE_CAP so the rights-ready-first ordering has enough
// tracks to choose from before the model-facing cap trims the tail
// (T-31-12: bounds cost/latency, never an unbounded catalogue scan).
const CANDIDATE_PROJECT_CAP = AI_DRAFT_CANDIDATE_CAP * 2

const CANDIDATE_PROJECT_COLUMNS = `
  id, title, type, genre, vault_readiness_score, user_id,
  tracks (id, title, bpm, key_signature, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details, isrc, iswc),
  vault_documents (id, type, status, track_id, document_data)
`

type CandidateTrackRow = {
  id: string
  title: string | null
  bpm: number | null
  key_signature: string | null
  metadata: Record<string, unknown> | null
  writers: string[] | null
  producers: string[] | null
  mixing_engineer: string | null
  mastering_engineer: string | null
  has_sample: boolean | null
  sample_details: string | null
  isrc: string | null
  iswc: string | null
}

type CandidateProjectRow = {
  id: string
  title: string
  type: string
  genre: string | null
  vault_readiness_score: number | null
  user_id: string
  tracks: CandidateTrackRow[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: selectsRow, error: selectsError } = await service
    .from('selects')
    .select('id, buyer_org_id, brief_id, cover_note')
    .eq('id', id)
    .maybeSingle()
  if (selectsError) {
    return NextResponse.json({ error: 'Could not load this Selects.' }, { status: 500 })
  }
  if (!selectsRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Own-book re-check (T-31-10) — leadership bypasses, every other staff
  // role must be the assigned AE for this Selects' buyer_org. 404, never
  // 403 (no existence leak) — mirrors every other /api/admin/selects/* route.
  const { data: orgRow, error: orgError } = await service
    .from('buyer_orgs')
    .select('ae_user_id')
    .eq('id', selectsRow.buyer_org_id)
    .maybeSingle()
  if (orgError) {
    return NextResponse.json({ error: 'Could not verify staff scope.' }, { status: 500 })
  }
  if (auth.staffRole !== 'leadership' && !isAssignedToOrg(orgRow, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!selectsRow.brief_id) {
    return NextResponse.json(
      {
        error:
          'This Selects has no linked brief yet — link one, or build the starter by hand from The Crate.',
      },
      { status: 400 }
    )
  }

  const { data: briefRow, error: briefError } = await service
    .from('buyer_briefs')
    .select('brief')
    .eq('id', selectsRow.brief_id)
    .maybeSingle()
  if (briefError) {
    return NextResponse.json({ error: 'Could not load the linked brief.' }, { status: 500 })
  }
  if (!briefRow) {
    return NextResponse.json({ error: 'The linked brief could not be found.' }, { status: 404 })
  }
  const brief: Brief = coerceBrief(briefRow.brief)

  // ── Candidate pool (rights-ready-first ordered by lib/selects/ai-draft.ts,
  // never hard-filtered — D-11) ──
  const { data: projectRows, error: projectsError } = await service
    .from('vault_projects')
    .select(CANDIDATE_PROJECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(CANDIDATE_PROJECT_CAP)
  if (projectsError) {
    return NextResponse.json({ error: 'Could not load the catalogue.' }, { status: 500 })
  }

  const projects = (projectRows ?? []) as unknown as CandidateProjectRow[]
  if (projects.length === 0) {
    return NextResponse.json({ error: 'The catalogue has no tracks yet to draft from.' }, { status: 400 })
  }

  const { data: admittedRows, error: admittedError } = await service
    .from('sync_listings')
    .select('vault_project_id')
    .eq('status', 'admitted')
    .in(
      'vault_project_id',
      projects.map(p => p.id)
    )
  if (admittedError) {
    return NextResponse.json({ error: 'Could not load catalogue readiness.' }, { status: 500 })
  }
  const admittedProjectIds = new Set(
    ((admittedRows ?? []) as { vault_project_id: string }[]).map(r => r.vault_project_id)
  )

  const ownerIds = Array.from(new Set(projects.map(p => p.user_id)))
  const { data: ownerRows, error: ownerError } =
    ownerIds.length > 0
      ? await service.from('user_profiles').select('id, artist_name').in('id', ownerIds)
      : { data: [] as { id: string; artist_name: string | null }[], error: null }
  if (ownerError) {
    return NextResponse.json({ error: 'Could not load artist credits.' }, { status: 500 })
  }
  const artistNameByOwner = new Map(
    ((ownerRows ?? []) as { id: string; artist_name: string | null }[]).map(o => [
      o.id,
      o.artist_name ?? '',
    ])
  )

  const candidates: AiDraftCandidate[] = []
  for (const project of projects) {
    const tracks = project.tracks ?? []
    const stage3 = computeStage3(
      project,
      tracks,
      project.vault_documents ?? [],
      project.vault_readiness_score ?? 0
    )
    const projectLike: CatalogProjectLike = {
      has_admitted_sync_listing: admittedProjectIds.has(project.id),
      vault_readiness_score: project.vault_readiness_score,
    }
    for (const track of tracks) {
      const display = descriptorsToDisplay(track)
      candidates.push({
        trackId: track.id,
        projectId: project.id,
        title: track.title ?? project.title,
        artist: artistNameByOwner.get(project.user_id) ?? '',
        genre: project.genre ?? '',
        mood: display.mood,
        energy: display.energy,
        vocal: display.vocal,
        instruments: display.instruments,
        project: projectLike,
        stage3,
      })
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'The catalogue has no tracks yet to draft from.' }, { status: 400 })
  }

  const sessionClient = await createApiClient()
  const admission = await claimAiUsage(sessionClient, _request, {
    operation: 'selects:ai-draft',
    units: 2,
  })
  if (!admission.allowed) {
    const denied = aiAdmissionError(admission)
    return NextResponse.json({ error: denied.error }, { status: denied.status })
  }

  const result = await draftSelectsFromBrief(brief, candidates, aiProviderSignal())
  await finishAiUsage(sessionClient, admission.claimId, result.ok)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  const { data: persistedData, error: persistError } = await service.rpc(
    'persist_selects_ai_draft',
    {
      p_selects_id: id,
      p_staff_id: auth.user.id,
      p_cover_note: result.draft.coverNote,
      p_tracks: result.draft.tracks,
    }
  )
  if (persistError) {
    return NextResponse.json({ error: 'Could not save the AI starter.' }, { status: 500 })
  }

  const persisted = (persistedData ?? {}) as { coverNote?: unknown; tracks?: unknown }
  return NextResponse.json({
    data: {
      coverNote: typeof persisted.coverNote === 'string' ? persisted.coverNote : '',
      tracks: Array.isArray(persisted.tracks) ? persisted.tracks : [],
    },
  })
}
