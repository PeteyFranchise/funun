import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = readFileSync(join(process.cwd(), 'app/profile-preview/page.tsx'), 'utf8')

// /profile-preview renders the artist Settings form with NO authentication, on
// purpose — that is the whole point of it, and it is safe only because the
// route cannot be reached in production. These are text-locks on the two
// properties that keep it safe; both are one careless edit away from silently
// inverting, and neither failure is visible when running `npm run dev`.
describe('/profile-preview — dev-only guards', () => {
  it('404s in production unless the flag is explicitly on', () => {
    expect(SOURCE).toContain("process.env.NODE_ENV !== 'production'")
    expect(SOURCE).toContain("process.env.ENABLE_UI_PREVIEW === 'true'")
    expect(SOURCE).toMatch(/if \(!enabled\) notFound\(\)/)
  })

  // The flag must be opt-IN. `!== 'false'` or a truthy check on an unset var
  // would leave the route open on funun.studio by default, which is the one
  // outcome this guard exists to prevent.
  it('defaults to closed in production, never open', () => {
    expect(SOURCE).not.toMatch(/ENABLE_UI_PREVIEW !== /)
    expect(SOURCE).toMatch(/ENABLE_UI_PREVIEW === 'true'/)
  })

  it('imports notFound so the guard is not a no-op', () => {
    expect(SOURCE).toMatch(/import \{ notFound \} from 'next\/navigation'/)
  })

  // middleware.ts gates every path starting with /settings. Renaming this route
  // to /settings-preview would bounce it to sign-in and defeat its purpose, so
  // the location is load-bearing, not cosmetic.
  it('lives outside the middleware-gated /settings prefix', () => {
    const middleware = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(middleware).toContain("pathname.startsWith('/settings')")
    expect('/profile-preview'.startsWith('/settings')).toBe(false)
  })

  // The profile it renders must stay fabricated. A future edit that fetches a
  // real row here would expose account data on an unauthenticated route.
  it('renders a fabricated profile, never a fetched one', () => {
    expect(SOURCE).toContain('const MOCK: UserProfile')
    expect(SOURCE).not.toMatch(/createServerClient|createServiceClient|createApiClient/)
  })
})
