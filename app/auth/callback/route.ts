import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

// GET /auth/callback — exchanges the email-confirmation / magic-link code for a
// session, then redirects into the app. Supabase appends ?code=... to the
// redirect URL configured as emailRedirectTo.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/vault'

  if (code) {
    const supabase = createApiClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
