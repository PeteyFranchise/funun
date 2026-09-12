import { readFileSync } from 'fs'
import path from 'path'

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('authentication lifecycle hardening', () => {
  it('never renders raw provider messages in public auth pages', () => {
    const pages = [
      'app/(auth)/signin/page.tsx',
      'app/(auth)/signup/page.tsx',
      'app/(auth)/forgot-password/page.tsx',
      'app/(auth)/update-password/page.tsx',
    ]

    for (const page of pages) {
      const contents = source(page)
      expect(contents).not.toMatch(/set(?:SignUp)?Error\([^\n]*\.message\)/)
      expect(contents).toContain('publicAuthError')
    }
  })

  it('validates the recovery user and enforces the eight-character floor', () => {
    const updatePassword = source('app/(auth)/update-password/page.tsx')

    expect(updatePassword).toContain('supabase.auth.getUser()')
    expect(updatePassword).not.toContain('supabase.auth.getSession()')
    expect(updatePassword).toContain('password.length < 8')
    expect(updatePassword).toContain('minLength={8}')
  })

  it('fails callback exchange and invitation claim with local-session cleanup', () => {
    const callback = source('app/auth/callback/route.ts')

    expect(callback).toContain('!result.data.user')
    expect(callback).toContain("supabase.auth.signOut({ scope: 'local' })")
    expect(callback).toContain("signin?error=invite-claim")
  })
})
