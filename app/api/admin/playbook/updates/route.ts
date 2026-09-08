import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/staff-role'
import { canAccessRoom, requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead } from '@/lib/playbook/entries'
import { isChangeBroadcastSchemaMissing } from '@/lib/playbook/change-broadcasts'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const UpdateSchema = z
  .object({
    roomKey: z.string().trim().min(1).max(80),
    entryId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    headline: z.string().trim().min(1).max(180),
    changeSummary: z.string().trim().min(1).max(2000),
    whyItMatters: z.string().trim().min(1).max(2000),
    actionRequired: z.string().trim().min(1).max(2000).nullable(),
    priority: z.enum(['standard', 'important', 'urgent']),
    audienceKind: z.enum(['all_team', 'role', 'user']),
    targetRole: z.enum(ALL_STAFF_ROLES as [string, ...string[]]).nullable(),
    targetUserId: z.string().uuid().nullable(),
    effectiveAt: z.string().datetime({ offset: true }),
    readingRequired: z.boolean(),
    readingDueAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const audienceMatches =
      (value.audienceKind === 'all_team' && !value.targetRole && !value.targetUserId) ||
      (value.audienceKind === 'role' && value.targetRole && !value.targetUserId) ||
      (value.audienceKind === 'user' && !value.targetRole && value.targetUserId)
    if (!audienceMatches) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Audience does not match its target' })
    if (value.readingRequired && !value.actionRequired) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actionRequired'], message: 'Required reading needs an action' })
    }
  })

type StaffRow = { user_id: string; staff_role: StaffRole; staff_roles: StaffRole[] | null }

function rolesForStaff(row: StaffRow): StaffRole[] {
  return row.staff_roles?.length ? row.staff_roles : [row.staff_role]
}

export async function POST(request: Request) {
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Playbook update payload' }, { status: 400 })

  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()

  const roomResult = await service.from('playbook_rooms').select('id, key').eq('key', parsed.data.roomKey).maybeSingle()
  if (roomResult.error) return NextResponse.json({ error: roomResult.error.message }, { status: 500 })
  if (!roomResult.data) return NextResponse.json({ error: 'Playbook room not found' }, { status: 404 })
  const roomId = (roomResult.data as { id: string }).id
  const canPublish = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canPublish) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [entryResult, grantsResult, staffResult] = await Promise.all([
    service.from('playbook_entries').select('id, room_id, title, slug, status, revision_number').eq('id', parsed.data.entryId).eq('room_id', roomId).maybeSingle(),
    service.from('playbook_room_role_grants').select('role').eq('room_id', roomId),
    service.from('funun_staff').select('user_id, staff_role, staff_roles'),
  ])
  const loadError = entryResult.error ?? grantsResult.error ?? staffResult.error
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!entryResult.data) return NextResponse.json({ error: 'Entry not found in this room' }, { status: 404 })
  const entry = entryResult.data as { id: string; title: string; slug: string; status: string; revision_number: number }
  if (entry.status !== 'published') return NextResponse.json({ error: 'Only published guidance can be broadcast' }, { status: 409 })
  if (entry.revision_number !== parsed.data.expectedRevision) {
    return NextResponse.json({ error: 'This entry changed. Refresh before publishing its update.' }, { status: 409 })
  }

  const grantedRoles = (grantsResult.data ?? []).map(row => row.role as StaffRole)
  const staff = (staffResult.data ?? []) as StaffRow[]
  const eligibleStaff = staff.filter(row => canAccessRoom(rolesForStaff(row), grantedRoles))
  let recipients: StaffRow[] = []
  if (parsed.data.audienceKind === 'all_team') recipients = eligibleStaff
  if (parsed.data.audienceKind === 'role') {
    if (!canAccessRoom([parsed.data.targetRole as StaffRole], grantedRoles)) {
      return NextResponse.json({ error: 'That team cannot access this Playbook room' }, { status: 400 })
    }
    recipients = eligibleStaff.filter(row => rolesForStaff(row).includes(parsed.data.targetRole as StaffRole))
  }
  if (parsed.data.audienceKind === 'user') {
    recipients = eligibleStaff.filter(row => row.user_id === parsed.data.targetUserId)
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'That person is not a Team Member with access to this room' }, { status: 400 })
    }
  }

  const publish = await service.rpc('publish_playbook_change_broadcast', {
    p_entry_id: entry.id,
    p_room_id: roomId,
    p_revision_number: entry.revision_number,
    p_headline: parsed.data.headline,
    p_change_summary: parsed.data.changeSummary,
    p_why_it_matters: parsed.data.whyItMatters,
    p_action_required: parsed.data.actionRequired,
    p_priority: parsed.data.priority,
    p_audience_kind: parsed.data.audienceKind,
    p_target_role: parsed.data.targetRole,
    p_target_user_id: parsed.data.targetUserId,
    p_effective_at: parsed.data.effectiveAt,
    p_reading_required: parsed.data.readingRequired,
    p_reading_due_at: parsed.data.readingDueAt,
    p_published_by: auth.user.id,
    p_recipient_ids: recipients.map(recipient => recipient.user_id),
  })
  if (publish.error) {
    if (isChangeBroadcastSchemaMissing(publish.error)) {
      return NextResponse.json({ error: 'Playbook updates are built but their candidate migration has not been applied yet.' }, { status: 503 })
    }
    return NextResponse.json({ error: publish.error.code === '23505' ? 'This revision already has an update for that audience.' : publish.error.message }, { status: publish.error.code === '23505' ? 409 : 500 })
  }
  const broadcastId = String(publish.data)

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'publish_playbook_change_broadcast',
    targetType: 'playbook_change_broadcast',
    targetId: broadcastId,
    changes: {
      entryId: entry.id,
      revisionNumber: entry.revision_number,
      audienceKind: parsed.data.audienceKind,
      targetRole: parsed.data.targetRole,
      targetUserId: parsed.data.targetUserId,
      priority: parsed.data.priority,
      readingRequired: parsed.data.readingRequired,
      recipientCount: recipients.length,
    },
  })

  return NextResponse.json({ data: { id: broadcastId, recipientCount: recipients.length } })
}
