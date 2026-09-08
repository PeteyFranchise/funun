import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { csvCell, readingRoster, type ReadingAcknowledgement, type ReadingAssignment } from '@/lib/playbook/assignments'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import type { StaffRole } from '@/lib/admin/staff-role'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const roomKey = new URL(request.url).searchParams.get('roomKey') ?? ''
  if (!z.string().uuid().safeParse(id).success || !z.string().trim().min(1).max(80).safeParse(roomKey).success) {
    return NextResponse.json({ error: 'Invalid reading export request' }, { status: 400 })
  }
  const auth = await requireRoomAccess(roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const service = createServiceClient()
  const { data: room, error: roomError } = await service.from('playbook_rooms').select('id').eq('key', roomKey).maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const roomId = (room as { id: string }).id
  const canManage = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: entry, error: entryError } = await service.from('playbook_entries').select('id').eq('id', id).eq('room_id', roomId).maybeSingle()
  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found in this room' }, { status: 404 })

  const [assignmentResult, staffResult] = await Promise.all([
    service.from('playbook_reading_assignments').select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at').eq('entry_id', id).is('revoked_at', null),
    service.from('funun_staff').select('user_id, display_name, staff_role, staff_roles'),
  ])
  if (assignmentResult.error) return NextResponse.json({ error: assignmentResult.error.message }, { status: 500 })
  if (staffResult.error) return NextResponse.json({ error: staffResult.error.message }, { status: 500 })
  const assignments = (assignmentResult.data ?? []) as ReadingAssignment[]
  const acknowledgementResult = assignments.length > 0
    ? await service.from('playbook_reading_acknowledgements').select('assignment_id, user_id, revision_number, acknowledged_at').in('assignment_id', assignments.map(item => item.id))
    : { data: [], error: null }
  if (acknowledgementResult.error) return NextResponse.json({ error: acknowledgementResult.error.message }, { status: 500 })
  const staff = (staffResult.data ?? []).map(row => ({
    userId: row.user_id as string,
    label: (row.display_name as string | null)?.trim() || 'Team Member',
    roles: ((row.staff_roles as StaffRole[] | null)?.length ? row.staff_roles : [row.staff_role]) as StaffRole[],
  }))
  const labels = new Map(staff.map(person => [person.userId, person.label]))
  const roster = readingRoster({ assignments, acknowledgements: (acknowledgementResult.data ?? []) as ReadingAcknowledgement[], staff, now: new Date() })
  const headings = ['Team Member', 'State', 'Assignment source', 'Required revision', 'Acknowledged revision', 'Acknowledged at', 'Due at']
  const lines = [headings.map(csvCell).join(',')]
  for (const row of roster) {
    lines.push([
      labels.get(row.userId) ?? 'Team Member', row.state, row.sourceLabels.join('; '), row.requiredRevision,
      row.acknowledgedRevision, row.acknowledgedAt, row.dueAt,
    ].map(csvCell).join(','))
  }
  return new NextResponse(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="playbook-reading-${id}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
