import { readFileSync } from 'fs'
import path from 'path'

describe('middleware auth validation', () => {
  it('validates protected routes with getUser rather than trusting getSession', () => {
    const source = readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')

    expect(source).toContain('supabase.auth.getUser()')
    expect(source).not.toContain('supabase.auth.getSession()')
  })

  it('always lets signin replace an existing or stale browser session', () => {
    const source = readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')

    expect(source).toContain("isAuthRoute && user && !pathname.startsWith('/signin')")
    expect(source).not.toContain('isAccountTransitionSignIn')
  })

  it('authenticates admin APIs in middleware before route body parsing', () => {
    const source = readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')

    expect(source).toContain("pathname.startsWith('/api/admin/')")
    expect(source).toContain("'/api/admin/:path*'")
    expect(source.indexOf("pathname.startsWith('/api/admin/')")).toBeGreaterThan(
      source.indexOf('supabase.auth.getUser()')
    )
  })
})
