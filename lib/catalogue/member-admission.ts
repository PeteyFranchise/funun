export type WorkMemberAdmission =
  | { kind: 'direct'; userId: string }
  | { kind: 'invite-required'; userId: null }

/**
 * `claimed_by` is the roster's verified Funūn-account link. A claimed person
 * gets room access directly; only an unclaimed roster row needs a signup
 * invitation.
 */
export function planWorkMemberAdmission(claimedBy: string | null): WorkMemberAdmission {
  return claimedBy
    ? { kind: 'direct', userId: claimedBy }
    : { kind: 'invite-required', userId: null }
}
