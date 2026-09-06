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
