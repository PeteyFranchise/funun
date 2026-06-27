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
  const isAuthRoute = pathname.startsWith('/signin') || pathname.startsWith('/signup')
  const isProtected =
    pathname.startsWith('/vault') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/collaborators') ||
    pathname.startsWith('/split-sheets')
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

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
