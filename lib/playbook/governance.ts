import type { StaffRole } from '@/lib/admin/staff-role'
import type { PlaybookRoom } from '@/lib/playbook/rooms'
import type { RoomGrantRow } from '@/lib/playbook/access-grants'
import type { EntryStatus, EntryType } from '@/lib/playbook/entries'

// The governance inbox is deliberately metadata-only. Keep this allowlist
// centralized and unit-tested so a future dashboard edit cannot casually
// expose published or pending document bodies across rooms.
export const GOVERNANCE_ENTRY_SELECT =
  'id, room_id, sub_group_id, entry_type, title, slug, status, draft_author_id, draft_updated_at, owner_id, review_due_at, source_hash, draft_source_hash, source_kind, updated_at' as const

export type GovernanceIssueKind =
  | 'pending_approval'
  | 'source_update_pending'
  | 'review_overdue'
  | 'owner_missing'
  | 'review_unscheduled'
  | 'gameplan_unlinked'
  | 'reading_overdue'
  | 'retired'

export type GovernanceIssue = {
  kind: GovernanceIssueKind
  priority: 'high' | 'medium' | 'low'
  label: string
}

export type GovernanceEntry = {
  id: string
  room_id: string
  sub_group_id: string | null
  entry_type: EntryType
  title: string
  slug: string | null
  status: EntryStatus
  draft_author_id: string | null
  draft_updated_at: string | null
  owner_id: string | null
  review_due_at: string | null
  source_hash: string | null
  draft_source_hash: string | null
  source_kind: 'native' | 'adopted_markdown'
  updated_at: string
}

export function resolveGovernanceRooms(args: {
  roles: readonly StaffRole[]
  rooms: readonly PlaybookRoom[]
  grants: readonly RoomGrantRow[]
  leadRoomIds: readonly string[]
}): PlaybookRoom[] {
  if (args.roles.includes('leadership')) return [...args.rooms]
  const leadSet = new Set(args.leadRoomIds)
  const grantsByRoom = new Map<string, StaffRole[]>()
  for (const grant of args.grants) {
    const list = grantsByRoom.get(grant.room_id) ?? []
    list.push(grant.role as StaffRole)
    grantsByRoom.set(grant.room_id, list)
  }
  return args.rooms.filter(
    room => {
      const grantedRoles = grantsByRoom.get(room.id) ?? []
      return leadSet.has(room.id) && args.roles.some(role => grantedRoles.includes(role))
    }
  )
}

export function classifyGovernanceEntry(
  entry: GovernanceEntry,
  args: { now: Date; gamePlanLinkCount: number; overdueReadingCount?: number }
): GovernanceIssue[] {
  if (entry.status === 'archived' || entry.status === 'superseded') {
    return [{ kind: 'retired', priority: 'low', label: entry.status === 'archived' ? 'Archived' : 'Superseded' }]
  }

  const issues: GovernanceIssue[] = []
  if (entry.draft_author_id) {
    issues.push({ kind: 'pending_approval', priority: 'high', label: 'Pending approval' })
  }
  if (entry.draft_source_hash && entry.draft_source_hash !== entry.source_hash) {
    issues.push({ kind: 'source_update_pending', priority: 'high', label: 'Source update pending' })
  }
  if (!entry.owner_id) {
    issues.push({ kind: 'owner_missing', priority: 'medium', label: 'Owner missing' })
  }
  if (entry.status === 'published' && entry.owner_id && !entry.review_due_at) {
    issues.push({ kind: 'review_unscheduled', priority: 'medium', label: 'Review not scheduled' })
  }
  if (
    entry.status === 'published' &&
    entry.review_due_at &&
    !Number.isNaN(Date.parse(entry.review_due_at)) &&
    Date.parse(entry.review_due_at) <= args.now.getTime()
  ) {
    issues.push({ kind: 'review_overdue', priority: 'high', label: 'Review overdue' })
  }
  if (entry.status === 'published' && entry.entry_type === 'document' && args.gamePlanLinkCount === 0) {
    issues.push({ kind: 'gameplan_unlinked', priority: 'medium', label: 'No connected Gameplan' })
  }
  if ((args.overdueReadingCount ?? 0) > 0) {
    issues.push({ kind: 'reading_overdue', priority: 'high', label: `${args.overdueReadingCount} reader(s) overdue` })
  }
  return issues
}

export function governanceIssueCounts(items: ReadonlyArray<{ issues: readonly GovernanceIssue[] }>) {
  let high = 0
  let medium = 0
  let low = 0
  for (const item of items) {
    for (const issue of item.issues) {
      if (issue.priority === 'high') high += 1
      else if (issue.priority === 'medium') medium += 1
      else low += 1
    }
  }
  return { high, medium, low, total: high + medium + low }
}
