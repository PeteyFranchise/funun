import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// GET /auth/callback — exchanges the email-confirmation / password-recovery /
// magic-link code for a session, then redirects into the app. Supabase appends
// ?code=... to the redirect URL configured as emailRedirectTo (signup) or the
// resetPasswordForEmail redirectTo (recovery, next=/update-password).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/vault'
  const isRecovery = next === '/update-password'

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

  const supabase = createApiClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(failureRedirect)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
