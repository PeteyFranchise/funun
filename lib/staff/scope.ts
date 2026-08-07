// ─── Assignment-scope predicate (D-03) ─────────────────────────────────────
// Pure, fail-closed, zero-I/O — mirrors lib/buyers/permissions.ts's
// convention exactly: takes an already-fetched row, no Supabase client, no
// throw. The I/O route-layer check (fetching the org row) is written inline
// in the route where it's needed (25-05), not here.

type OrgAssignmentRow = { ae_user_id: string | null }

/**
 * True only when the given org row is assigned to staffUserId. A missing
 * org row, a null ae_user_id, or an empty caller id all resolve to the
 * least privilege (false), never throw.
 */
export function isAssignedToOrg(
  org: Pick<OrgAssignmentRow, 'ae_user_id'> | null | undefined,
  staffUserId: string
): boolean {
  if (!staffUserId) return false
  return org?.ae_user_id === staffUserId
}
