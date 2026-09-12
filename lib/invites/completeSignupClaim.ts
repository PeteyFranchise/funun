import type { SupabaseClient } from '@supabase/supabase-js'

export type CompleteSignupClaimResult =
  | { ok: true; completed: boolean }
  | { ok: false; error: 'claim_failed' }

/**
 * Completes the database-owned post-verification invitation claim.
 * The RPC re-reads auth.users and the invitation capability; caller-supplied
 * email or collaborator identifiers are never trusted.
 */
export async function completeSignupClaim(
  service: SupabaseClient,
  userId: string,
  inviteToken?: string
): Promise<CompleteSignupClaimResult> {
  const { data, error } = await service.rpc('complete_verified_signup_claim', {
    p_user_id: userId,
    p_invite_token: inviteToken ?? null,
  })

  if (error) return { ok: false, error: 'claim_failed' }
  return { ok: true, completed: data === true }
}
