import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Local preview: skip auth so the seeded Sound Vault renders without a session.
  if (process.env.NEXT_PUBLIC_VAULT_DEMO === 'true') return res

  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  // Route groups like (artist) are NOT part of the URL, so match real path prefixes.
  const { pathname } = req.nextUrl
  // /forgot-password is a public auth route: a fully signed-in user has no reason
  // to be there, so it bounces to /vault like signin/signup. /update-password is
  // deliberately NOT listed here — during a password recovery the user holds a
  // temporary session, and treating it as an auth route would bounce them off
  // the page before they can set a new password. It also stays out of isProtected
  // so the recovery landing is always reachable.
  const isAuthRoute =
    pathname.startsWith('/signin') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot-password')
  const isProtected =
    pathname.startsWith('/vault') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/collaborators') ||
    pathname.startsWith('/split-sheets') ||
    pathname.startsWith('/launchpad') ||
    pathname.startsWith('/admin')
  // Note: /approve and /join are intentionally public — collaborators access
  // approval and invite pages without a Funūn account (D-15, D-08).

  if (isProtected && !session) {
    const url = new URL('/signin', req.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/vault', req.url))
  }

  // Phase 4: fire the claim completion for users whose collaborator rows
  // have not yet been linked. Short-circuits via the claimed_at sentinel
  // once claim has been confirmed — avoids repeated DB work on hot path (D-02).
  if (session && !isAuthRoute) {
    const { data: ap } = await supabase
      .from('artist_profiles')
      .select('claimed_at')
      .eq('id', session.user.id)
      .maybeSingle()

    if (ap && ap.claimed_at === null) {
      // Fire-and-forget — non-blocking; retries on next navigation if it fails.
      // Cookie header is forwarded so the API route can re-validate the session
      // server-side. User id is never passed in a custom header (T-04-01).
      fetch(`${req.nextUrl.origin}/api/claim-collaborators`, {
        method: 'POST',
        headers: { cookie: req.headers.get('cookie') ?? '' },
      }).catch(() => {
        // Non-blocking — will retry on next navigation
      })
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
