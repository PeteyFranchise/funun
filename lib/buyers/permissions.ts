import type { BuyerMember } from './schema'

// ─── Pure permission predicates (D-13/D-14a) ──────────────────────────────
// Every predicate here is a pure function over an already-fetched row (or
// list of rows) — no Supabase client, no I/O — so it is unit-testable
// without a DB (mirrors lib/capabilities/check.ts / lib/vault/membership.ts
// style). Every predicate fails CLOSED: a missing/null/undefined membership
// row, or an unrecognized buyer_role string, resolves to the least
// privilege (false), never throws.

/** True only when the member's tier is 'approver'. */
export function hasApproverRole(
  member: Pick<BuyerMember, 'buyer_role'> | null | undefined
): boolean {
  return member?.buyer_role === 'approver'
}

/**
 * True for BOTH requester and approver (D-14a): default verified-buyer
 * reach is browse + submit for both tiers — a requester-tier account must
 * NOT be blocked from creating requests (RESEARCH Pitfall 8).
 */
export function canSubmitRequest(
  member: Pick<BuyerMember, 'buyer_role'> | null | undefined
): boolean {
  return member?.buyer_role === 'requester' || member?.buyer_role === 'approver'
}

/** True only for approver — terms/budget approval + sign-off is approver-gated (D-13). */
export function canApproveTerms(
  member: Pick<BuyerMember, 'buyer_role'> | null | undefined
): boolean {
  return hasApproverRole(member)
}

/** True only when the member is flagged as an org admin. */
export function canManageMembers(
  member: Pick<BuyerMember, 'is_org_admin'> | null | undefined
): boolean {
  return member?.is_org_admin === true
}

/** True only when a matching (org_id, user_id) row exists in the given member list. */
export function isOrgMember(
  members: Pick<BuyerMember, 'org_id' | 'user_id'>[],
  userId: string,
  orgId: string
): boolean {
  return members.some((m) => m.org_id === orgId && m.user_id === userId)
}
