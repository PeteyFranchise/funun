// ─── Content-Security-Policy builder tests (quick task 261118-ryb) ─────────
// The production-mode string below was captured from the running dev server
// BEFORE this change (via curl against localhost:3000/signin, nonce value
// normalised to 'testnonce'), not retyped from memory -- see the plan's
// Task 1 capture step. If the equality assertion below ever fails, that is
// the production policy changing, and the correct fix is to make
// buildContentSecurityPolicy match this string again, never the reverse.
import { buildContentSecurityPolicy } from './csp'

const FROZEN_PRODUCTION_POLICY =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-testnonce' 'strict-dynamic' https://js.stripe.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://api.stripe.com; frame-src https://js.stripe.com https://*.docuseal.com https://challenges.cloudflare.com; worker-src 'self' blob:; upgrade-insecure-requests"

describe('buildContentSecurityPolicy', () => {
  it('matches the frozen production policy byte-for-byte when allowUnsafeEval is false', () => {
    const result = buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: false })
    expect(result).toBe(FROZEN_PRODUCTION_POLICY)
  })

  it('does NOT contain unsafe-eval in the production-mode string', () => {
    const result = buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: false })
    expect(result).not.toContain("'unsafe-eval'")
  })

  it("appends 'unsafe-eval' to script-src when allowUnsafeEval is true", () => {
    const result = buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: true })
    const scriptSrc = result.split('; ').find(directive => directive.startsWith('script-src'))
    expect(scriptSrc).toContain("'unsafe-eval'")
  })

  it("stripping the single token \" 'unsafe-eval'\" from the dev-mode string yields the production-mode string exactly", () => {
    const devPolicy = buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: true })
    const prodPolicy = buildContentSecurityPolicy({ nonce: 'testnonce', allowUnsafeEval: false })
    expect(devPolicy.replace(" 'unsafe-eval'", '')).toBe(prodPolicy)
  })

  it('interpolates the nonce into script-src and nowhere else', () => {
    const result = buildContentSecurityPolicy({ nonce: 'uniquenoncevalue', allowUnsafeEval: false })
    const directives = result.split('; ')
    const withNonce = directives.filter(directive => directive.includes('uniquenoncevalue'))
    expect(withNonce).toHaveLength(1)
    expect(withNonce[0].startsWith('script-src')).toBe(true)
    expect(withNonce[0]).toContain("'nonce-uniquenoncevalue'")
  })
})
