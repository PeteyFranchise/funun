import type { StaffRole } from '@/lib/admin/staff-role'
import {
  assignmentAppliesToUser,
  latestAcknowledgedRevision,
  readingProgress,
  readingRoster,
  readingState,
  csvCell,
  type ReadingAcknowledgement,
  type ReadingAssignment,
} from './assignments'

const assignment: ReadingAssignment = {
  id: 'assignment-1',
  entry_id: 'entry-1',
  target_kind: 'role',
  target_user_id: null,
  target_role: 'anr',
  required_revision: 3,
  required: true,
  due_at: '2026-09-06T00:00:00.000Z',
  assigned_by: 'leader-1',
  created_at: '2026-09-01T00:00:00.000Z',
  revoked_at: null,
}

const acknowledgement: ReadingAcknowledgement = {
  assignment_id: assignment.id,
  user_id: 'user-1',
  revision_number: 2,
  acknowledged_at: '2026-09-02T00:00:00.000Z',
}

describe('Playbook reading assignments', () => {
  it('matches role and individual audiences without reviving revoked work', () => {
    expect(assignmentAppliesToUser(assignment, 'user-1', ['anr'])).toBe(true)
    expect(assignmentAppliesToUser(assignment, 'user-1', ['ae'])).toBe(false)
    expect(assignmentAppliesToUser({ ...assignment, revoked_at: '2026-09-03' }, 'user-1', ['anr'])).toBe(false)
    expect(assignmentAppliesToUser({ ...assignment, target_kind: 'user', target_user_id: 'user-1' }, 'user-1', [])).toBe(true)
  })

  it('requires acknowledgement of the assigned revision or later', () => {
    expect(latestAcknowledgedRevision([acknowledgement], assignment.id, 'user-1')).toBe(2)
    expect(readingState({
      assignment,
      acknowledgedRevision: 2,
      now: new Date('2026-09-07T00:00:00.000Z'),
    })).toBe('overdue')
    expect(readingState({
      assignment,
      acknowledgedRevision: 3,
      now: new Date('2026-09-07T00:00:00.000Z'),
    })).toBe('complete')
  })

  it('deduplicates people covered by both direct and role assignments', () => {
    const direct = { ...assignment, id: 'assignment-2', target_kind: 'user' as const, target_user_id: 'user-1', target_role: null }
    const staff: Array<{ userId: string; roles: StaffRole[] }> = [
      { userId: 'user-1', roles: ['anr'] },
      { userId: 'user-2', roles: ['ae'] },
    ]
    expect(readingProgress({
      assignments: [assignment, direct],
      acknowledgements: [{ ...acknowledgement, revision_number: 3 }],
      staff,
      now: new Date('2026-09-07T00:00:00.000Z'),
    })).toEqual({ assigned: 1, complete: 0, overdue: 1 })
  })

  it('builds a per-reader roster and gives the most urgent incomplete state precedence', () => {
    const rows = readingRoster({
      assignments: [assignment],
      acknowledgements: [acknowledgement],
      staff: [{ userId: 'user-1', roles: ['anr'] }],
      now: new Date('2026-09-07T00:00:00.000Z'),
    })
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      state: 'overdue',
      sourceLabels: ['ANR team'],
      requiredRevision: 3,
      acknowledgedRevision: 2,
    })
  })

  it('neutralizes spreadsheet formulas and quotes CSV values', () => {
    expect(csvCell('=IMPORTXML("https://bad")')).toBe('"\'=IMPORTXML(""https://bad"")"')
    expect(csvCell('Normal, name')).toBe('"Normal, name"')
  })
})
