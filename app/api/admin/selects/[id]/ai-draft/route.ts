import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: selectsRow } = await service
    .from('selects')
    .select('id, buyer_org_id, brief_id, cover_note')
    .eq('id', id)
    .maybeSingle()
  if (!selectsRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Own-book re-check (T-31-10) — leadership bypasses, every other staff
  // role must be the assigned AE for this Selects' buyer_org. 404, never
  // 403 (no existence leak) — mirrors every other /api/admin/selects/* route.
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('ae_user_id')
    .eq('id', selectsRow.buyer_org_id)
    .maybeSingle()
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

  const { data: briefRow } = await service
    .from('buyer_briefs')
    .select('brief')
    .eq('id', selectsRow.brief_id)
    .maybeSingle()
  if (!briefRow) {
    return NextResponse.json({ error: 'The linked brief could not be found.' }, { status: 404 })
  }
  const brief: Brief = coerceBrief(briefRow.brief)

  // ── Candidate pool (rights-ready-first ordered by lib/selects/ai-draft.ts,
  // never hard-filtered — D-11) ──
  const { data: projectRows } = await service
    .from('vault_projects')
    .select(CANDIDATE_PROJECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(CANDIDATE_PROJECT_CAP)

  const projects = (projectRows ?? []) as unknown as CandidateProjectRow[]
  if (projects.length === 0) {
    return NextResponse.json({ error: 'The catalogue has no tracks yet to draft from.' }, { status: 400 })
  }

  const { data: admittedRows } = await service
    .from('sync_listings')
    .select('vault_project_id')
    .eq('status', 'admitted')
    .in(
      'vault_project_id',
      projects.map(p => p.id)
    )
  const admittedProjectIds = new Set(
    ((admittedRows ?? []) as { vault_project_id: string }[]).map(r => r.vault_project_id)
  )

  const ownerIds = Array.from(new Set(projects.map(p => p.user_id)))
  const { data: ownerRows } =
    ownerIds.length > 0
      ? await service.from('user_profiles').select('id, artist_name').in('id', ownerIds)
      : { data: [] as { id: string; artist_name: string | null }[] }
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

  const result = await draftSelectsFromBrief(brief, candidates)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  // Persist the starter tracks into selects_tracks — idempotent add (same
  // co-edit contract the tracks route owns): a non-removed row for
  // (selects_id, track_id) is reused, never duplicated; a soft-removed row
  // is revived instead of inserting a second.
  const { data: existingRows } = await service
    .from('selects_tracks')
    .select('id, track_id, removed_at, position')
    .eq('selects_id', id)

  const existingList = (existingRows ?? []) as {
    id: string
    track_id: string
    removed_at: string | null
    position: number
  }[]
  const existingByTrack = new Map(existingList.map(r => [r.track_id, r]))
  let nextPosition = existingList.length > 0 ? Math.max(...existingList.map(r => r.position)) + 1 : 0

  const persisted: { trackId: string; reason: string; rightsReady: boolean }[] = []
  for (const t of result.draft.tracks) {
    const existing = existingByTrack.get(t.trackId)
    if (existing && !existing.removed_at) {
      persisted.push(t)
      continue
    }
    if (existing && existing.removed_at) {
      await service
        .from('selects_tracks')
        .update({ removed_at: null, removed_by: null, note: t.reason || null })
        .eq('id', existing.id)
      persisted.push(t)
      continue
    }
    await service.from('selects_tracks').insert({
      selects_id: id,
      track_id: t.trackId,
      note: t.reason || null,
      position: nextPosition++,
      added_by: auth.user.id,
      source: 'crate',
    })
    persisted.push(t)
  }

  // Only fill an empty cover_note — the AI draft never overwrites an AE's
  // own words.
  const coverNote = selectsRow.cover_note || result.draft.coverNote
  if (!selectsRow.cover_note && result.draft.coverNote) {
    await service.from('selects').update({ cover_note: result.draft.coverNote }).eq('id', id)
  }

  return NextResponse.json({ data: { coverNote, tracks: persisted } })
}
