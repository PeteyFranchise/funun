import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import {
  loadSelectsInScope,
  addSelectsTrack,
  removeSelectsTrack,
  updateSelectsTrack,
} from '@/lib/selects/persistence'
import { resolveTracksWithRightsReady } from '@/lib/selects/tracks-query'
import { SELECTS_TRACK_SOURCE_VALUES } from '@/lib/selects/types'

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
// resolveTracksWithRightsReady moved to lib/selects/tracks-query.ts (31-10)
// so app/(admin)/admin/selects/[id]/page.tsx's SSR builder detail page can
// import the SAME implementation this route uses — a Next.js route module
// may only export HTTP method handlers, so the shared function had to live
// in lib/ (mirrors lib/deals/catalog-query.ts's loadCatalogPage doc
// comment). isRightsReady (lib/deals/catalog.ts) remains the SINGLE
// authority, called once inside that lib function — never re-derived here.

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
