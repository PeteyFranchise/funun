import fs from 'node:fs'
import path from 'node:path'

describe('authentication route rendering', () => {
  it('keeps the auth route group dynamic so middleware CSP nonces reach Next scripts', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/(auth)/layout.tsx'), 'utf8')

    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })
})
