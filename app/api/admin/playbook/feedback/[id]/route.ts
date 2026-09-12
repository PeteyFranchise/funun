import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead } from '@/lib/playbook/entries'
import { canTransitionFeedback, type ReaderFeedbackStatus } from '@/lib/playbook/enablement'
import { createServiceClient } from '@/lib/supabase/server'

const Id = z.string().uuid()
const Body = z.object({ roomKey: z.string().trim().min(1).max(80), status: z.enum(['open','triaged','resolved','declined']), note: z.string().trim().max(4000).nullable() }).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!Id.safeParse(id).success || !parsed.success) return NextResponse.json({ error: 'Invalid feedback update' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const room = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (!room.data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (auth.staffRole !== 'leadership' && !(await isRoomLead(service, room.data.id, auth.user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const feedback = await service.from('playbook_reader_feedback').select('status').eq('id', id).eq('room_id', room.data.id).maybeSingle()
  if (!feedback.data) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 })
  if (!canTransitionFeedback(feedback.data.status as ReaderFeedbackStatus, parsed.data.status)) return NextResponse.json({ error: 'Invalid feedback transition' }, { status: 409 })
  const terminal = ['resolved','declined'].includes(parsed.data.status)
  const update = await service.from('playbook_reader_feedback').update({ status: parsed.data.status, resolved_at: terminal ? new Date().toISOString() : null }).eq('id', id)
  if (update.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  await service.from('playbook_reader_feedback_events').insert({ feedback_id: id, event_type: parsed.data.status === 'open' ? 'reopened' : parsed.data.status, actor_id: auth.user.id, note: parsed.data.note })
  return NextResponse.json({ data: { id, status: parsed.data.status } })
}
