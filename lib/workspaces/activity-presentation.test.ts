import {
  filterWorkspaceActivityRows,
  workspaceActivityCsv,
  workspaceActivityCategory,
  workspaceActivityTargetHref,
  workspaceActivityTargetLabel,
  type WorkspaceActivityFilters,
} from '@/lib/workspaces/activity-presentation'
import type { WorkspaceActivityRecord } from '@/lib/workspaces/room-data'

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TARGET_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const NOW = Date.parse('2026-09-12T12:00:00.000Z')

function event(overrides: Partial<WorkspaceActivityRecord> = {}): WorkspaceActivityRecord {
  return {
    id: TARGET_ID,
    actorUserId: ACTOR_ID,
    actorDisplayName: 'Maya Reyes',
    subjectMemberId: SUBJECT_ID,
    subjectDisplayName: 'Jordan Lee',
    action: 'workspace.roster.proposed',
    actionLabel: 'Proposed a roster relationship',
    permissionReliedOn: null,
    targetType: 'workspace_roster_relationship',
    targetId: TARGET_ID,
    changesRedacted: false,
    createdAt: '2026-09-10T12:00:00.000Z',
    ...overrides,
  }
}

const DEFAULT_FILTERS: WorkspaceActivityFilters = {
  query: '',
  category: 'all',
  person: '',
  dateWindow: 'all',
  detail: 'all',
}

describe('workspace activity presentation', () => {
  it('categorizes the stable action families', () => {
    expect(workspaceActivityCategory('workspace.invitation.issued')).toBe('membership')
    expect(workspaceActivityCategory('workspace.evidence.confirmed')).toBe('roster')
    expect(workspaceActivityCategory('workspace.grant.revoked')).toBe('permissions')
    expect(workspaceActivityCategory('workspace.project.attached')).toBe('projects')
    expect(workspaceActivityCategory('workspace.ownership.nominated')).toBe('ownership')
    expect(workspaceActivityCategory('workspace.created')).toBe('workspace')
  })

  it('creates only the one reviewed workspace-local target link', () => {
    expect(workspaceActivityTargetHref({ workspaceId: WORKSPACE_ID, targetType: 'workspace_roster_relationship', targetId: TARGET_ID }))
      .toBe(`/w/${WORKSPACE_ID}/roster?relationship=${TARGET_ID}`)
    expect(workspaceActivityTargetHref({ workspaceId: WORKSPACE_ID, targetType: 'vault_project', targetId: TARGET_ID })).toBeNull()
    expect(workspaceActivityTargetHref({ workspaceId: WORKSPACE_ID, targetType: 'workspace_roster_relationship', targetId: null })).toBeNull()
  })

  it('provides neutral target labels without inventing an authorization state', () => {
    expect(workspaceActivityTargetLabel('workspace_grant')).toBe('Project permission')
    expect(workspaceActivityTargetLabel('future_object')).toBe('future object')
  })

  it('filters the loaded page by query, category, person, date, and protected state', () => {
    const rows = [
      event(),
      event({
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        action: 'workspace.project.attached',
        actionLabel: 'Attached a project to the workspace',
        subjectMemberId: null,
        subjectDisplayName: null,
        changesRedacted: true,
        createdAt: '2026-07-01T12:00:00.000Z',
      }),
    ]

    expect(filterWorkspaceActivityRows(rows, { ...DEFAULT_FILTERS, query: 'Jordan' }, NOW)).toHaveLength(1)
    expect(filterWorkspaceActivityRows(rows, { ...DEFAULT_FILTERS, category: 'projects' }, NOW)).toHaveLength(1)
    expect(filterWorkspaceActivityRows(rows, { ...DEFAULT_FILTERS, person: SUBJECT_ID }, NOW)).toHaveLength(1)
    expect(filterWorkspaceActivityRows(rows, { ...DEFAULT_FILTERS, dateWindow: '7d' }, NOW)).toHaveLength(1)
    expect(filterWorkspaceActivityRows(rows, { ...DEFAULT_FILTERS, detail: 'protected' }, NOW)).toHaveLength(1)
  })

  it('exports only approved display fields and escapes spreadsheet cells', () => {
    const csv = workspaceActivityCsv([event({ actorDisplayName: '=IMPORTXML("bad")' })])
    expect(csv).toContain('"\'=IMPORTXML(""bad"")"')
    expect(csv).toContain('"Roster relationship"')
    expect(csv).not.toContain(ACTOR_ID)
    expect(csv).not.toContain(TARGET_ID)
    expect(csv).not.toContain('changes')
  })
})
