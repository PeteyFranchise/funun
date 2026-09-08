import { WORKSPACE_MEMBERSHIP_STATE_VALUES, WORKSPACE_ROLE_VALUES } from '@/lib/workspaces/types'
import {
  LEGAL_MEMBERSHIP_EDGES,
  isLegalMembershipTransition,
  canManageWorkspaceMembers,
  canManageRoster,
  canConfigureWorkspace,
  isTimeBoxedRole,
  assertOwnerFloorHolds,
  canRemoveMember,
  WORKSPACE_OWNER_FLOOR_MESSAGE,
  canManageOwners,
  canReachWorkspaceProjects,
  WORKSPACE_PROJECT_ACCESS_ROLES,
  WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE,
} from '@/lib/workspaces/membership'

// ─── Membership transition matrix (D-11) ───────────────────────────────────
describe('lib/workspaces/membership transition matrix', () => {
  it('has a LEGAL_MEMBERSHIP_EDGES key for every WORKSPACE_MEMBERSHIP_STATE_VALUES member', () => {
    for (const state of WORKSPACE_MEMBERSHIP_STATE_VALUES) {
      expect(LEGAL_MEMBERSHIP_EDGES[state]).toBeDefined()
    }
  })

  it('allows pending -> active', () => {
    expect(isLegalMembershipTransition('pending', 'active')).toBe(true)
  })

  it('refuses pending -> suspended', () => {
    expect(isLegalMembershipTransition('pending', 'suspended')).toBe(false)
  })

  it('refuses removed -> active (removed is terminal)', () => {
    expect(isLegalMembershipTransition('removed', 'active')).toBe(false)
  })

  it('refuses every same-state pair', () => {
    for (const state of WORKSPACE_MEMBERSHIP_STATE_VALUES) {
      expect(isLegalMembershipTransition(state, state)).toBe(false)
    }
  })

  it('refuses any unknown state value', () => {
    expect(
      isLegalMembershipTransition(
        'not-a-real-state' as unknown as (typeof WORKSPACE_MEMBERSHIP_STATE_VALUES)[number],
        'active'
      )
    ).toBe(false)
    expect(
      isLegalMembershipTransition(
        'active',
        'not-a-real-state' as unknown as (typeof WORKSPACE_MEMBERSHIP_STATE_VALUES)[number]
      )
    ).toBe(false)
  })

  it('allows the remaining legal edges', () => {
    expect(isLegalMembershipTransition('active', 'suspended')).toBe(true)
    expect(isLegalMembershipTransition('active', 'removed')).toBe(true)
    expect(isLegalMembershipTransition('active', 'expired')).toBe(true)
    expect(isLegalMembershipTransition('suspended', 'active')).toBe(true)
    expect(isLegalMembershipTransition('suspended', 'removed')).toBe(true)
    expect(isLegalMembershipTransition('expired', 'active')).toBe(true)
  })

  it('refuses every outbound edge from removed', () => {
    for (const state of WORKSPACE_MEMBERSHIP_STATE_VALUES) {
      if (state === 'removed') continue
      expect(isLegalMembershipTransition('removed', state)).toBe(false)
    }
  })
})

// ─── Role capability predicates (D-11) ─────────────────────────────────────
describe('lib/workspaces/membership role capability predicates', () => {
  it('canManageWorkspaceMembers is true for owner and admin only', () => {
    for (const role of WORKSPACE_ROLE_VALUES) {
      const expected = role === 'owner' || role === 'admin'
      expect(canManageWorkspaceMembers(role)).toBe(expected)
    }
  })

  it('canManageRoster is true for owner and admin only', () => {
    for (const role of WORKSPACE_ROLE_VALUES) {
      const expected = role === 'owner' || role === 'admin'
      expect(canManageRoster(role)).toBe(expected)
    }
  })

  it('canConfigureWorkspace is true for owner only', () => {
    for (const role of WORKSPACE_ROLE_VALUES) {
      expect(canConfigureWorkspace(role)).toBe(role === 'owner')
    }
  })

  it('isTimeBoxedRole is true for contractor and false for member', () => {
    expect(isTimeBoxedRole('contractor')).toBe(true)
    expect(isTimeBoxedRole('member')).toBe(false)
  })
})

// ─── Never-zero-owners (D-13) ───────────────────────────────────────────────
describe('lib/workspaces/membership assertOwnerFloorHolds (D-13)', () => {
  it('fails when remainingActiveOwners is 0, naming the never-zero-owners rule', () => {
    const result = assertOwnerFloorHolds({ remainingActiveOwners: 0 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe(WORKSPACE_OWNER_FLOOR_MESSAGE)
  })

  it('succeeds when remainingActiveOwners is 1', () => {
    expect(assertOwnerFloorHolds({ remainingActiveOwners: 1 })).toEqual({ ok: true })
  })
})

describe('lib/workspaces/membership canRemoveMember (D-13)', () => {
  it('refuses when the target is the last active owner, even for an owner actor — proving this is not a role check', () => {
    const result = canRemoveMember({
      actorRole: 'owner',
      targetRole: 'owner',
      remainingActiveOwnersAfterRemoval: 0,
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe(WORKSPACE_OWNER_FLOOR_MESSAGE)
  })

  it('allows an owner to remove a member when at least one active owner remains', () => {
    expect(
      canRemoveMember({
        actorRole: 'owner',
        targetRole: 'member',
        remainingActiveOwnersAfterRemoval: 1,
      })
    ).toEqual({ ok: true })
  })

  it('refuses a non-managing actor even when the owner floor holds', () => {
    const result = canRemoveMember({
      actorRole: 'member',
      targetRole: 'contractor',
      remainingActiveOwnersAfterRemoval: 1,
    })
    expect(result.ok).toBe(false)
  })
})

// ─── Owner-only owner management (R-05 / WSR-07) ────────────────────────────
describe('lib/workspaces/membership canManageOwners (R-05 / WSR-07)', () => {
  it('is true for owner', () => {
    expect(canManageOwners('owner')).toBe(true)
  })

  it('is false for admin — WSR-07 is exactly this refusal', () => {
    expect(canManageOwners('admin')).toBe(false)
  })

  it('is false for member, contractor and guest', () => {
    expect(canManageOwners('member')).toBe(false)
    expect(canManageOwners('contractor')).toBe(false)
    expect(canManageOwners('guest')).toBe(false)
  })

  it('is true for exactly one role across the whole WORKSPACE_ROLE_VALUES union', () => {
    const permitted = WORKSPACE_ROLE_VALUES.filter((role) => canManageOwners(role))
    expect(permitted).toEqual(['owner'])
  })

  it('disagrees with canManageWorkspaceMembers on admin — the one fact WSR-07 changes', () => {
    expect(canManageWorkspaceMembers('admin')).toBe(true)
    expect(canManageOwners('admin')).toBe(false)
    expect(canManageOwners('admin')).not.toBe(canManageWorkspaceMembers('admin'))
  })

  it('leaves canManageWorkspaceMembers exactly as it was — owner and admin, nobody else', () => {
    // Guards a future edit that "simplifies" the two predicates into one,
    // which would silently take ordinary member management from admins.
    const permitted = WORKSPACE_ROLE_VALUES.filter((role) => canManageWorkspaceMembers(role))
    expect(permitted).toEqual(['owner', 'admin'])
  })
})

// ─── Project-access role floor (R-20 / WSR-29) ──────────────────────────────
describe('lib/workspaces/membership canReachWorkspaceProjects (R-20 / WSR-29)', () => {
  it('is false for guest — a guest seat never reaches a Member project', () => {
    expect(canReachWorkspaceProjects('guest')).toBe(false)
  })

  it('is true for owner, admin, member and contractor', () => {
    expect(canReachWorkspaceProjects('owner')).toBe(true)
    expect(canReachWorkspaceProjects('admin')).toBe(true)
    expect(canReachWorkspaceProjects('member')).toBe(true)
    expect(canReachWorkspaceProjects('contractor')).toBe(true)
  })

  it('is false for exactly one role across the whole WORKSPACE_ROLE_VALUES union', () => {
    const refused = WORKSPACE_ROLE_VALUES.filter((role) => !canReachWorkspaceProjects(role))
    expect(refused).toEqual(['guest'])
  })

  it('WORKSPACE_PROJECT_ACCESS_ROLES holds four roles and does not contain guest', () => {
    expect(WORKSPACE_PROJECT_ACCESS_ROLES).toEqual(['owner', 'admin', 'member', 'contractor'])
    expect(WORKSPACE_PROJECT_ACCESS_ROLES).not.toContain('guest')
  })

  it('partitions WORKSPACE_ROLE_VALUES exactly, so a sixth role cannot silently inherit project access', () => {
    const union = new Set<string>([...WORKSPACE_PROJECT_ACCESS_ROLES, 'guest'])
    expect([...union].sort()).toEqual([...WORKSPACE_ROLE_VALUES].sort())
  })

  it('agrees with WORKSPACE_PROJECT_ACCESS_ROLES for every role in the union', () => {
    for (const role of WORKSPACE_ROLE_VALUES) {
      expect(canReachWorkspaceProjects(role)).toBe(WORKSPACE_PROJECT_ACCESS_ROLES.includes(role))
    }
  })

  it('exports a non-empty refusal sentence distinct from the owner-floor message', () => {
    expect(typeof WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE).toBe('string')
    expect(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE.length).toBeGreaterThan(0)
    expect(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE).not.toBe(WORKSPACE_OWNER_FLOOR_MESSAGE)
  })

  it('stays a standalone predicate, so the floor is composable at project routes rather than baked into the workspace gate', () => {
    // A guest is still an active workspace member. Nothing here changes the
    // workspace-level predicates, which is what keeps chrome reachable.
    expect(canReachWorkspaceProjects('guest')).toBe(false)
    expect(canManageOwners('guest')).toBe(false)
    expect(canManageWorkspaceMembers('guest')).toBe(false)
  })
})
