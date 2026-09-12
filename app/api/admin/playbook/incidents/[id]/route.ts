import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z
  .object({
    roomKey: z.string().min(1).max(80),
    status: z.enum(['active', 'monitoring', 'resolved', 'closed']),
    note: z.string().trim().min(1).max(8000),
  })
  .strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await context.params).id)
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!id.success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid incident update' }, { status: 400 })
  }
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const room = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (!room.data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (
    auth.staffRole !== 'leadership' &&
    !(await isRoomLead(service, room.data.id, auth.user.id))
  ) {
    return NextResponse.json(
      { error: 'Only leadership or the room lead can change incident state' },
      { status: 403 }
    )
  }

  const incident = await service
    .from('playbook_incidents')
    .select('status')
    .eq('id', id.data)
    .eq('room_id', room.data.id)
    .maybeSingle()
  if (!incident.data) return NextResponse.json({ error: 'Incident not found' }, { status: 404 })

  const update = await service.rpc('change_playbook_incident_status', {
    p_incident_id: id.data,
    p_room_id: room.data.id,
    p_expected_status: incident.data.status,
    p_status: parsed.data.status,
    p_actor_id: auth.user.id,
    p_note: parsed.data.note,
  })
  if (update.error) {
    return NextResponse.json({ error: 'Incident change could not be saved.' }, { status: 503 })
  }
  if (update.data !== true) {
    return NextResponse.json(
      { error: 'Incident changed in another session. Refresh and try again.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ data: { status: parsed.data.status } })
}
