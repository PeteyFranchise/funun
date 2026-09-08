import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getStaffRoles } from '@/lib/admin/staff-role'
import { assignmentAppliesToUser, type ReadingAssignment } from '@/lib/playbook/assignments'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'

const Schema = z.object({ roomKey: z.string().trim().min(1).max(80) }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid assignment id' }, { status: 400 })
  }
  const parsed = Schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid acknowledgement request' }, { status: 400 })
  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: assignmentData, error: assignmentError } = await service
    .from('playbook_reading_assignments')
    .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
    .eq('id', id)
    .maybeSingle()
  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 500 })
  if (!assignmentData) return NextResponse.json({ error: 'Reading assignment not found' }, { status: 404 })
  const assignment = assignmentData as ReadingAssignment

  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('room_id, status')
    .eq('id', assignment.entry_id)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 })
  if (!entry || (entry as { status: string }).status !== 'published') {
    return NextResponse.json({ error: 'Published Playbook entry not found' }, { status: 404 })
  }
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .eq('id', (entry as { room_id: string }).room_id)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const roles = getStaffRoles(auth.user)
  if (!assignmentAppliesToUser(assignment, auth.user.id, roles)) {
    return NextResponse.json({ error: 'This reading assignment is not assigned to you' }, { status: 403 })
  }

  const acknowledgement = {
    assignment_id: assignment.id,
    user_id: auth.user.id,
    revision_number: assignment.required_revision,
    acknowledged_at: new Date().toISOString(),
  }
  const { data: existing, error: existingError } = await service
    .from('playbook_reading_acknowledgements')
    .select('*')
    .eq('assignment_id', assignment.id)
    .eq('user_id', auth.user.id)
    .eq('revision_number', assignment.required_revision)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing) return NextResponse.json({ data: existing })

  const { data, error } = await service
    .from('playbook_reading_acknowledgements')
    .insert(acknowledgement)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'acknowledge_playbook_reading',
    targetType: 'playbook_reading_assignment',
    targetId: assignment.id,
    changes: { entryId: assignment.entry_id, revisionNumber: assignment.required_revision },
  })
  return NextResponse.json({ data })
}
