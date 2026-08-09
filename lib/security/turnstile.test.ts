import { verifyTurnstileToken } from './turnstile'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.resetAllMocks()
  process.env = { ...ORIGINAL_ENV }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare confirms success', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
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

  it('fails closed (false) when TURNSTILE_SECRET_KEY is not configured', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    global.fetch = jest.fn()

    const result = await verifyTurnstileToken('any-token')

    expect(result).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns false immediately for an empty token, without calling fetch', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'
    global.fetch = jest.fn()

    const result = await verifyTurnstileToken('')

    expect(result).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fails closed (false) when the fetch call rejects (Cloudflare outage)', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'))

    const result = await verifyTurnstileToken('valid-token')

    expect(result).toBe(false)
  })

  it('fails closed (false) when Cloudflare reports success: false', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch

    const result = await verifyTurnstileToken('bad-token')

    expect(result).toBe(false)
  })
})
