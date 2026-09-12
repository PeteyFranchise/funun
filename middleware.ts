import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CLAIM_ORIGIN_HOSTS = new Set(['funun.studio', 'www.funun.studio'])

function trustedClaimEndpoint(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) return null

  try {
    const base = new URL(configured)
    if (base.protocol !== 'https:' || !CLAIM_ORIGIN_HOSTS.has(base.hostname)) return null
    return new URL('/api/claim-collaborators', base).toString()
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  // Per-request nonce: Next reads the CSP from the forwarded request headers
  // and applies this nonce to its framework/runtime scripts. Keeping CSP here
  // (instead of a static next.config header) lets script-src avoid
  // `unsafe-inline`, which materially limits the impact of injected markup.
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.stripe.com",
    "frame-src https://js.stripe.com https://*.docuseal.com",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ')
  const createPassThroughResponse = () => {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('Content-Security-Policy', csp)
    return response
  }

  let res = createPassThroughResponse()

  const respondWithAuthState = (response: NextResponse) => {
    res.cookies.getAll().forEach(cookie => response.cookies.set(cookie))
    for (const header of ['cache-control', 'expires', 'pragma']) {
      const value = res.headers.get(header)
      if (value) response.headers.set(header, value)
    }
    response.headers.set('Content-Security-Policy', csp)
    return response
  }

  // Local preview: skip auth so the seeded Sound Vault renders without a session.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
  ) return res

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          // Update the forwarded request first so Server Components see the
          // refreshed session during this same request.
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = createPassThroughResponse()

          // Then update the browser response so its next request carries the
          // same refreshed session. Supabase's no-cache headers are mandatory
          // whenever auth cookies change behind a CDN.
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options)
          })
          Object.entries(headers).forEach(([name, value]) => {
            res.headers.set(name, value)
          })
        },
      },
    }
  )
  // Use getUser() rather than getSession(): getSession() can reflect a stale
  // client cookie, while server pages/routes validate with getUser(). Keeping
  // middleware on the same contract prevents deleted/expired users from
  // entering protected pages with auth.getUser() resolving to null.
  const { data: { user } } = await supabase.auth.getUser()

  // Route groups like (artist) are NOT part of the URL, so match real path prefixes.
  const { pathname } = req.nextUrl

  // API handlers still perform their own role/object authorization. This
  // coarse boundary exists so every admin request proves authentication in
  // middleware before an individual route can allocate or parse its body.
  // It closes the shared parse-before-auth resource-exhaustion class without
  // making room-scoped routes parse a body merely to discover which room gate
  // to invoke.
  if (pathname.startsWith('/api/admin/')) {
    if (!user) {
      return respondWithAuthState(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }
    return res
  }
  // /forgot-password is a public auth route: a fully signed-in user has no reason
  // to be there, so it bounces to /vault like signup. /signin deliberately stays
  // reachable even when a cookie contains an existing session: entering credentials
  // there is an explicit request to replace that browser identity, and blocking the
  // form trapped Members in a stale or Team session (260911 sign-in outage).
  // /update-password is
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

  if (isProtected && !user) {
    const url = new URL('/signin', req.url)
    url.searchParams.set('next', pathname)
    return respondWithAuthState(NextResponse.redirect(url))
  }

  // Signup and password-reset entry remain unnecessary for a current session.
  // Signin is excluded because it is also the safe account-replacement surface.
  if (isAuthRoute && user && !pathname.startsWith('/signin')) {
    return respondWithAuthState(NextResponse.redirect(new URL('/vault', req.url)))
  }

  // Phase 4: fire the claim completion for users whose collaborator rows
  // have not yet been linked. Short-circuits via the claimed_at sentinel
  // once claim has been confirmed — avoids repeated DB work on hot path (D-02).
  if (user && !isAuthRoute) {
    const { data: ap } = await supabase
      .from('user_profiles')
      .select('claimed_at')
      .eq('id', user.id)
      .maybeSingle()

    if (ap && ap.claimed_at === null) {
      // Fire-and-forget — non-blocking; retries on next navigation if it fails.
      // Cookie header is forwarded so the API route can re-validate the session
      // server-side. User id is never passed in a custom header (T-04-01).
      const claimEndpoint = trustedClaimEndpoint()
      if (claimEndpoint) {
        fetch(claimEndpoint, {
          method: 'POST',
          headers: { cookie: req.headers.get('cookie') ?? '' },
        }).catch(() => {
          // Non-blocking — will retry on next navigation
        })
      }
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
    '/api/admin/:path*',
  ],
}
