import type { PlaybookRoom } from './rooms'
import {
  GOVERNANCE_ENTRY_SELECT,
  classifyGovernanceEntry,
  governanceIssueCounts,
  resolveGovernanceRooms,
  type GovernanceEntry,
} from './governance'

const rooms: PlaybookRoom[] = [
  { id: 'room-a', key: 'a', label: 'A', sort_order: 1, sensitive: false, coming_soon: false },
  { id: 'room-b', key: 'b', label: 'B', sort_order: 2, sensitive: true, coming_soon: false },
]

const baseEntry: GovernanceEntry = {
  id: 'entry-1',
  room_id: 'room-a',
  sub_group_id: null,
  entry_type: 'document',
  title: 'Doctrine',
  slug: 'doctrine',
  status: 'published',
  draft_author_id: null,
  draft_updated_at: null,
  owner_id: 'owner-1',
  review_due_at: '2026-09-01T00:00:00.000Z',
  source_hash: 'old',
  draft_source_hash: null,
  source_kind: 'adopted_markdown',
  updated_at: '2026-09-01T00:00:00.000Z',
}

describe('resolveGovernanceRooms', () => {
  it('gives leadership every room without requiring row grants', () => {
    expect(resolveGovernanceRooms({ roles: ['leadership'], rooms, grants: [], leadRoomIds: [] })).toEqual(rooms)
  })

  it('gives a room lead only led rooms their role can actually access', () => {
    expect(resolveGovernanceRooms({
      roles: ['anr'],
      rooms,
      grants: [{ room_id: 'room-a', role: 'anr' }],
      leadRoomIds: ['room-a', 'room-b'],
    })).toEqual([rooms[0]])
  })

  it('does not mistake a room grant for governance authority', () => {
    expect(resolveGovernanceRooms({
      roles: ['anr'],
      rooms,
      grants: rooms.map(room => ({ room_id: room.id, role: 'anr' })),
      leadRoomIds: [],
    })).toEqual([])
  })
})

describe('GOVERNANCE_ENTRY_SELECT', () => {
  it('never requests published or pending document bodies', () => {
    const fields = GOVERNANCE_ENTRY_SELECT.split(', ').map(field => field.trim())
    expect(fields).not.toContain('content')
    expect(fields).not.toContain('draft_content')
  })
})

describe('classifyGovernanceEntry', () => {
  it('surfaces every actionable concern without reading draft content', () => {
    const issues = classifyGovernanceEntry({
      ...baseEntry,
      draft_author_id: 'author-1',
      draft_source_hash: 'new',
    }, { now: new Date('2026-09-07T00:00:00.000Z'), gamePlanLinkCount: 0 })

    expect(issues.map(issue => issue.kind)).toEqual([
      'pending_approval',
      'source_update_pending',
      'review_overdue',
      'gameplan_unlinked',
    ])
  })

  it('does not assign active-governance warnings to retired entries', () => {
    expect(classifyGovernanceEntry(
      { ...baseEntry, status: 'archived', owner_id: null },
      { now: new Date('2026-09-07T00:00:00.000Z'), gamePlanLinkCount: 0 }
    )).toEqual([{ kind: 'retired', priority: 'low', label: 'Archived' }])
  })

  it('counts issue priority, not merely affected articles', () => {
    expect(governanceIssueCounts([
      { issues: [{ kind: 'review_overdue', priority: 'high', label: 'Review overdue' }] },
      { issues: [
        { kind: 'owner_missing', priority: 'medium', label: 'Owner missing' },
        { kind: 'gameplan_unlinked', priority: 'medium', label: 'No connected Gameplan' },
      ] },
    ])).toEqual({ high: 1, medium: 2, low: 0, total: 3 })
  })
})
