import {
  hasApproverRole,
  canSubmitRequest,
  canApproveTerms,
  canManageMembers,
  isOrgMember,
} from '@/lib/buyers/permissions'
import type { BuyerMember } from '@/lib/buyers/schema'

// ─── Fixtures ────────────────────────────────────────────────────────────
const requester: Pick<BuyerMember, 'buyer_role' | 'is_org_admin'> = {
  buyer_role: 'requester',
  is_org_admin: false,
}

const approver: Pick<BuyerMember, 'buyer_role' | 'is_org_admin'> = {
  buyer_role: 'approver',
  is_org_admin: false,
}

const orgAdmin: Pick<BuyerMember, 'buyer_role' | 'is_org_admin'> = {
  buyer_role: 'approver',
  is_org_admin: true,
}

describe('lib/buyers/permissions', () => {
  it('hasApproverRole is true for approver, false for requester', () => {
    expect(hasApproverRole(approver)).toBe(true)
    expect(hasApproverRole(requester)).toBe(false)
  })

  it('canSubmitRequest is true for BOTH requester and approver (D-14a)', () => {
    expect(canSubmitRequest(requester)).toBe(true)
    expect(canSubmitRequest(approver)).toBe(true)
  })

  it('canApproveTerms is true only for approver (D-13)', () => {
    expect(canApproveTerms(approver)).toBe(true)
    expect(canApproveTerms(requester)).toBe(false)
  })

  it('canManageMembers is true only when is_org_admin is true', () => {
    expect(canManageMembers(orgAdmin)).toBe(true)
    expect(canManageMembers(approver)).toBe(false)
    expect(canManageMembers(requester)).toBe(false)
  })

  it('isOrgMember is true only when a matching (org_id,user_id) row exists', () => {
    const members: Pick<BuyerMember, 'org_id' | 'user_id'>[] = [
      { org_id: 'org-1', user_id: 'user-1' },
      { org_id: 'org-2', user_id: 'user-2' },
    ]
    expect(isOrgMember(members, 'user-1', 'org-1')).toBe(true)
    expect(isOrgMember(members, 'user-1', 'org-2')).toBe(false)
    expect(isOrgMember(members, 'user-3', 'org-1')).toBe(false)
    expect(isOrgMember([], 'user-1', 'org-1')).toBe(false)
  })

  it('degrades to false from every predicate given no membership row, never throws (fail-closed)', () => {
    expect(() => hasApproverRole(null)).not.toThrow()
    expect(hasApproverRole(null)).toBe(false)
    expect(hasApproverRole(undefined)).toBe(false)
    expect(canSubmitRequest(null)).toBe(false)
    expect(canSubmitRequest(undefined)).toBe(false)
    expect(canApproveTerms(null)).toBe(false)
    expect(canApproveTerms(undefined)).toBe(false)
    expect(canManageMembers(null)).toBe(false)
    expect(canManageMembers(undefined)).toBe(false)
  })

  it('degrades to false for an unrecognized buyer_role string, never throws', () => {
    const bogus = { buyer_role: 'superadmin' as unknown as BuyerMember['buyer_role'], is_org_admin: false }
    expect(() => canSubmitRequest(bogus)).not.toThrow()
    expect(canSubmitRequest(bogus)).toBe(false)
    expect(canApproveTerms(bogus)).toBe(false)
    expect(hasApproverRole(bogus)).toBe(false)
  })
})
