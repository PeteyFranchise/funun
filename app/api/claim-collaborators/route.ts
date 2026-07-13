import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

// ─── POST /api/claim-collaborators ───────────────────────────────
// Middleware-triggered route that links collaborator rows to a newly
// signed-up user via their auth email. Called fire-and-forget on the
// first authenticated request when artist_profiles.claimed_at IS NULL.
//
// Security contract (T-04-01, T-04-02):
// - User id/email are derived only from the validated session via
//   createApiClient().auth.getUser() — never from the request body or
//   a custom header.
// - The cross-user DB write runs inside a SECURITY DEFINER function via
//   the service-role client — never from a user-session client directly.
export async function POST() {
  // Step 1: validate session — reject if no authenticated user
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Step 2: run the claim RPC via service role (bypasses RLS for cross-user write)
  const service = createServiceClient()
  const { error: claimError } = await service.rpc('claim_collaborators', {
    p_user_id: user.id,
    p_email: user.email ?? '',
  })
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })

  // Step 3: set claimed_at sentinel so middleware stops firing (D-02)
  await service
    .from('artist_profiles')
    .update({ claimed_at: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
