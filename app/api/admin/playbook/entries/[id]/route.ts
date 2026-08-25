import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { requireRoomAccess, isRoomLead, approveEntry, rejectEntry, editEntry } from '@/lib/playbook/entries'

// ─── /api/admin/playbook/entries/[id] — approve/reject/edit (31.2-04 Task 3) ─
// Mirrors the Tips approve/reject PATCH shape (app/api/admin/tips/[itemKey]/
// route.ts). approve/reject require server-derived approval authority
// (leadership OR isRoomLead) -- 403 otherwise. edit is forward-only: an
// approver's edit updates content in place (status stays published); a
// non-approver's edit lands as a new draft_content, never a direct publish
// (R9, T-31.2-10). Every branch audits via logStaffAction.

const EntryPatchSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'edit']),
    content: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

const idParamSchema = z.string().uuid()

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = EntryPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid playbook entry patch payload' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: entry, error: fetchError } = await service
    .from('playbook_entries')
    .select('id, room_id')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
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

  const isApprover = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))

  if (parsed.data.action === 'approve' || parsed.data.action === 'reject') {
    if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result =
      parsed.data.action === 'approve'
        ? await approveEntry(service, { id, approverId: auth.user.id })
        : await rejectEntry(service, { id })

    if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: parsed.data.action === 'approve' ? 'approve_playbook_entry' : 'reject_playbook_entry',
      targetType: 'playbook_entry',
      targetId: id,
      changes: { action: parsed.data.action },
    })

    return NextResponse.json({ data: result.data })
  }

  // action === 'edit'
  if (parsed.data.content === undefined) {
    return NextResponse.json({ error: 'content is required for an edit' }, { status: 400 })
  }

  const result = await editEntry(service, { id, isApprover, incoming: parsed.data.content })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'edit_playbook_entry',
    targetType: 'playbook_entry',
    targetId: id,
    changes: { isApprover },
  })

  return NextResponse.json({ data: result.data })
}
