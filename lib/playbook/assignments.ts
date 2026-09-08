import type { StaffRole } from '@/lib/admin/staff-role'

export type ReadingTargetKind = 'user' | 'role'

export type ReadingAssignment = {
  id: string
  entry_id: string
  target_kind: ReadingTargetKind
  target_user_id: string | null
  target_role: StaffRole | null
  required_revision: number
  required: boolean
  due_at: string | null
  assigned_by: string | null
  created_at: string
  revoked_at: string | null
}

export type ReadingAcknowledgement = {
  assignment_id: string
  user_id: string
  revision_number: number
  acknowledged_at: string
}

export type ReadingState = 'complete' | 'overdue' | 'due' | 'optional' | 'retired'

export type ReadingRosterRow = {
  userId: string
  state: ReadingState
  sourceLabels: string[]
  requiredRevision: number
  acknowledgedRevision: number | null
  acknowledgedAt: string | null
  dueAt: string | null
}

export function assignmentAppliesToUser(
  assignment: ReadingAssignment,
  userId: string,
  roles: readonly StaffRole[]
): boolean {
  if (assignment.revoked_at) return false
  if (assignment.target_kind === 'user') return assignment.target_user_id === userId
  return !!assignment.target_role && roles.includes(assignment.target_role)
}

export function latestAcknowledgedRevision(
  acknowledgements: readonly ReadingAcknowledgement[],
  assignmentId: string,
  userId: string
): number | null {
  let latest: number | null = null
  for (const acknowledgement of acknowledgements) {
    if (acknowledgement.assignment_id !== assignmentId || acknowledgement.user_id !== userId) continue
    latest = Math.max(latest ?? 0, acknowledgement.revision_number)
  }
  return latest
}

export function readingState(args: {
  assignment: ReadingAssignment
  acknowledgedRevision: number | null
  now: Date
}): ReadingState {
  if (args.assignment.revoked_at) return 'retired'
  if ((args.acknowledgedRevision ?? 0) >= args.assignment.required_revision) return 'complete'
  if (!args.assignment.required) return 'optional'
  if (args.assignment.due_at) {
    const due = Date.parse(args.assignment.due_at)
    if (!Number.isNaN(due) && due < args.now.getTime()) return 'overdue'
  }
  return 'due'
}

export function intendedReaders(
  assignments: readonly ReadingAssignment[],
  staff: ReadonlyArray<{ userId: string; roles: readonly StaffRole[] }>
): Set<string> {
  const readers = new Set<string>()
  for (const assignment of assignments) {
    if (assignment.revoked_at) continue
    if (assignment.target_kind === 'user' && assignment.target_user_id) {
      readers.add(assignment.target_user_id)
      continue
    }
    if (assignment.target_kind === 'role' && assignment.target_role) {
      for (const person of staff) {
        if (person.roles.includes(assignment.target_role)) readers.add(person.userId)
      }
    }
  }
  return readers
}

export function readingProgress(args: {
  assignments: readonly ReadingAssignment[]
  acknowledgements: readonly ReadingAcknowledgement[]
  staff: ReadonlyArray<{ userId: string; roles: readonly StaffRole[] }>
  now: Date
}): { assigned: number; complete: number; overdue: number } {
  const readers = intendedReaders(args.assignments, args.staff)
  let complete = 0
  let overdue = 0

  for (const userId of readers) {
    const applicable = args.assignments.filter(assignment =>
      assignmentAppliesToUser(
        assignment,
        userId,
        args.staff.find(person => person.userId === userId)?.roles ?? []
      )
    )
    const incomplete = applicable.filter(assignment => {
      const acknowledgedRevision = latestAcknowledgedRevision(args.acknowledgements, assignment.id, userId)
      return readingState({ assignment, acknowledgedRevision, now: args.now }) !== 'complete'
    })
    if (incomplete.length === 0) complete += 1
    if (incomplete.some(assignment =>
      readingState({
        assignment,
        acknowledgedRevision: latestAcknowledgedRevision(args.acknowledgements, assignment.id, userId),
        now: args.now,
      }) === 'overdue'
    )) overdue += 1
  }

  return { assigned: readers.size, complete, overdue }
}

export function readingRoster(args: {
  assignments: readonly ReadingAssignment[]
  acknowledgements: readonly ReadingAcknowledgement[]
  staff: ReadonlyArray<{ userId: string; roles: readonly StaffRole[] }>
  now: Date
}): ReadingRosterRow[] {
  const readers = intendedReaders(args.assignments, args.staff)
  const rows: ReadingRosterRow[] = []
  for (const userId of readers) {
    const roles = args.staff.find(person => person.userId === userId)?.roles ?? []
    const applicable = args.assignments.filter(assignment => assignmentAppliesToUser(assignment, userId, roles))
    const assignmentStates = applicable.map(assignment => ({
      assignment,
      acknowledgedRevision: latestAcknowledgedRevision(args.acknowledgements, assignment.id, userId),
    }))
    const states = assignmentStates.map(item => readingState({
      assignment: item.assignment,
      acknowledgedRevision: item.acknowledgedRevision,
      now: args.now,
    }))
    const state: ReadingState = states.includes('overdue')
      ? 'overdue'
      : states.includes('due')
        ? 'due'
        : states.includes('optional')
          ? 'optional'
          : 'complete'
    const acknowledgements = args.acknowledgements
      .filter(item => item.user_id === userId && applicable.some(assignment => assignment.id === item.assignment_id))
      .sort((a, b) => Date.parse(b.acknowledged_at) - Date.parse(a.acknowledged_at))
    const dueDates = applicable.flatMap(assignment => assignment.due_at ? [assignment.due_at] : []).sort()
    const acknowledgedRevisions = assignmentStates.map(item => item.acknowledgedRevision)
    rows.push({
      userId,
      state,
      sourceLabels: Array.from(new Set(applicable.map(assignment =>
        assignment.target_kind === 'user' ? 'Direct' : `${assignment.target_role?.toUpperCase()} team`
      ))),
      requiredRevision: Math.max(...applicable.map(assignment => assignment.required_revision)),
      acknowledgedRevision: acknowledgedRevisions.some(value => value === null)
        ? null
        : Math.min(...acknowledgedRevisions.map(value => value ?? 0)),
      acknowledgedAt: acknowledgements[0]?.acknowledged_at ?? null,
      dueAt: dueDates[0] ?? null,
    })
  }
  return rows.sort((a, b) => {
    const rank: Record<ReadingState, number> = { overdue: 0, due: 1, optional: 2, complete: 3, retired: 4 }
    return rank[a.state] - rank[b.state] || a.userId.localeCompare(b.userId)
  })
}

export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
