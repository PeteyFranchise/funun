import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { postSignInPath } from '@/lib/auth/postSignInPath'

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

  const supabase = await createApiClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(failureRedirect)
  }

  const destination = postSignInPath({ user: data.user, next: rawNext })
  return NextResponse.redirect(`${origin}${destination}`)
}
