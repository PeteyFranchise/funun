import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import {
  validatePlacementPatch,
  isDestinationVisible,
  type PlacementDestinationType,
} from '@/lib/green-room/placements-admin'

type PlacementRow = {
  id: string
  destination_type: PlacementDestinationType
  destination_id: string | null
  destination_url: string | null
  starts_at: string
  ends_at: string | null
}

// ─── PATCH /api/admin/green-room/placements/[id] ─────────────────────────
// Edits copy/priority/schedule and drives the lifecycle (draft ↔ active ↔
// paused → archived). Transitioning TO `active` re-validates the (immutable)
// destination's visibility so a placement can never be activated toward a
// private/removed/expired destination.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: existing, error: fetchError } = await service
    .from('green_room_placements')
    .select('id, destination_type, destination_id, destination_url, starts_at, ends_at')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Placement not found' }, { status: 404 })
  const row = existing as PlacementRow

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validatePlacementPatch(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
  const update = validated.value

  // ends_at must still be after the (possibly updated) starts_at.
  const nextStartsAt = update.starts_at ?? row.starts_at
  const nextEndsAt = 'ends_at' in update ? update.ends_at : row.ends_at
  if (nextStartsAt && nextEndsAt && new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 })
  }

  // Activation guard — only when transitioning TO active.
  if (update.status === 'active') {
    const visible = await isDestinationVisible(
      service,
      row.destination_type,
      row.destination_id,
      row.destination_url
    )
    if (!visible) {
      return NextResponse.json(
        { error: 'Destination is not public/visible — cannot activate this placement' },
        { status: 409 }
      )
    }
  }

  const { data, error } = await service
    .from('green_room_placements')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Placement not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// ─── DELETE /api/admin/green-room/placements/[id] ────────────────────────
// Hard-deletes a draft/archived placement. Prefer archiving (PATCH status)
// for anything that was ever live so history is retained; delete is for
// clearing mistaken drafts.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('green_room_placements')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Placement not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
