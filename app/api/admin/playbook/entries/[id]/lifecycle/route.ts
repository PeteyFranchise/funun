import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead, setEntryLifecycle } from '@/lib/playbook/entries'
import { logStaffAction } from '@/lib/staff/audit'

const LifecycleSchema = z
  .object({
    action: z.enum(['archive', 'supersede', 'restore']),
    expectedRevision: z.number().int().positive(),
    expectedDraftVersion: z.number().int().nonnegative(),
  })
  .strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  const parsed = LifecycleSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lifecycle request' }, { status: 400 })

  const service = createServiceClient()
  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('room_id')
    .eq('id', id)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  const roomId = (entry as { room_id: string }).room_id

  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('key')
    .eq('id', roomId)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const auth = await requireRoomAccess((room as { key: string }).key)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const canManage = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await setEntryLifecycle(service, {
    id,
    action: parsed.data.action,
    expectedRevision: parsed.data.expectedRevision,
    expectedDraftVersion: parsed.data.expectedDraftVersion,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: `${parsed.data.action}_playbook_entry`,
    targetType: 'playbook_entry',
    targetId: id,
    changes: { action: parsed.data.action, resultingStatus: result.data?.status ?? null },
  })
  return NextResponse.json({ data: result.data })
}
