export const dynamic = 'force-dynamic'

import { ALL_STAFF_ROLES, getStaffRoles, requireStaffPage, type StaffRole } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import {
  assignmentAppliesToUser,
  latestAcknowledgedRevision,
  readingState,
  type ReadingAcknowledgement,
  type ReadingAssignment,
} from '@/lib/playbook/assignments'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { LearningQueue, type LearningQueueItem } from '@/components/playbook/LearningQueue'

type EntryRow = { id: string; room_id: string; title: string; slug: string; status: string }
type StaffRow = { user_id: string; display_name: string | null }

export default async function PlaybookLearningPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)])
  const grantedByRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) {
    grantedByRoom.set(grant.room_id, [...(grantedByRoom.get(grant.room_id) ?? []), grant.role as StaffRole])
  }
  const accessibleRooms = rooms.filter(room => canAccessRoom(roles, grantedByRoom.get(room.id) ?? []))
  const roomIds = accessibleRooms.map(room => room.id)

  const entryResult = roomIds.length > 0
    ? await service
        .from('playbook_entries')
        .select('id, room_id, title, slug, status')
        .in('room_id', roomIds)
        .eq('status', 'published')
    : { data: [], error: null }
  if (entryResult.error) throw new Error(`Failed to load assigned Playbook entries: ${entryResult.error.message}`)
  const entries = (entryResult.data ?? []) as EntryRow[]
  const entryIds = entries.map(entry => entry.id)

  const assignmentResult = entryIds.length > 0
    ? await service
        .from('playbook_reading_assignments')
        .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
        .in('entry_id', entryIds)
        .is('revoked_at', null)
    : { data: [], error: null }
  if (assignmentResult.error) throw new Error(`Failed to load Playbook reading assignments: ${assignmentResult.error.message}`)
  const assignments = ((assignmentResult.data ?? []) as ReadingAssignment[])
    .filter(assignment => assignmentAppliesToUser(assignment, auth.user.id, roles))
  const assignmentIds = assignments.map(assignment => assignment.id)
  const assignerIds = Array.from(new Set(assignments.flatMap(assignment => assignment.assigned_by ? [assignment.assigned_by] : [])))

  const [ackResult, staffResult] = await Promise.all([
    assignmentIds.length > 0
      ? service
          .from('playbook_reading_acknowledgements')
          .select('assignment_id, user_id, revision_number, acknowledged_at')
          .in('assignment_id', assignmentIds)
          .eq('user_id', auth.user.id)
      : Promise.resolve({ data: [] as ReadingAcknowledgement[], error: null }),
    assignerIds.length > 0
      ? service.from('funun_staff').select('user_id, display_name').in('user_id', assignerIds)
      : Promise.resolve({ data: [] as StaffRow[], error: null }),
  ])
  if (ackResult.error) throw new Error(`Failed to load Playbook acknowledgements: ${ackResult.error.message}`)
  if (staffResult.error) throw new Error(`Failed to load Playbook assigners: ${staffResult.error.message}`)

  const entryById = new Map(entries.map(entry => [entry.id, entry]))
  const roomById = new Map(accessibleRooms.map(room => [room.id, room]))
  const assignerById = new Map(((staffResult.data ?? []) as StaffRow[]).map(row => [row.user_id, row.display_name?.trim() || 'Team Member']))
  const acknowledgements = (ackResult.data ?? []) as ReadingAcknowledgement[]
  const now = new Date()
  const items = assignments.flatMap((assignment): LearningQueueItem[] => {
    const entry = entryById.get(assignment.entry_id)
    const room = entry ? roomById.get(entry.room_id) : null
    if (!entry || !room) return []
    const acknowledgedRevision = latestAcknowledgedRevision(acknowledgements, assignment.id, auth.user.id)
    return [{
      assignmentId: assignment.id,
      entryId: entry.id,
      title: entry.title,
      roomKey: room.key,
      roomLabel: room.label,
      slug: entry.slug,
      requiredRevision: assignment.required_revision,
      acknowledgedRevision,
      dueAt: assignment.due_at,
      required: assignment.required,
      state: readingState({ assignment, acknowledgedRevision, now }),
      audienceLabel: assignment.target_kind === 'user' ? 'Assigned to you' : `${assignment.target_role?.toUpperCase()} team`,
      assignedByLabel: assignment.assigned_by ? assignerById.get(assignment.assigned_by) ?? 'Team Member' : null,
    }]
  }).sort((a, b) => {
    const rank = { overdue: 0, due: 1, optional: 2, complete: 3, retired: 4 }
    return rank[a.state] - rank[b.state] || Date.parse(a.dueAt ?? '9999-12-31') - Date.parse(b.dueAt ?? '9999-12-31')
  })

  return (
    <main className="mx-auto w-full max-w-[900px] px-6 py-[30px] pb-[60px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">My Required Reading</h1>
      <p className="mt-2 max-w-[68ch] text-[13px] leading-6 text-[color:var(--ink-3)]">
        Guidance assigned directly to you or to one of your Funūn teams, tracked by the exact published revision.
      </p>
      <LearningQueue items={items} />
    </main>
  )
}
