import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffRoles } from '@/lib/admin/staff-role'

export const MEMBER_ACCOUNT_REQUIRED =
  'This action requires a Member account. Sign in with your personal Member account.'

type AuthAccount = {
  id: string
  app_metadata?: unknown
}

export type MemberApiGateResult =
  | { ok: true; user: AuthAccount }
  | { ok: false; status: 401 | 403 | 500; error: string }

/**
 * Enforces the Member-workspace boundary for API routes.
 *
 * Page redirects are only presentation-level protection: a stale tab or a
 * direct request can still reach an API route. Staff identities therefore
 * fail first and fail closed, even if legacy data also gave one a profile.
 * Non-staff identities must then prove the canonical `user_profiles` row
 * that establishes a full Funūn Member account.
 */
export async function requireMemberApiAccount(
  supabase: SupabaseClient,
  user: AuthAccount | null
): Promise<MemberApiGateResult> {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  if (getStaffRoles(user).length > 0) {
    return { ok: false, status: 403, error: MEMBER_ACCOUNT_REQUIRED }
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not verify Member account' }
  }
  if (!profile) {
    return { ok: false, status: 403, error: MEMBER_ACCOUNT_REQUIRED }
  }

  return { ok: true, user }
}
