import {
  PROJECT_ROLE_VALUES,
  canViewProject,
  canEditProject,
  canManageGuests,
  canDeleteProject,
} from '@/lib/vault/membership'

// ─── The capability matrix, 21-SPEC.md ② ─────────────────────────────
// | Role     | View | Edit project | Manage guest list | Delete project |
// |----------|:---:|:---:|:---:|:---:|
// | owner    | ✓ | ✓ | ✓ | ✓ |
// | co-owner | ✓ | ✓ | ✓ | ✗ |
// | editor   | ✓ | ✓ | ✗ | ✗ |
// | viewer   | ✓ | ✗ | ✗ | ✗ |

describe('lib/vault/membership', () => {
  it('PROJECT_ROLE_VALUES resolves to exactly the four roles', () => {
    expect(PROJECT_ROLE_VALUES).toEqual(['owner', 'co-owner', 'editor', 'viewer'])
  })

  it('canViewProject is true for all four roles', () => {
    for (const role of PROJECT_ROLE_VALUES) {
      expect(canViewProject(role)).toBe(true)
    }
  })

  it('canEditProject is true for owner, co-owner, editor; false for viewer', () => {
    expect(canEditProject('owner')).toBe(true)
    expect(canEditProject('co-owner')).toBe(true)
    expect(canEditProject('editor')).toBe(true)
    expect(canEditProject('viewer')).toBe(false)
  })

  it('canManageGuests is true for owner, co-owner; false for editor, viewer', () => {
    expect(canManageGuests('owner')).toBe(true)
    expect(canManageGuests('co-owner')).toBe(true)
    expect(canManageGuests('editor')).toBe(false)
    expect(canManageGuests('viewer')).toBe(false)
  })

  it('canDeleteProject is true for owner only', () => {
    expect(canDeleteProject('owner')).toBe(true)
    expect(canDeleteProject('co-owner')).toBe(false)
    expect(canDeleteProject('editor')).toBe(false)
    expect(canDeleteProject('viewer')).toBe(false)
  })

  it('degrades to false from every predicate for an unrecognized role string, never throws', () => {
    const bogus = 'superadmin' as unknown as (typeof PROJECT_ROLE_VALUES)[number]
    expect(() => canViewProject(bogus)).not.toThrow()
    expect(canViewProject(bogus)).toBe(false)
    expect(canEditProject(bogus)).toBe(false)
    expect(canManageGuests(bogus)).toBe(false)
    expect(canDeleteProject(bogus)).toBe(false)
  })
})
