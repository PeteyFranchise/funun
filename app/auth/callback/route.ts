import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { completeSignupClaim } from '@/lib/invites/completeSignupClaim'
import { createAuthCorrelationId } from '@/lib/auth/diagnostics'
import { recordAuthDiagnosticEvent } from '@/lib/auth/diagnostic-store'

type CallbackFailureCode =
  | 'callback_client_failed'
  | 'callback_exchange_failed'
  | 'recovery_verify_failed'
  | 'invitation_claim_failed'

const CALLBACK_INVITE_CLAIM_PATH = '/signin?error=invite-claim'

async function callbackFailureRedirect({
  origin,
  isRecovery,
  eventCode,
}: {
  origin: string
  isRecovery: boolean
  eventCode: CallbackFailureCode
}) {
  const correlationId = createAuthCorrelationId()
  try {
    await recordAuthDiagnosticEvent(createServiceClient(), {
      correlationId,
      eventCode,
      surface: 'auth_callback',
      workspaceIntent: null,
      runtime: 'server',
    })
  } catch {
    // Diagnostics are a side channel. An unavailable store must never replace
    // the stable recovery path for an already-failing authentication request.
  }

  const location = isRecovery
    ? `${origin}/forgot-password?error=recovery&ref=${correlationId}`
    : eventCode === 'invitation_claim_failed'
      ? `${origin}${CALLBACK_INVITE_CLAIM_PATH}&ref=${correlationId}`
      : `${origin}/signin?error=auth&ref=${correlationId}`
  return NextResponse.redirect(location)
}

// GET /auth/callback — exchanges the email-confirmation / password-recovery /
// magic-link code for a session, then redirects into the app. Supabase appends
// ?code=... to the redirect URL configured as emailRedirectTo (signup) or the
// resetPasswordForEmail redirectTo (recovery, next=/update-password).
//
// The success redirect is resolved via postSignInPath({ user, next }) — NOT a
// bare '/vault' fallback — so a buyer completing a recovery link lands on
// /sync/catalog instead of the artist Sound Vault (23-05 Pitfall 2). The raw
// (possibly absent) next param is passed through unmodified: postSignInPath's
// own safeNext() guard already honours an explicit same-origin next (e.g. the
// recovery flow's next=/update-password) before falling back to role-based
// routing, so this route must not pre-default next to '/vault' itself — doing
// so would make every buyer/staff callback resolve to '/vault' via the
// explicit-next branch and defeat the role-aware fallback entirely.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next')
  const isRecovery = rawNext === '/update-password'

  // A missing or unexchangeable code means an expired/invalid link — do NOT fall
  // through to /vault with no session (that silently drops the user on a
  // protected page they'll just get bounced off). Route them somewhere they can
  // recover instead: back to the reset flow for recovery links, or signin.
  if (!code) {
    return callbackFailureRedirect({
      origin,
      isRecovery,
      eventCode: isRecovery ? 'recovery_verify_failed' : 'callback_exchange_failed',
    })
  }

  let supabase: Awaited<ReturnType<typeof createApiClient>>
  try {
    supabase = await createApiClient()
  } catch {
    return callbackFailureRedirect({ origin, isRecovery, eventCode: 'callback_client_failed' })
  }

  async function clearCallbackSession() {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // The callback is already failing closed. Do not replace the stable
      // recovery path with an infrastructure error if cleanup also fails.
    }
  }

  let user: User
  try {
    const result = await supabase.auth.exchangeCodeForSession(code)
    if (result.error || !result.data.user) {
      await clearCallbackSession()
      return callbackFailureRedirect({
        origin,
        isRecovery,
        eventCode: isRecovery ? 'recovery_verify_failed' : 'callback_exchange_failed',
      })
    }
    user = result.data.user
  } catch {
    await clearCallbackSession()
    return callbackFailureRedirect({
      origin,
      isRecovery,
      eventCode: isRecovery ? 'recovery_verify_failed' : 'callback_exchange_failed',
    })
  }

  // A confirmation callback is the earliest safe place to attach existing
  // invitation/collaborator identity. The RPC independently requires the
  // verified auth.users record and exact signup capability; recovery and
  // ordinary magic-link callbacks simply return completed=false.
  if (!isRecovery) {
    try {
      const claim = await completeSignupClaim(createServiceClient(), user.id)
      if (!claim.ok) {
        await clearCallbackSession()
        return callbackFailureRedirect({
          origin,
          isRecovery: false,
          eventCode: 'invitation_claim_failed',
        })
      }
    } catch {
      await clearCallbackSession()
      return callbackFailureRedirect({
        origin,
        isRecovery: false,
        eventCode: 'invitation_claim_failed',
      })
    }
  }

  const destination = postSignInPath({ user, next: rawNext })
  return NextResponse.redirect(`${origin}${destination}`)
}
