import {
  buildWorkspaceSwitcherOptions,
  isWorkspaceId,
  type WorkspaceMembershipOptionRow,
  type WorkspaceOptionRow,
} from '@/lib/workspaces/active-context'
import { workspaceHomeHref, workspaceRoleLabel } from '@/lib/workspaces/navigation'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const NOW = Date.parse('2026-09-12T12:00:00.000Z')

function membership(
  workspaceId: string,
  overrides: Partial<WorkspaceMembershipOptionRow> = {}
): WorkspaceMembershipOptionRow {
  return {
    workspace_id: workspaceId,
    role: 'member',
    status: 'active',
    expires_at: null,
    ...overrides,
  }
}

function workspace(
  id: string,
  name: string,
  overrides: Partial<WorkspaceOptionRow> = {}
): WorkspaceOptionRow {
  return {
    id,
    name,
    workspace_type: 'management',
    roster_enabled: true,
    catalogue_enabled: false,
    ...overrides,
  }
}

describe('active workspace paths', () => {
  it('accepts canonical UUID workspace ids and rejects arbitrary path input', () => {
    expect(isWorkspaceId(A)).toBe(true)
    expect(isWorkspaceId('not-a-workspace')).toBe(false)
    expect(isWorkspaceId('../vault')).toBe(false)
  })

  it('builds the canonical URL-carried workspace home', () => {
    expect(workspaceHomeHref(A)).toBe(`/w/${A}`)
  })

  it('uses neutral, human-readable role labels', () => {
    expect(workspaceRoleLabel('owner')).toBe('Owner')
    expect(workspaceRoleLabel('contractor')).toBe('Contractor')
  })
})

describe('buildWorkspaceSwitcherOptions', () => {
  it('joins active seats to visible workspaces, maps labels, and sorts by name', () => {
    expect(
      buildWorkspaceSwitcherOptions(
        [membership(A, { role: 'admin' }), membership(B, { role: 'owner' })],
        [
          workspace(A, 'Zulu Management'),
          workspace(B, 'Aster Records', {
            workspace_type: 'label',
            roster_enabled: false,
            catalogue_enabled: true,
          }),
        ],
        NOW
      )
    ).toEqual([
      {
        id: B,
        name: 'Aster Records',
        type: 'label',
        typeLabel: 'Label',
        role: 'owner',
        rosterEnabled: false,
        catalogueEnabled: true,
      },
      {
        id: A,
        name: 'Zulu Management',
        type: 'management',
        typeLabel: 'Management',
        role: 'admin',
        rosterEnabled: true,
        catalogueEnabled: false,
      },
    ])
  })

  it('fails closed for expired, malformed, inactive, unknown-role, and missing workspace rows', () => {
    expect(
      buildWorkspaceSwitcherOptions(
        [
          membership(A, { expires_at: '2026-09-12T11:59:59.000Z' }),
          membership(B, { status: 'suspended' }),
          membership('not-a-uuid'),
          membership('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { role: 'superadmin' }),
          membership('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        ],
        [workspace(A, 'Expired'), workspace(B, 'Suspended')],
        NOW
      )
    ).toEqual([])
  })

  it('treats an invalid expiry value as lapsed rather than permanent access', () => {
    expect(
      buildWorkspaceSwitcherOptions(
        [membership(A, { expires_at: 'not-a-date' })],
        [workspace(A, 'Unsafe')],
        NOW
      )
    ).toEqual([])
  })

  it('deduplicates seats and rejects blank names or unknown workspace types', () => {
    expect(
      buildWorkspaceSwitcherOptions(
        [membership(A), membership(A), membership(B)],
        [workspace(A, '  Northstar  '), workspace(B, ' ', { workspace_type: 'agency' })],
        NOW
      )
    ).toEqual([
      {
        id: A,
        name: 'Northstar',
        type: 'management',
        typeLabel: 'Management',
        role: 'member',
        rosterEnabled: true,
        catalogueEnabled: false,
      },
    ])
  })
})
