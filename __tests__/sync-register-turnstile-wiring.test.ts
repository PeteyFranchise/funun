import { readFileSync } from 'fs'
import { join } from 'path'

// ─── Buyer Register form carries the bot check (source-text wiring lock) ──
// The repo has no React component-testing setup (jest runs in 'node'), so
// this reads the modal source, the same way other wiring tests here do. The
// server half is covered behaviourally in app/api/sync/register/route.test.ts;
// this test only locks that the form actually sends what the route requires.

const source = readFileSync(
  join(process.cwd(), 'components/buyer/LoginRegisterModal.tsx'),
  'utf8'
)

describe('LoginRegisterModal bot check wiring', () => {
  it('sends the token in the /api/sync/register request body', () => {
    const fetchCall = source.slice(source.indexOf("fetch('/api/sync/register'"))
    expect(fetchCall.slice(0, 400)).toMatch(
      /body:\s*JSON\.stringify\(\{[^}]*turnstileToken[^}]*\}\)/
    )
  })

  it('gates the submit button with the shared waitlistSubmitState predicate', () => {
    expect(source).toContain('waitlistSubmitState(')
    expect(source).toContain("from '@/app/(auth)/signup/waitlist-gate'")
  })

  it('loads the Cloudflare explicit-render script only when a site key is set', () => {
    expect(source).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
    expect(source).toMatch(/\{siteKey && \(\s*<Script/)
  })

  it('does not redeclare the global window.turnstile typing', () => {
    expect(source).not.toContain('declare global')
  })

  it('renders the widget with the action the register route verifies', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/sync/register/route.ts'), 'utf8')
    expect(source).toContain("action: 'sync-register'")
    expect(route).toContain("const TURNSTILE_ACTION = 'sync-register'")
    expect(route).toContain('expectedAction: TURNSTILE_ACTION')
  })

  it('pairs the waitlist widget action with the waitlist route', () => {
    const page = readFileSync(join(process.cwd(), 'app/(auth)/signup/page.tsx'), 'utf8')
    const route = readFileSync(join(process.cwd(), 'app/api/waitlist/route.ts'), 'utf8')
    expect(page).toContain("action: 'turnstile-spin-v2'")
    expect(route).toContain("expectedAction: 'turnstile-spin-v2'")
  })
})
