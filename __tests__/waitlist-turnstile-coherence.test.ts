import { waitlistSubmitState } from '@/app/(auth)/signup/waitlist-gate'
import { verifyTurnstileToken } from '@/lib/security/turnstile'

// ─── Coherence: the client gate must never enable a submit the server will
// refuse (quick task 261002-wtl) ───────────────────────────────────────────
// This test imports BOTH real implementations — the real waitlistSubmitState
// and the real verifyTurnstileToken — and binds them together. It does NOT
// reimplement the server's rule as a second predicate: a copy that merely
// *describes* the server's contract could drift from the server and still
// report green, which is exactly the label-integrity failure this change
// closes (see Skill("label-integrity-funun")). TURNSTILE_SECRET is stubbed
// and global.fetch is stubbed to always report Cloudflare success, which
// isolates the test to the one thing the two sides can actually disagree
// about: the token precondition, not network/config behaviour already
// covered by lib/security/turnstile.test.ts.

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.resetAllMocks()
  process.env = { ...ORIGINAL_ENV, TURNSTILE_SECRET: 'test-secret' }
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  }) as unknown as typeof fetch
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('waitlist client/server Turnstile coherence', () => {
  const siteKeys: Array<string | undefined> = [undefined, 'a-site-key']
  const tokens = ['', '   ', 'a-real-token']

  it.each(siteKeys.flatMap(siteKey => tokens.map(token => [siteKey, token] as const)))(
    'siteKey=%p token=%p: gate enabled implies the real verifier would also accept it',
    async (siteKey, token) => {
      const state = waitlistSubmitState({ submitting: false, siteKey, turnstileToken: token })

      if (!state.disabled) {
        const serverWouldAccept = await verifyTurnstileToken(token)
        expect(serverWouldAccept).toBe(true)
      }
    }
  )

  it('the known-bad historical combination (no site key, empty token) is now disabled', () => {
    const state = waitlistSubmitState({ submitting: false, siteKey: undefined, turnstileToken: '' })
    expect(state.disabled).toBe(true)
    expect(state.reason).toBe('verification-unavailable')
  })
})
