import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { isRoomLead } from '@/lib/playbook/entries'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const Schema = z
  .object({
    roomKey: z.string().min(1).max(80),
    runbookEntryId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(240),
    severity: z.number().int().min(1).max(4),
    summary: z.string().trim().min(1).max(4000),
    postmortemDueAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()

export async function POST(request: Request) {
  // The room key is needed to select the authorization scope, but parsing is
  // bounded and no database or provider work occurs before that gate.
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid incident' }, { status: 400 })

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
      { error: 'Only leadership or the room lead can activate incident mode' },
      { status: 403 }
    )
  }

  let revision: number | null = null
  if (parsed.data.runbookEntryId) {
    const entry = await service
      .from('playbook_entries')
      .select('revision_number')
      .eq('id', parsed.data.runbookEntryId)
      .eq('room_id', room.data.id)
      .eq('status', 'published')
      .maybeSingle()
    if (!entry.data) {
      return NextResponse.json({ error: 'Published runbook not found' }, { status: 404 })
    }
    revision = Number(entry.data.revision_number)
  }

  const write = await service.rpc('open_playbook_incident', {
    p_room_id: room.data.id,
    p_runbook_entry_id: parsed.data.runbookEntryId,
    p_runbook_revision_number: revision,
    p_title: parsed.data.title,
    p_severity: parsed.data.severity,
    p_summary: parsed.data.summary,
    p_actor_id: auth.user.id,
    p_postmortem_due_at: parsed.data.postmortemDueAt,
  })
  if (write.error) {
    if (isPlaybookEnablementSchemaMissing(write.error)) {
      return NextResponse.json(
        { error: 'Incident Mode is built but not activated yet.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Incident could not be opened.' }, { status: 503 })
  }
  return NextResponse.json({ data: { id: write.data } })
}
