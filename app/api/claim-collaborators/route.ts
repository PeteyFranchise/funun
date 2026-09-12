import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { completeSignupClaim } from '@/lib/invites/completeSignupClaim'

// ─── POST /api/claim-collaborators ───────────────────────────────
// Middleware-triggered compatibility route for post-verification invitation
// redemption. The database refuses unconfirmed users and requires the exact
// capability captured at signup before linking any collaborator rows.
//
// Security contract (T-04-01, T-04-02):
// - User id/email are derived only from the validated session via
//   createApiClient().auth.getUser() — never from the request body or
//   a custom header.
// - The cross-user DB write runs inside a SECURITY DEFINER function via
//   the service-role client — never from a user-session client directly.
export async function POST(request: Request) {
  // Step 1: validate session — reject if no authenticated user
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const inviteToken =
    typeof raw.inviteToken === 'string' && /^[a-f0-9]{64}$/i.test(raw.inviteToken)
      ? raw.inviteToken
      : undefined

  // Step 2: run the verified, token-bound redemption via service role.
  const service = createServiceClient()
  const result = await completeSignupClaim(service, user.id, inviteToken)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Unable to complete invitation claim.' },
      { status: 500 }
    )
  }

  if (!result.completed) {
    return NextResponse.json(
      { error: 'Email verification is required before claiming this invitation.' },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
