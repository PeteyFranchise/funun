import { turnstileConfigStatus, verifyTurnstileToken } from './turnstile'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.resetAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('turnstileConfigStatus', () => {
  it('reports configured when both vars are set', () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'

    expect(turnstileConfigStatus()).toBe('configured')
  })

  it('reports secret-missing when only the site key is set', () => {
    delete process.env.TURNSTILE_SECRET
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'

    expect(turnstileConfigStatus()).toBe('secret-missing')
  })

  it('reports site-key-missing when only the secret is set', () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    expect(turnstileConfigStatus()).toBe('site-key-missing')
  })

  it('reports unconfigured when neither var is set', () => {
    delete process.env.TURNSTILE_SECRET
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    expect(turnstileConfigStatus()).toBe('unconfigured')
  })
})

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare confirms success', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch

    const result = await verifyTurnstileToken('valid-token', '1.2.3.4')

    expect(result).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    )
  })

  it('fails closed (false) when TURNSTILE_SECRET is not configured', async () => {
    delete process.env.TURNSTILE_SECRET
    global.fetch = jest.fn()

    const result = await verifyTurnstileToken('any-token')

    expect(result).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns false immediately for an empty token, without calling fetch', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn()

    const result = await verifyTurnstileToken('')

    expect(result).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fails closed (false) when the fetch call rejects (Cloudflare outage)', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'))

    const result = await verifyTurnstileToken('valid-token')

    expect(result).toBe(false)
  })

  it('fails closed (false) when Cloudflare reports success: false', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch

    const result = await verifyTurnstileToken('bad-token')

    expect(result).toBe(false)
  })

  it('fails closed (false) when Cloudflare responds with a non-2xx status', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch

    const result = await verifyTurnstileToken('valid-token')

    expect(result).toBe(false)
  })

  it('fails closed (false) when Cloudflare returns a malformed (non-object) body', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => null,
    }) as unknown as typeof fetch

    const result = await verifyTurnstileToken('valid-token')

    expect(result).toBe(false)
  })
})
