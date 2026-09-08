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
import { myPlaybookSections, type MyPlaybookEntry } from '@/lib/playbook/my-workspace'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { MyPlaybookWorkspace, type MyReadingItem } from '@/components/playbook/MyPlaybookWorkspace'
import { isReviewSchemaMissing } from '@/lib/playbook/reviews'
import { loadVisibleChangeBroadcasts } from '@/lib/playbook/change-broadcasts'

type SubgroupRow = { id: string; label: string; room_id: string }

const MY_ENTRY_SELECT =
  'id, room_id, sub_group_id, entry_type, title, slug, status, author_id, draft_author_id, draft_updated_at, owner_id, review_due_at, updated_at, published_at, revision_number' as const

export default async function MyPlaybookPage() {
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

  const [entryResult, subgroupResult, directAssignments, roleAssignments] = await Promise.all([
    roomIds.length > 0
      ? service.from('playbook_entries').select(MY_ENTRY_SELECT).in('room_id', roomIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as MyPlaybookEntry[], error: null }),
    roomIds.length > 0
      ? service.from('playbook_sub_groups').select('id, label, room_id').in('room_id', roomIds)
      : Promise.resolve({ data: [] as SubgroupRow[], error: null }),
    service
      .from('playbook_reading_assignments')
      .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
      .eq('target_kind', 'user')
      .eq('target_user_id', auth.user.id)
      .is('revoked_at', null),
    service
      .from('playbook_reading_assignments')
      .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
      .eq('target_kind', 'role')
      .in('target_role', roles)
      .is('revoked_at', null),
  ])
  if (entryResult.error) throw new Error(`Failed to load My Playbook entries: ${entryResult.error.message}`)
  if (subgroupResult.error) throw new Error(`Failed to load My Playbook subgroups: ${subgroupResult.error.message}`)
  if (directAssignments.error || roleAssignments.error) {
    throw new Error(`Failed to load My Playbook assignments: ${directAssignments.error?.message ?? roleAssignments.error?.message}`)
  }

  const entries = (entryResult.data ?? []) as MyPlaybookEntry[]
  const entryById = new Map(entries.map(entry => [entry.id, entry]))
  const roomById = new Map(accessibleRooms.map(room => [room.id, room]))
  const assignmentById = new Map<string, ReadingAssignment>()
  for (const assignment of [...(directAssignments.data ?? []), ...(roleAssignments.data ?? [])] as ReadingAssignment[]) {
    if (entryById.has(assignment.entry_id) && assignmentAppliesToUser(assignment, auth.user.id, roles)) {
      assignmentById.set(assignment.id, assignment)
    }
  }
  const assignments = Array.from(assignmentById.values())
  const acknowledgementResult = assignments.length > 0
    ? await service
        .from('playbook_reading_acknowledgements')
        .select('assignment_id, user_id, revision_number, acknowledged_at')
        .in('assignment_id', assignments.map(assignment => assignment.id))
        .eq('user_id', auth.user.id)
    : { data: [], error: null }
  if (acknowledgementResult.error) throw new Error(`Failed to load My Playbook acknowledgements: ${acknowledgementResult.error.message}`)

  const acknowledgements = (acknowledgementResult.data ?? []) as ReadingAcknowledgement[]
  const now = new Date()
  const readings = assignments.flatMap((assignment): MyReadingItem[] => {
    const entry = entryById.get(assignment.entry_id)
    const room = entry ? roomById.get(entry.room_id) : null
    if (!entry || !room || entry.status !== 'published' || !entry.slug) return []
    const state = readingState({
      assignment,
      acknowledgedRevision: latestAcknowledgedRevision(acknowledgements, assignment.id, auth.user.id),
      now,
    })
    if (state === 'complete' || state === 'retired') return []
    return [{
      assignmentId: assignment.id,
      title: entry.title,
      roomKey: room.key,
      roomLabel: room.label,
      slug: entry.slug,
      dueAt: assignment.due_at,
      state,
    }]
  }).sort((a, b) => {
    const rank = { overdue: 0, due: 1, optional: 2 }
    return rank[a.state] - rank[b.state] || Date.parse(a.dueAt ?? '9999-12-31') - Date.parse(b.dueAt ?? '9999-12-31')
  })
  const sections = myPlaybookSections(entries, auth.user.id)
  const updates = await loadVisibleChangeBroadcasts(service, {
    viewerId: auth.user.id,
    roles,
    accessibleRoomIds: roomIds,
    limit: 24,
  })
  if (updates.error) throw new Error(`Failed to load My Playbook updates: ${updates.error}`)
  const authoredDraftIds = sections.drafts.map(entry => entry.id)
  const changeRoundsResult = authoredDraftIds.length > 0
    ? await service
        .from('playbook_review_rounds')
        .select('id, entry_id, created_at')
        .in('entry_id', authoredDraftIds)
        .eq('status', 'changes_requested')
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (changeRoundsResult.error && !isReviewSchemaMissing(changeRoundsResult.error)) {
    throw new Error(`Failed to load requested Playbook changes: ${changeRoundsResult.error.message}`)
  }
  const roundById = new Map((changeRoundsResult.data ?? []).map(row => [row.id as string, row]))
  const requestedChangesResult = roundById.size > 0
    ? await service
        .from('playbook_review_threads')
        .select('review_round_id, status, created_at')
        .in('review_round_id', Array.from(roundById.keys()))
        .eq('feedback_kind', 'requested_change')
        .in('status', ['open', 'addressed'])
    : { data: [], error: null }
  if (requestedChangesResult.error && !isReviewSchemaMissing(requestedChangesResult.error)) {
    throw new Error(`Failed to load requested Playbook change threads: ${requestedChangesResult.error.message}`)
  }
  const changeSummary = new Map<string, { openCount: number; addressedCount: number; latestAt: string }>()
  for (const row of requestedChangesResult.data ?? []) {
    const round = roundById.get(row.review_round_id as string)
    if (!round) continue
    const entryId = round.entry_id as string
    const current = changeSummary.get(entryId)
    changeSummary.set(entryId, {
      openCount: (current?.openCount ?? 0) + (row.status === 'open' ? 1 : 0),
      addressedCount: (current?.addressedCount ?? 0) + (row.status === 'addressed' ? 1 : 0),
      latestAt: current?.latestAt ?? round.created_at as string,
    })
  }
  const changesRequested = sections.drafts.flatMap(entry => {
    const summary = changeSummary.get(entry.id)
    return summary ? [{ entry, ...summary }] : []
  })

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-[30px] pb-[60px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">My Playbook</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] leading-6 text-[color:var(--ink-3)]">
        Your personal workspace for continuing drafts, completing assigned reading, owning reviews, and catching up on newly published guidance.
      </p>
      <MyPlaybookWorkspace
        viewerId={auth.user.id}
        rooms={accessibleRooms.map(room => ({ id: room.id, key: room.key, label: room.label }))}
        subgroups={((subgroupResult.data ?? []) as SubgroupRow[]).map(group => ({ id: group.id, label: group.label }))}
        drafts={sections.drafts}
        readings={readings}
        changesRequested={changesRequested}
        reviews={sections.reviews}
        recent={sections.recent}
        updates={updates.data.filter(item => !item.isRead).slice(0, 6)}
        updatesSchemaReady={updates.schemaReady}
      />
    </main>
  )
}
