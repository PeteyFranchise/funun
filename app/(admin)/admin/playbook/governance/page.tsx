export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaffPage, type StaffRole } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import {
  readingProgress,
  readingRoster,
  type ReadingAcknowledgement,
  type ReadingAssignment,
} from '@/lib/playbook/assignments'
import {
  GOVERNANCE_ENTRY_SELECT,
  classifyGovernanceEntry,
  resolveGovernanceRooms,
  type GovernanceEntry,
} from '@/lib/playbook/governance'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { GovernanceInbox, type GovernanceInboxItem } from '@/components/playbook/GovernanceInbox'
import { isReviewSchemaMissing, type PlaybookReviewRoundStatus } from '@/lib/playbook/reviews'

type LeadRow = { room_id: string }
type SubgroupRow = { id: string; label: string }
type StaffRow = {
  user_id: string
  display_name: string | null
  staff_role: string
  staff_roles: string[] | null
}
type GamePlanLinkRow = { entry_id: string }

export default async function PlaybookGovernancePage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()

  const [rooms, grants, leadResult] = await Promise.all([
    loadRooms(service),
    readRoomGrants(service),
    roles.includes('leadership')
      ? Promise.resolve({ data: [] as LeadRow[], error: null })
      : service.from('playbook_room_leads').select('room_id').eq('user_id', auth.user.id),
  ])
  if (leadResult.error) throw new Error(`Failed to load Playbook lead assignments: ${leadResult.error.message}`)

  const governanceRooms = resolveGovernanceRooms({
    roles,
    rooms,
    grants,
    leadRoomIds: ((leadResult.data ?? []) as LeadRow[]).map(row => row.room_id),
  })
  if (governanceRooms.length === 0) redirect('/admin/playbook')

  const roomIds = governanceRooms.map(room => room.id)
  const { data: entryData, error: entryError } = await service
    .from('playbook_entries')
    .select(GOVERNANCE_ENTRY_SELECT)
    .in('room_id', roomIds)
    .order('updated_at', { ascending: false })
  if (entryError) throw new Error(`Failed to load Playbook governance metadata: ${entryError.message}`)

  // Governance receives metadata only. Published and draft document bodies are
  // intentionally omitted; reviewers enter the room's existing guarded workflow.
  const entries = (entryData ?? []) as GovernanceEntry[]
  const entryIds = entries.map(entry => entry.id)

  const reviewRoundResult = entryIds.length > 0
    ? await service
        .from('playbook_review_rounds')
        .select('id, entry_id, status, created_at')
        .in('entry_id', entryIds)
        .in('status', ['awaiting_review', 'changes_requested', 'ready_for_rereview'])
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (reviewRoundResult.error && !isReviewSchemaMissing(reviewRoundResult.error)) {
    throw new Error(`Failed to load Playbook review queue: ${reviewRoundResult.error.message}`)
  }
  const latestReviewByEntry = new Map<string, { id: string; status: PlaybookReviewRoundStatus }>()
  for (const row of reviewRoundResult.data ?? []) {
    if (!latestReviewByEntry.has(row.entry_id as string)) {
      latestReviewByEntry.set(row.entry_id as string, { id: row.id as string, status: row.status as PlaybookReviewRoundStatus })
    }
  }
  const activeRoundIds = Array.from(latestReviewByEntry.values()).map(round => round.id)
  const requestedThreadResult = activeRoundIds.length > 0
    ? await service
        .from('playbook_review_threads')
        .select('review_round_id, status')
        .in('review_round_id', activeRoundIds)
        .eq('feedback_kind', 'requested_change')
    : { data: [], error: null }
  if (requestedThreadResult.error && !isReviewSchemaMissing(requestedThreadResult.error)) {
    throw new Error(`Failed to load Playbook requested changes: ${requestedThreadResult.error.message}`)
  }
  const openRequestedByRound = new Map<string, number>()
  for (const row of requestedThreadResult.data ?? []) {
    if (row.status === 'open') openRequestedByRound.set(row.review_round_id as string, (openRequestedByRound.get(row.review_round_id as string) ?? 0) + 1)
  }

  const [subgroupResult, staffResult, linkResult, assignmentResult] = await Promise.all([
    service.from('playbook_sub_groups').select('id, label').in('room_id', roomIds),
    service.from('funun_staff').select('user_id, display_name, staff_role, staff_roles').order('display_name'),
    entryIds.length > 0
      ? service.from('playbook_entry_game_plan_links').select('entry_id').in('entry_id', entryIds)
      : Promise.resolve({ data: [] as GamePlanLinkRow[], error: null }),
    entryIds.length > 0
      ? service
          .from('playbook_reading_assignments')
          .select('id, entry_id, target_kind, target_user_id, target_role, required_revision, required, due_at, assigned_by, created_at, revoked_at')
          .in('entry_id', entryIds)
          .is('revoked_at', null)
      : Promise.resolve({ data: [] as ReadingAssignment[], error: null }),
  ])
  if (subgroupResult.error) throw new Error(`Failed to load Playbook subgroups: ${subgroupResult.error.message}`)
  if (staffResult.error) throw new Error(`Failed to load Funūn Team Members: ${staffResult.error.message}`)
  if (linkResult.error) throw new Error(`Failed to load Playbook Gameplan links: ${linkResult.error.message}`)
  if (assignmentResult.error) throw new Error(`Failed to load Playbook reading assignments: ${assignmentResult.error.message}`)

  const assignments = (assignmentResult.data ?? []) as ReadingAssignment[]
  const assignmentIds = assignments.map(assignment => assignment.id)
  const acknowledgementResult = assignmentIds.length > 0
    ? await service
        .from('playbook_reading_acknowledgements')
        .select('assignment_id, user_id, revision_number, acknowledged_at')
        .in('assignment_id', assignmentIds)
    : { data: [], error: null }
  if (acknowledgementResult.error) {
    throw new Error(`Failed to load Playbook reading acknowledgements: ${acknowledgementResult.error.message}`)
  }

  const roomById = new Map(governanceRooms.map(room => [room.id, room]))
  const grantedRolesByRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) {
    grantedRolesByRoom.set(grant.room_id, [
      ...(grantedRolesByRoom.get(grant.room_id) ?? []),
      grant.role as StaffRole,
    ])
  }
  const subgroupById = new Map(((subgroupResult.data ?? []) as SubgroupRow[]).map(row => [row.id, row.label]))
  const staffRows = (staffResult.data ?? []) as StaffRow[]
  const ownerById = new Map(staffRows.map(row => [
    row.user_id,
    row.display_name?.trim() || 'Team Member',
  ]))
  const staffForProgress = staffRows.map(row => ({
    userId: row.user_id,
    roles: ((row.staff_roles?.length ? row.staff_roles : [row.staff_role]) as StaffRole[]),
  }))
  const acknowledgements = (acknowledgementResult.data ?? []) as ReadingAcknowledgement[]
  const linkCountByEntry = new Map<string, number>()
  for (const link of (linkResult.data ?? []) as GamePlanLinkRow[]) {
    linkCountByEntry.set(link.entry_id, (linkCountByEntry.get(link.entry_id) ?? 0) + 1)
  }

  const now = new Date()
  const items = entries.flatMap((entry): GovernanceInboxItem[] => {
    const room = roomById.get(entry.room_id)
    if (!room) return []
    const gamePlanLinkCount = linkCountByEntry.get(entry.id) ?? 0
    const reviewRound = latestReviewByEntry.get(entry.id)
    const entryAssignments = assignments.filter(assignment => assignment.entry_id === entry.id)
    const assignmentIdSet = new Set(entryAssignments.map(assignment => assignment.id))
    const progress = readingProgress({
      assignments: entryAssignments,
      acknowledgements: acknowledgements.filter(acknowledgement => assignmentIdSet.has(acknowledgement.assignment_id)),
      staff: staffForProgress,
      now,
    })
    const roster = readingRoster({
      assignments: entryAssignments,
      acknowledgements: acknowledgements.filter(acknowledgement => assignmentIdSet.has(acknowledgement.assignment_id)),
      staff: staffForProgress,
      now,
    })
    return [{
      ...entry,
      roomKey: room.key,
      roomLabel: room.label,
      subgroupLabel: entry.sub_group_id ? subgroupById.get(entry.sub_group_id) ?? null : null,
      ownerLabel: entry.owner_id ? ownerById.get(entry.owner_id) ?? 'Team Member' : null,
      gamePlanLinkCount,
      readingAssigned: progress.assigned,
      readingComplete: progress.complete,
      readingOverdue: progress.overdue,
      activeAssignmentCount: entryAssignments.length,
      reviewState: reviewRound?.status === 'changes_requested' || reviewRound?.status === 'ready_for_rereview' || reviewRound?.status === 'awaiting_review'
        ? reviewRound.status
        : entry.draft_author_id
          ? 'awaiting_review'
          : null,
      openRequestedChangeCount: reviewRound ? openRequestedByRound.get(reviewRound.id) ?? 0 : 0,
      readingRoster: roster.map(row => ({ ...row, label: ownerById.get(row.userId) ?? 'Team Member' })),
      readingAssignments: entryAssignments.map(assignment => ({
        id: assignment.id,
        audienceLabel: assignment.target_kind === 'user'
          ? ownerById.get(assignment.target_user_id ?? '') ?? 'Team Member'
          : `${String(assignment.target_role ?? '').toUpperCase()} team`,
        dueAt: assignment.due_at,
        required: assignment.required,
        requiredRevision: assignment.required_revision,
      })),
      assignableRoles: ALL_STAFF_ROLES.filter(role =>
        canAccessRoom([role], grantedRolesByRoom.get(entry.room_id) ?? [])
      ),
      assignableStaff: staffRows.flatMap(row => {
        const rowRoles = ((row.staff_roles?.length ? row.staff_roles : [row.staff_role]) as StaffRole[])
        return canAccessRoom(rowRoles, grantedRolesByRoom.get(entry.room_id) ?? [])
          ? [{ userId: row.user_id, label: row.display_name?.trim() || 'Team Member' }]
          : []
      }),
      issues: classifyGovernanceEntry(entry, { now, gamePlanLinkCount, overdueReadingCount: progress.overdue }),
    }]
  })

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-[30px] pb-[60px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">Playbook governance</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">Governance Inbox</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] leading-6 text-[color:var(--ink-3)]">
        One queue for approvals, ownership, review dates, source changes, and connected Gameplans across the rooms you govern.
      </p>
      <GovernanceInbox
        items={items}
        rooms={governanceRooms.map(room => ({ id: room.id, label: room.label }))}
      />
    </main>
  )
}
