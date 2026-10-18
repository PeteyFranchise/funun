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

  it('passes an AbortSignal so a slow Cloudflare response cannot hang the request', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch

    await verifyTurnstileToken('valid-token')

    const init = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails closed (false) when the verification request times out', async () => {
    process.env.TURNSTILE_SECRET = 'test-secret'
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')) as unknown as typeof fetch

    await expect(verifyTurnstileToken('valid-token')).resolves.toBe(false)
  })

  describe('expectedAction', () => {
    function mockResult(body: Record<string, unknown>) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => body,
      }) as unknown as typeof fetch
    }

    it('accepts a matching action', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      mockResult({ success: true, action: 'sync-register' })

      await expect(verifyTurnstileToken('t', '1.2.3.4', { expectedAction: 'sync-register' })).resolves.toBe(true)
    })

    it('rejects a different action', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      mockResult({ success: true, action: 'turnstile-spin-v2' })

      await expect(verifyTurnstileToken('t', '1.2.3.4', { expectedAction: 'sync-register' })).resolves.toBe(false)
    })

    it('rejects a missing action when one is expected', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      mockResult({ success: true })

      await expect(verifyTurnstileToken('t', undefined, { expectedAction: 'sync-register' })).resolves.toBe(false)
    })

    it('does not check the action when none is expected', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      mockResult({ success: true, action: 'anything' })

      await expect(verifyTurnstileToken('t')).resolves.toBe(true)
    })

    it('skips the action check for Cloudflare published test secrets', async () => {
      process.env.TURNSTILE_SECRET = '1x0000000000000000000000000000000AA'
      mockResult({ success: true, action: 'test' })

      await expect(verifyTurnstileToken('t', undefined, { expectedAction: 'sync-register' })).resolves.toBe(true)
    })
  })

  describe('hostname pin', () => {
    function mockResult(body: Record<string, unknown>) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => body,
      }) as unknown as typeof fetch
    }

    it('is not checked when TURNSTILE_EXPECTED_HOSTNAME is unset (preview deploys)', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      delete process.env.TURNSTILE_EXPECTED_HOSTNAME
      mockResult({ success: true, hostname: 'my-branch-abc.vercel.app' })

      await expect(verifyTurnstileToken('t')).resolves.toBe(true)
    })

    it('accepts a listed hostname, case-insensitively', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      process.env.TURNSTILE_EXPECTED_HOSTNAME = 'funun.studio, www.funun.studio'
      mockResult({ success: true, hostname: 'WWW.funun.studio' })

      await expect(verifyTurnstileToken('t')).resolves.toBe(true)
    })

    it('rejects an unlisted or missing hostname when configured', async () => {
      process.env.TURNSTILE_SECRET = 'test-secret'
      process.env.TURNSTILE_EXPECTED_HOSTNAME = 'funun.studio'

      mockResult({ success: true, hostname: 'other.example' })
      await expect(verifyTurnstileToken('t')).resolves.toBe(false)

      mockResult({ success: true })
      await expect(verifyTurnstileToken('t')).resolves.toBe(false)
    })
  })
})
