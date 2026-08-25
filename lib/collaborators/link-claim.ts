import type { SupabaseClient } from '@supabase/supabase-js'
import { exactCaseInsensitiveEmailPattern } from '@/lib/invites/allowlist'

// ─── linkClaimedCollaborators — the accept-time twin of claim_collaborators ─
// 260825-m2k: when a collaborator connection request is accepted, the
// accepting member should end up linked to the inviting artist's roster row
// for their email — the same end state claim_collaborators() (migration
// 051, SECURITY DEFINER) produces at signup time. This is deliberately a
// second, narrower code path rather than a call into that RPC:
//
//   claim_collaborators(p_user_id, p_email) links EVERY unclaimed roster row
//   across EVERY artist whose collaborator email matches p_email, on email
//   possession alone (whoever controls that inbox at signup time).
//
//   linkClaimedCollaborators here is scoped by ownerUserId AND the exact
//   email AND claimed_by IS NULL: it links only ONE artist's row, and only
//   because that ONE artist sent a connection request and that ONE member
//   explicitly accepted it. That is strictly narrower than the signup-time
//   claim, so a guarded service-client UPDATE (mirroring the pattern
//   app/api/curators/claim/[token]/route.ts already uses for its own
//   `.is('claimed_by', null)` idempotent-guard update) is the right shape
//   here, not a new SECURITY DEFINER function reaching across every artist's
//   rows for a single accept.
//
// Never throws — a failed update (bad connection, RLS surprise, etc.)
// resolves to 0 linked rows. Called from the accept-side of PATCH
// /api/connections under the same non-fatal try/catch posture as the
// connection_accepted notification: the connection transition itself must
// never be rolled back by a link failure.

export async function linkClaimedCollaborators(
  service: SupabaseClient,
  input: { ownerUserId: string; memberUserId: string; memberEmail: string }
): Promise<number> {
  const { ownerUserId, memberUserId, memberEmail } = input
  const trimmedEmail = (memberEmail ?? '').trim()
  if (!trimmedEmail) return 0

  try {
    const pattern = exactCaseInsensitiveEmailPattern(trimmedEmail)
    const { data, error } = await service
      .from('collaborators')
      .update({ claimed_by: memberUserId })
      .eq('user_id', ownerUserId)
      .ilike('email', pattern)
      .is('claimed_by', null)
      .select('id')

    if (error) return 0
    return Array.isArray(data) ? data.length : 0
  } catch {
    return 0
  }
}
