import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { readingRecipientIds } from '@/lib/playbook/reading-notifications'
import type { ReadingAssignment } from '@/lib/playbook/assignments'
import type { StaffRole } from '@/lib/admin/staff-role'
import { createNotification } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const Schema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  dueAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid re-acknowledgement request' }, { status: 400 })

  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const { data: room, error: roomError } = await service
    .from('playbook_rooms').select('id').eq('key', parsed.data.roomKey).maybeSingle()
  if (roomError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const roomId = (room as { id: string }).id
  const canManage = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('revision_number, status, title, slug')
    .eq('id', id)
    .eq('room_id', roomId)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!entry || (entry as { status: string }).status !== 'published') {
    return NextResponse.json({ error: 'Published Playbook entry not found' }, { status: 404 })
  }
  const revisionNumber = Number((entry as { revision_number: number }).revision_number)
  const { data: currentData, error: currentError } = await service
    .from('playbook_reading_assignments')
    .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
    .eq('entry_id', id)
    .is('revoked_at', null)
  if (currentError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const currentAssignments = (currentData ?? []) as ReadingAssignment[]
  const changedAssignments = currentAssignments.filter(assignment => assignment.required_revision !== revisionNumber)
  const { data, error } = await service
    .from('playbook_reading_assignments')
    .update({ required_revision: revisionNumber, due_at: parsed.data.dueAt })
    .eq('entry_id', id)
    .is('revoked_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'require_playbook_reacknowledgement',
    targetType: 'playbook_entry',
    targetId: id,
    changes: { revisionNumber, dueAt: parsed.data.dueAt, assignmentCount: data?.length ?? 0 },
  })

  if (changedAssignments.length > 0) {
    const { data: staffData } = await service.from('funun_staff').select('user_id, staff_role, staff_roles')
    if (staffData) {
      const recipients = readingRecipientIds(changedAssignments, staffData.map(row => ({
        userId: row.user_id as string,
        roles: ((row.staff_roles as StaffRole[] | null)?.length ? row.staff_roles : [row.staff_role]) as StaffRole[],
      })))
      const entryRow = entry as { title: string; slug: string }
      await Promise.all(recipients.map(userId => createNotification(service, {
        userId,
        type: 'playbook_reading_assigned',
        title: `Updated Playbook reading: ${entryRow.title}`,
        body: `Revision ${revisionNumber} is ready to read and acknowledge.`,
        link: `/admin/playbook/${parsed.data.roomKey}/${entryRow.slug}`,
        data: { entryId: id, revisionNumber },
        actorId: auth.user.id,
      })))
    }
  }
  return NextResponse.json({ data: { revisionNumber, assignmentCount: data?.length ?? 0 } })
}
