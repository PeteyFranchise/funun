import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { editEntry, isRoomLead } from '@/lib/playbook/entries'
import { safeParsePlaybookContent, type PlaybookEntryType } from '@/lib/playbook/content'
import { logStaffAction } from '@/lib/staff/audit'

const RestoreSchema = z
  .object({
    revisionNumber: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    expectedDraftVersion: z.number().int().nonnegative(),
  })
  .strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  const parsed = RestoreSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid restore request' }, { status: 400 })

  const service = createServiceClient()
  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('id, room_id, entry_type, draft_content')
    .eq('id', id)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  if ((entry as { draft_content: unknown | null }).draft_content !== null) {
    return NextResponse.json(
      { error: 'Approve or reject the pending draft before restoring an earlier revision.' },
      { status: 409 }
    )
  }

  const roomId = (entry as { room_id: string }).room_id
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('key')
    .eq('id', roomId)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const auth = await requireRoomAccess((room as { key: string }).key)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const canRestore = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canRestore) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: revision, error: revisionError } = await service
    .from('playbook_entry_revisions')
    .select('content, source_hash')
    .eq('entry_id', id)
    .eq('revision_number', parsed.data.revisionNumber)
    .maybeSingle()
  if (revisionError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!revision) return NextResponse.json({ error: 'Revision not found' }, { status: 404 })

  const content = safeParsePlaybookContent(
    (entry as { entry_type: PlaybookEntryType }).entry_type,
    (revision as { content: unknown }).content
  )
  if (!content.success) return NextResponse.json({ error: 'Stored revision content is invalid' }, { status: 409 })

  const result = await editEntry(service, {
    id,
    isApprover: true,
    incoming: content.data,
    publishRequested: true,
    editorId: auth.user.id,
    expectedRevision: parsed.data.expectedRevision,
    expectedDraftVersion: parsed.data.expectedDraftVersion,
    draftSourceHash: (revision as { source_hash: string | null }).source_hash ?? undefined,
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'restore_playbook_entry_revision',
    targetType: 'playbook_entry',
    targetId: id,
    changes: {
      restoredRevision: parsed.data.revisionNumber,
      resultingRevision: result.data?.revision_number ?? null,
    },
  })

  return NextResponse.json({ data: result.data })
}
