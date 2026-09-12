import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const RoomSchema = z.object({ roomKey: z.string().trim().min(1).max(80) }).strict()
const UpdateSchema = RoomSchema.extend({
  required: z.boolean(),
  dueAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

async function authorize(roomKey: string, id: string) {
  const auth = await requireRoomAccess(roomKey)
  if ('error' in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) }
  const service = createServiceClient()
  const { data: room, error: roomError } = await service.from('playbook_rooms').select('id').eq('key', roomKey).maybeSingle()
  if (roomError) return { response: NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  if (!room) return { response: NextResponse.json({ error: 'Room not found' }, { status: 404 }) }
  const roomId = (room as { id: string }).id
  const canManage = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canManage) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: assignment, error } = await service
    .from('playbook_reading_assignments')
    .select('id, entry_id, revoked_at, playbook_entries!inner(room_id)')
    .eq('id', id)
    .eq('playbook_entries.room_id', roomId)
    .maybeSingle()
  if (error) return { response: NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 }) }
  if (!assignment) return { response: NextResponse.json({ error: 'Reading assignment not found in this room' }, { status: 404 }) }
  return { auth, service, assignment: assignment as { id: string; entry_id: string; revoked_at: string | null } }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid assignment id' }, { status: 400 })
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid assignment update' }, { status: 400 })
  const access = await authorize(parsed.data.roomKey, id)
  if ('response' in access) return access.response as NextResponse
  if (access.assignment.revoked_at) return NextResponse.json({ error: 'Revoked assignments cannot be edited' }, { status: 409 })
  const changes = { required: parsed.data.required, due_at: parsed.data.dueAt }
  const { data, error } = await access.service.from('playbook_reading_assignments').update(changes).eq('id', id).is('revoked_at', null).select('*').single()
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  await logStaffAction(access.service, { actorId: access.auth.user.id, action: 'update_playbook_reading_assignment', targetType: 'playbook_reading_assignment', targetId: id, changes })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid assignment id' }, { status: 400 })
  const parsed = RoomSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid revoke request' }, { status: 400 })
  const access = await authorize(parsed.data.roomKey, id)
  if ('response' in access) return access.response as NextResponse
  if (access.assignment.revoked_at) return NextResponse.json({ data: access.assignment })
  const revokedAt = new Date().toISOString()
  const { data, error } = await access.service.from('playbook_reading_assignments').update({ revoked_at: revokedAt }).eq('id', id).is('revoked_at', null).select('*').single()
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  await logStaffAction(access.service, { actorId: access.auth.user.id, action: 'revoke_playbook_reading_assignment', targetType: 'playbook_reading_assignment', targetId: id, changes: { revoked_at: revokedAt } })
  return NextResponse.json({ data })
}
