import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { computeStage3, type Stage3Result } from '@/lib/vault/stage3'
import { isRightsReady } from '@/lib/deals/catalog'
import {
  loadSelectsInScope,
  addSelectsTrack,
  removeSelectsTrack,
  updateSelectsTrack,
} from '@/lib/selects/persistence'
import { SELECTS_TRACK_SOURCE_VALUES, type SelectsTrack } from '@/lib/selects/types'

const SELECTS_TRACK_COLUMNS =
  'id, selects_id, track_id, note, position, added_by, source, removed_at, removed_by, created_at'

const AddTrackBodySchema = z
  .object({
    trackId: z.string().uuid(),
    note: z.union([z.string().trim().max(2000, 'note is too long'), z.null()]).optional(),
    source: z.enum(SELECTS_TRACK_SOURCE_VALUES).optional(),
  })
  .strict()

const PatchTrackBodySchema = z
  .object({
    trackRowId: z.string().uuid(),
    note: z.union([z.string().trim().max(2000, 'note is too long'), z.null()]).optional(),
    position: z.number().int().min(0).optional(),
  })
  .strict()

// ─── Read-time rights-ready evaluation ──────────────────────────────────────
// Mirrors lib/deals/shortlists.ts's loadShortlistEntries pattern EXACTLY:
// isRightsReady/isAdmittedToSyncLibrary (lib/deals/catalog.ts) are the
// SINGLE authority, imported and called directly here — never re-derived —
// so a track that has since lost readiness (score dropped, sync-library
// admission withdrawn) degrades loudly (rights_ready: false) rather than
// silently staying flagged ready. Kept local to this route (not
// lib/selects/persistence.ts) so the import is real and grep-visible here,
// matching app/api/admin/deals/[id]/route.ts's convention of importing
// lib/deals/stage-machine's pure predicates directly into the route.

type TrackRow = {
  id: string
  project_id: string
  title: string | null
  writers: string[] | null
  producers: string[] | null
  mixing_engineer: string | null
  mastering_engineer: string | null
  has_sample: boolean | null
  sample_details: string | null
}

type ProjectRow = {
  id: string
  title: string
  type: string
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  vault_readiness_score: number | null
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
}

type SelectsTrackWithRights = SelectsTrack & {
  rights_ready: boolean
  track: { id: string; title: string | null; project_id: string } | null
}

async function resolveTracksWithRightsReady(
  service: SupabaseClient,
  selectsId: string,
  includeRemoved: boolean
): Promise<SelectsTrackWithRights[]> {
  let query = service
    .from('selects_tracks')
    .select(SELECTS_TRACK_COLUMNS)
    .eq('selects_id', selectsId)
    .order('position', { ascending: true })
  if (!includeRemoved) query = query.is('removed_at', null)

  const { data } = await query
  const rows = (data ?? []) as SelectsTrack[]
  if (rows.length === 0) return []

  const trackIds = Array.from(new Set(rows.map(r => r.track_id)))
  const { data: trackRows } = await service
    .from('tracks')
    .select(
      'id, project_id, title, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details'
    )
    .in('id', trackIds)
  const tracks = (trackRows ?? []) as TrackRow[]
  const trackById = new Map(tracks.map(t => [t.id, t]))

  const projectIds = Array.from(new Set(tracks.map(t => t.project_id)))
  const { data: projectRows } =
    projectIds.length > 0
      ? await service
          .from('vault_projects')
          .select(
            'id, title, type, content_id_registered, content_id_dismissed_until, vault_readiness_score, vault_documents (id, type, status, track_id, document_data)'
          )
          .in('id', projectIds)
      : { data: [] as ProjectRow[] }
  const projects = (projectRows ?? []) as ProjectRow[]
  const projectById = new Map(projects.map(p => [p.id, p]))

  // 26-06 admission signal — ONE batched sync_listings lookup (SAME
  // status='admitted' authority lib/deals/shortlists.ts and
  // lib/deals/catalog-query.ts use), T-26-24.
  const { data: admittedRows } =
    projectIds.length > 0
      ? await service
          .from('sync_listings')
          .select('vault_project_id')
          .eq('status', 'admitted')
          .in('vault_project_id', projectIds)
      : { data: [] as { vault_project_id: string }[] }
  const admittedProjectIds = new Set(
    ((admittedRows ?? []) as { vault_project_id: string }[]).map(r => r.vault_project_id)
  )

  const stage3ByProject = new Map<string, Stage3Result>()

  return rows.map(row => {
    const trackRow = trackById.get(row.track_id)
    if (!trackRow) {
      // Defensive fallback — ON DELETE CASCADE from tracks means this row
      // would normally be gone too, but degrade loudly rather than throw.
      return { ...row, rights_ready: false, track: null }
    }

    const project = projectById.get(trackRow.project_id)
    let rightsReady = false
    if (project) {
      let stage3 = stage3ByProject.get(project.id)
      if (!stage3) {
        const projectTracks = tracks.filter(t => t.project_id === project.id)
        stage3 = computeStage3(
          project,
          projectTracks,
          project.vault_documents ?? [],
          project.vault_readiness_score ?? 0
        )
        stage3ByProject.set(project.id, stage3)
      }
      rightsReady = isRightsReady(
        { ...project, has_admitted_sync_listing: admittedProjectIds.has(project.id) },
        stage3
      )
    }

    return {
      ...row,
      rights_ready: rightsReady,
      track: { id: trackRow.id, title: trackRow.title, project_id: trackRow.project_id },
    }
  })
}

// ─── GET /api/admin/selects/[id]/tracks ────────────────────────────────────
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const includeRemoved = new URL(request.url).searchParams.get('includeRemoved') === '1'
  const tracks = await resolveTracksWithRightsReady(service, id, includeRemoved)
  return NextResponse.json({ data: tracks })
}

// ─── POST /api/admin/selects/[id]/tracks ───────────────────────────────────
// Adds a Crate track. IDEMPOTENT (R11 AC) — re-adding a track already
// present (non-removed) returns the SAME row, never a duplicate; a
// previously soft-removed row is un-removed instead of re-inserted. See
// lib/selects/persistence.ts's addSelectsTrack for the full contract.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = AddTrackBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  try {
    const track = await addSelectsTrack(service, {
      selectsId: id,
      trackId: parsed.data.trackId,
      note: parsed.data.note ?? null,
      source: parsed.data.source ?? 'crate',
      addedBy: auth.user.id,
    })
    return NextResponse.json({ data: track }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add track' },
      { status: 500 }
    )
  }
}

// ─── PATCH /api/admin/selects/[id]/tracks ──────────────────────────────────
// Body carries trackRowId (the selects_tracks.id, not the track_id) since
// this route has no nested [trackRowId] path segment. Updates a note and/or
// reorders (position). Scoped by BOTH trackRowId AND selects_id in the same
// WHERE clause (updateSelectsTrack) — TOCTOU-safe, mirrors
// app/api/admin/buyer-orgs/[id]/route.ts's "scope-safe write" convention.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = PatchTrackBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }
  const { trackRowId, ...rest } = parsed.data
  if (Object.keys(rest).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const updated = await updateSelectsTrack(service, id, trackRowId, rest)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update track' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/admin/selects/[id]/tracks?trackRowId= ─────────────────────
// SOFT remove only (removed_at/removed_by) — never a hard delete, so the
// Removed tray / co-edit history survives (R11 must_have truth).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const selects = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!selects) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const trackRowId = new URL(request.url).searchParams.get('trackRowId')
  if (!trackRowId || !z.string().uuid().safeParse(trackRowId).success) {
    return NextResponse.json({ error: 'trackRowId is required' }, { status: 400 })
  }

  try {
    const removed = await removeSelectsTrack(service, id, trackRowId, auth.user.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove track' },
      { status: 500 }
    )
  }
}
