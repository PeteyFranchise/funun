import { readFileSync } from 'fs'
import path from 'path'

const route = readFileSync(
  path.join(process.cwd(), 'app/api/producer-returns/[returnId]/review/route.ts'),
  'utf8'
)
const card = readFileSync(
  path.join(process.cwd(), 'components/catalogue/ReturnedMixReviewCard.tsx'),
  'utf8'
)

describe('producer return review route and skip contract', () => {
  it('authenticates, resolves the return through member RLS and rechecks contribution access', () => {
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain("from('work_recording_handoff_returns')")
    expect(route).toContain("resolveWorkAccess(createWorkAccessDeps(supabase), returned.work_id, user.id, 'contribute')")
    expect(route).toContain('p_reviewer: user.id')
    expect(route).not.toMatch(/p_reviewer:\s*parsed\.data/)
  })

  it('allows only the two non-approval creative outcomes', () => {
    expect(route).toContain("z.enum(['made_working', 'kept_current'])")
    expect(route).not.toMatch(/approve|reject/i)
  })

  it('keeps Later session-local with no review request or persistence side effect', () => {
    expect(card).toContain('onClick={() => setLater(true)}')
    expect(card).not.toMatch(/onClick=\{\(\) =>[^\n]*review\('later'/)
  })
})
