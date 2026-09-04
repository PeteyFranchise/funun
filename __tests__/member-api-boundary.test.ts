import { readFileSync } from 'fs'
import path from 'path'

const protectedRoutes = [
  'app/api/collaborators/route.ts',
  'app/api/collaborators/[id]/route.ts',
  'app/api/collaborators/[id]/invite/route.ts',
  'app/api/collaborators/quick-invite/route.ts',
  'app/api/works/[workId]/members/route.ts',
]

describe('Member API boundary', () => {
  it.each(protectedRoutes)('%s enforces the shared Member account gate', route => {
    const source = readFileSync(path.join(process.cwd(), route), 'utf8')

    expect(source).toContain("from '@/lib/accounts/member-api-gate'")
    expect(source).toContain('requireMemberApiAccount(supabase, authUser)')
  })
})
