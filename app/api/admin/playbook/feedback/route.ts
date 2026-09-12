import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { logStaffAction } from '@/lib/staff/audit'

const Schema = z.object({ roomKey: z.string().trim().min(1).max(80), entryId: z.string().uuid(), revision: z.number().int().positive(), kind: z.enum(['question','outdated','suggestion','missing_doctrine']), body: z.string().trim().min(1).max(4000) }).strict()

export async function POST(request: Request) {
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Playbook feedback' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const room = await service.from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (room.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!room.data) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const entry = await service.from('playbook_entries').select('id, title, owner_id, revision_number, status').eq('id', parsed.data.entryId).eq('room_id', room.data.id).maybeSingle()
  if (entry.error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!entry.data || entry.data.status !== 'published') return NextResponse.json({ error: 'Published guidance not found' }, { status: 404 })
  if (Number(entry.data.revision_number) !== parsed.data.revision) return NextResponse.json({ error: 'This guidance changed. Refresh before sending feedback.' }, { status: 409 })
  const write = await service.from('playbook_reader_feedback').insert({ entry_id: parsed.data.entryId, room_id: room.data.id, revision_number: parsed.data.revision, feedback_kind: parsed.data.kind, body: parsed.data.body, created_by: auth.user.id, assigned_to: entry.data.owner_id }).select('id').single()
  if (write.error) {
    if (isPlaybookEnablementSchemaMissing(write.error)) return NextResponse.json({ error: 'Reader feedback is built but not activated yet.' }, { status: 503 })
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }
  await service.from('playbook_reader_feedback_events').insert({ feedback_id: write.data.id, event_type: 'created', actor_id: auth.user.id })
  if (entry.data.owner_id && entry.data.owner_id !== auth.user.id) await createNotification(service, { userId: entry.data.owner_id, type: 'playbook_reader_feedback', title: `Playbook feedback: ${entry.data.title}`, body: parsed.data.body, link: '/admin/playbook/feedback', data: { feedbackId: write.data.id }, actorId: auth.user.id })
  await logStaffAction(service, { actorId: auth.user.id, action: 'create_playbook_reader_feedback', targetType: 'playbook_reader_feedback', targetId: write.data.id, changes: { entryId: parsed.data.entryId, revision: parsed.data.revision, kind: parsed.data.kind } })
  return NextResponse.json({ data: { id: write.data.id } })
}
