import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { completeSignupClaim } from '@/lib/invites/completeSignupClaim'

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
  const failureRedirect = isRecovery
    ? `${origin}/forgot-password?error=recovery`
    : `${origin}/signin?error=auth`

  if (!code) {
    return NextResponse.redirect(failureRedirect)
  }

  let supabase: Awaited<ReturnType<typeof createApiClient>>
  try {
    supabase = await createApiClient()
  } catch {
    return NextResponse.redirect(failureRedirect)
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
      return NextResponse.redirect(failureRedirect)
    }
    user = result.data.user
  } catch {
    await clearCallbackSession()
    return NextResponse.redirect(failureRedirect)
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
        return NextResponse.redirect(`${origin}/signin?error=invite-claim`)
      }
    } catch {
      await clearCallbackSession()
      return NextResponse.redirect(`${origin}/signin?error=invite-claim`)
    }
  }

  const destination = postSignInPath({ user, next: rawNext })
  return NextResponse.redirect(`${origin}${destination}`)
}
