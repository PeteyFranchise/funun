import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  const isArtistRoute   = req.nextUrl.pathname.startsWith('/(artist)')
  const isIndustryRoute = req.nextUrl.pathname.startsWith('/(industry)')
  const isAuthRoute     = req.nextUrl.pathname.startsWith('/(auth)')
  const isProtected     = isArtistRoute || isIndustryRoute ||
                          req.nextUrl.pathname.startsWith('/dashboard') ||
                          req.nextUrl.pathname.startsWith('/releases') ||
                          req.nextUrl.pathname.startsWith('/settings')

  if (isProtected && !session) {
    const url = new URL('/signin', req.url)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
