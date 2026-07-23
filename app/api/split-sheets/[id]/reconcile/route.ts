import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { reconcileSplits, type ReconciliationParty } from '@/lib/split-sheets/reconciliation'
import { readComposers, sanitizeComposers } from '@/lib/metadata/schema'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── GET/POST /api/split-sheets/[id]/reconcile ────────────────────────
// GET computes the display-only diff (reconcileSplits, 17-01) between the
// executed sheet's parties and the attached project's composers[]. POST
// applies ONLY an explicit `{ action: 'confirm' }` request's composer list
// — a request shape a GET can never accidentally trigger. Nothing here
// mutates composers[] except the confirm branch of POST (P17-07: the
// executed sheet is authoritative; write-back is OFFERED, never silent).

type RouteCtx = { params: Promise<{ id: string }> }

type SheetRow = {
  id: string
  initiator_user_id: string
  vault_project_id: string | null
  song_name: string
  split_sheet_parties: { user_id: string | null; name: string; split_percentage: number }[]
}

type AuthResult =
  | { ok: true; sheet: SheetRow; projectId: string }
  | { ok: false; error: string; status: number }

/**
 * Double check (mirrors the attach route's V4 pattern): the caller must be
 * a party on the sheet (initiator or an account-holder signer) AND own the
 * project the sheet is attached to. Reconciliation writes into that
 * project's tracks.metadata.composers[] — registration-feeding data — so
 * both checks are mandatory before either GET or POST proceeds.
 */
async function authorize(
  apiClient: Pick<SupabaseClient, 'from'>,
  userId: string,
  sheetId: string
): Promise<AuthResult> {
  const { data: sheet } = await apiClient
    .from('split_sheets')
    .select('id, initiator_user_id, vault_project_id, song_name, split_sheet_parties(user_id, name, split_percentage)')
    .eq('id', sheetId)
    .maybeSingle()

  const sheetRow = sheet as SheetRow | null
  if (!sheetRow) return { ok: false, error: 'Not authorized', status: 403 }

  const parties = sheetRow.split_sheet_parties ?? []
  const isParty = sheetRow.initiator_user_id === userId || parties.some(p => p.user_id === userId)
  if (!isParty) return { ok: false, error: 'Not authorized', status: 403 }

  if (!sheetRow.vault_project_id) {
    return { ok: false, error: 'Attach this split sheet to a project before reconciling', status: 400 }
  }

  const { data: project } = await apiClient
    .from('vault_projects')
    .select('id')
    .eq('id', sheetRow.vault_project_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!project) return { ok: false, error: 'Not authorized', status: 403 }

  return { ok: true, sheet: sheetRow, projectId: sheetRow.vault_project_id }
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

type TrackRow = { id: string; title: string; metadata: Record<string, unknown> | null }

/** Picks the track the split sheet describes: an exact normalized
 * song_name↔title match first, else the project's single track when
 * unambiguous. Returns null when neither resolves — the caller (client)
 * must let the artist pick explicitly rather than guess. */
function pickTrack(tracks: TrackRow[], songName: string): TrackRow | null {
  if (tracks.length === 0) return null
  const bySongName = tracks.find(t => normalize(t.title) === normalize(songName))
  if (bySongName) return bySongName
  return tracks.length === 1 ? tracks[0] : null
}

export async function GET(_request: Request, { params }: RouteCtx) {
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const auth = await authorize(apiClient, user.id, id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: tracksData } = await apiClient
    .from('tracks')
    .select('id, title, metadata')
    .eq('project_id', auth.projectId)
  const tracks = (tracksData ?? []) as TrackRow[]

  const track = pickTrack(tracks, auth.sheet.song_name)
  if (!track) {
    return NextResponse.json(
      { error: 'Could not determine which track this split sheet belongs to' },
      { status: 400 }
    )
  }

  const parties: ReconciliationParty[] = (auth.sheet.split_sheet_parties ?? []).map(p => ({
    name: p.name,
    split_percentage: p.split_percentage,
  }))
  const composers = readComposers(track.metadata)
  const diff = reconcileSplits(parties, composers)

  return NextResponse.json({ trackId: track.id, trackTitle: track.title, composers, diff })
}

export async function POST(request: Request, { params }: RouteCtx) {
  const apiClient = await createApiClient()
  const {
    data: { user },
  } = await apiClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const auth = await authorize(apiClient, user.id, id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown
    trackId?: unknown
    composers?: unknown
  }

  // Distinct request shape — only this exact action ever writes.
  if (body.action !== 'confirm') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  if (!trackId) return NextResponse.json({ error: 'trackId is required' }, { status: 400 })

  const { data: existingTrack } = await apiClient
    .from('tracks')
    .select('id, metadata')
    .eq('id', trackId)
    .eq('project_id', auth.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!existingTrack) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  // The artist's confirmed set (including any manual re-maps chosen client-
  // side for unmatched parties) — never re-derived from the diff on the
  // server, so nothing here can silently invent a write the artist didn't
  // see and approve (P17-07).
  const nextComposers = sanitizeComposers(body.composers)
  const mergedMetadata = {
    ...((existingTrack.metadata as Record<string, unknown> | null) ?? {}),
    composers: nextComposers,
  }

  const { error } = await apiClient
    .from('tracks')
    .update({ metadata: mergedMetadata })
    .eq('id', trackId)
    .eq('project_id', auth.projectId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, composers: nextComposers })
}
