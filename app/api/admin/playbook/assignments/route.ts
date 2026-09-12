import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/staff-role'
import { isRoomLead } from '@/lib/playbook/entries'
import { canAccessRoom, requireRoomAccess } from '@/lib/playbook/rooms'
import { readingRecipientIds } from '@/lib/playbook/reading-notifications'
import { createNotification } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const AssignmentSchema = z
  .object({
    roomKey: z.string().trim().min(1).max(80),
    entryId: z.string().uuid(),
    targetKind: z.enum(['user', 'role']),
    targetUserId: z.string().uuid().nullable(),
    targetRole: z.enum(ALL_STAFF_ROLES as [string, ...string[]]).nullable(),
    required: z.boolean(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const validUser = value.targetKind === 'user' && value.targetUserId && !value.targetRole
    const validRole = value.targetKind === 'role' && value.targetRole && !value.targetUserId
    if (!validUser && !validRole) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Assignment target does not match target kind' })
    }
  })

export async function POST(request: Request) {
  const parsed = AssignmentSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reading assignment' }, { status: 400 })

  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const roomId = (room as { id: string }).id

  const canAssign = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canAssign) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('id, room_id, status, revision_number, title, slug')
    .eq('id', parsed.data.entryId)
    .eq('room_id', roomId)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found in this room' }, { status: 404 })
  if ((entry as { status: string }).status !== 'published') {
    return NextResponse.json({ error: 'Only published Playbook entries can be assigned' }, { status: 409 })
  }

  const { data: roomGrantData, error: roomGrantError } = await service
    .from('playbook_room_role_grants')
    .select('role')
    .eq('room_id', roomId)
  if (roomGrantError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  const grantedRoles = (roomGrantData ?? []).map(row => row.role as StaffRole)

  if (parsed.data.targetKind === 'user') {
    const { data: target, error: targetError } = await service
      .from('funun_staff')
      .select('user_id, staff_role, staff_roles')
      .eq('user_id', parsed.data.targetUserId!)
      .maybeSingle()
    if (targetError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    if (!target) return NextResponse.json({ error: 'Assignee must be a Funūn Team Member' }, { status: 400 })
    const targetRow = target as { staff_role: StaffRole; staff_roles: StaffRole[] | null }
    const targetRoles = targetRow.staff_roles?.length ? targetRow.staff_roles : [targetRow.staff_role]
    if (!canAccessRoom(targetRoles, grantedRoles)) {
      return NextResponse.json({ error: 'Assignee does not have access to this Playbook room' }, { status: 400 })
    }
  } else if (!canAccessRoom([parsed.data.targetRole as StaffRole], grantedRoles)) {
    return NextResponse.json({ error: 'That team does not have access to this Playbook room' }, { status: 400 })
  }

  let existingQuery = service
    .from('playbook_reading_assignments')
    .select('id')
    .eq('entry_id', parsed.data.entryId)
    .eq('target_kind', parsed.data.targetKind)
    .is('revoked_at', null)
  existingQuery = parsed.data.targetKind === 'user'
    ? existingQuery.eq('target_user_id', parsed.data.targetUserId!)
    : existingQuery.eq('target_role', parsed.data.targetRole!)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  const assignment = {
    entry_id: parsed.data.entryId,
    target_kind: parsed.data.targetKind,
    target_user_id: parsed.data.targetKind === 'user' ? parsed.data.targetUserId : null,
    target_role: parsed.data.targetKind === 'role' ? parsed.data.targetRole : null,
    required_revision: Number((entry as { revision_number: number }).revision_number),
    required: parsed.data.required,
    due_at: parsed.data.dueAt,
    assigned_by: auth.user.id,
  }
  const write = existing
    ? service.from('playbook_reading_assignments').update(assignment).eq('id', (existing as { id: string }).id).select('*').single()
    : service.from('playbook_reading_assignments').insert(assignment).select('*').single()
  const { data, error } = await write
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: error.code === '23505' ? 409 : 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: existing ? 'update_playbook_reading_assignment' : 'create_playbook_reading_assignment',
    targetType: 'playbook_reading_assignment',
    targetId: (data as { id: string }).id,
    changes: { ...assignment, target_user_id: assignment.target_user_id, target_role: assignment.target_role },
  })

  if (!existing) {
    const staffResult = await service
      .from('funun_staff')
      .select('user_id, staff_role, staff_roles')
    if (!staffResult.error) {
      const recipients = readingRecipientIds(
        [data as Parameters<typeof readingRecipientIds>[0][number]],
        (staffResult.data ?? []).map(row => ({
          userId: row.user_id as string,
          roles: ((row.staff_roles as StaffRole[] | null)?.length
            ? row.staff_roles
            : [row.staff_role]) as StaffRole[],
        }))
      )
      const entryRow = entry as { title: string; slug: string; revision_number: number }
      await Promise.all(recipients.map(userId => createNotification(service, {
        userId,
        type: 'playbook_reading_assigned',
        title: `Playbook reading assigned: ${entryRow.title}`,
        body: `${parsed.data.required ? 'Required' : 'Recommended'} reading${parsed.data.dueAt ? ` due ${new Date(parsed.data.dueAt).toLocaleDateString('en-US')}` : ''}.`,
        link: `/admin/playbook/${parsed.data.roomKey}/${entryRow.slug}`,
        data: { assignmentId: (data as { id: string }).id, revisionNumber: entryRow.revision_number },
        actorId: auth.user.id,
      })))
    }
  }
  return NextResponse.json({ data })
}
