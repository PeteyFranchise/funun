import { readFileSync } from 'fs'
import path from 'path'

describe('middleware auth validation', () => {
  it('validates protected routes with getUser rather than trusting getSession', () => {
    const source = readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')

    expect(source).toContain('supabase.auth.getUser()')
    expect(source).not.toContain('supabase.auth.getSession()')
  })
})
