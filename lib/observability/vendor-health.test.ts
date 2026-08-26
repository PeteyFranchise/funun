jest.mock('@/lib/playbook/digest', () => ({
  getDashboardHealth: jest.fn(),
}))

import {
  VENDOR_PROBE_TIMEOUT_MS,
  classifyCredential,
  verdictFromHttpStatus,
  isEmailShaped,
  safeSenderDisplay,
  checkSenderAddress,
  summarizeVendorHealth,
  runVendorHealthChecks,
  type VendorProbeResult,
} from './vendor-health'
import { getDashboardHealth } from '@/lib/playbook/digest'

const mockGetDashboardHealth = getDashboardHealth as jest.MockedFunction<typeof getDashboardHealth>

// ─── Task 1 — pure verdict core (260826-2qm) ───────────────────────────────
// Every assertion here is network-free: this file covers only the pure
// classification/shape logic. Task 2 extends this same test file with the
// networked probe layer and the load-bearing sentinel no-leak test.

describe('VENDOR_PROBE_TIMEOUT_MS', () => {
  it('is 5000ms — larger than the 2000ms Supabase check budget', () => {
    expect(VENDOR_PROBE_TIMEOUT_MS).toBe(5000)
  })
})

describe('classifyCredential', () => {
  it('resolves missing for undefined', () => {
    expect(classifyCredential(undefined)).toBe('missing')
  })

  it('resolves missing for whitespace-only', () => {
    expect(classifyCredential('   ')).toBe('missing')
  })

  it.each([
    'placeholder',
    'your_key_here',
    'your-key-here',
    'changeme',
    'change_me',
    'TODO',
    'example-key',
    'dummy',
    'xxxx1234',
    '<insert key>',
  ])('resolves placeholder for %s', (value) => {
    expect(classifyCredential(value)).toBe('placeholder')
  })

  it('resolves present for an ordinary non-empty value', () => {
    expect(classifyCredential('sk_live_abc123def456')).toBe('present')
  })
})

describe('verdictFromHttpStatus', () => {
  it.each([200, 204])('resolves ok for %d', (status) => {
    expect(verdictFromHttpStatus(status)).toBe('ok')
  })

  it.each([401, 403, 400, 500])('resolves failed for %d', (status) => {
    expect(verdictFromHttpStatus(status)).toBe('failed')
  })
})

describe('isEmailShaped', () => {
  it('accepts a plain address', () => {
    expect(isEmailShaped('no-reply@auth.funun.studio')).toBe(true)
  })

  it('rejects a key-shaped value', () => {
    expect(isEmailShaped('re_abc123def456')).toBe(false)
  })

  it('rejects a value with no domain dot', () => {
    expect(isEmailShaped('not-an-address')).toBe(false)
  })

  it('rejects a value containing whitespace', () => {
    expect(isEmailShaped('no reply@funun.studio')).toBe(false)
  })
})

describe('safeSenderDisplay', () => {
  it('returns null for undefined', () => {
    expect(safeSenderDisplay(undefined)).toBeNull()
  })

  it('returns null for a key-shaped value even though the module never sees this used elsewhere', () => {
    expect(safeSenderDisplay('re_abc123def456')).toBeNull()
  })

  it('returns null for a non-email-shaped value', () => {
    expect(safeSenderDisplay('not-an-address')).toBeNull()
  })

  it('returns the trimmed address for a passing value', () => {
    expect(safeSenderDisplay('  no-reply@auth.funun.studio  ')).toBe('no-reply@auth.funun.studio')
  })
})

describe('checkSenderAddress', () => {
  it('resolves not-configured for undefined', () => {
    const result = checkSenderAddress(undefined, 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('not-configured')
    expect(result.envVar).toBe('RESEND_FROM_EMAIL')
  })

  it('resolves failed for a key-shaped value, naming the problem, with no leak', () => {
    const sentinel = 're_SENTINEL_9f8e7d6c5b4a'
    const result = checkSenderAddress(sentinel, 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('failed')
    expect(result.detail.toLowerCase()).toContain('api key')
    // Sentinel enforcement: the distinctive suffix must not survive into
    // the serialized result, proven by assertion rather than inspection.
    expect(JSON.stringify(result)).not.toContain('SENTINEL_9f8e7d6c5b4a')
  })

  it('resolves failed for a non-email-shaped value', () => {
    const result = checkSenderAddress('not-an-address', 'RESEND_FROM_EMAIL', 'Resend sender')
    expect(result.state).toBe('failed')
  })

  it('resolves ok with the address as detail for a passing value', () => {
    const result = checkSenderAddress(
      'no-reply@auth.funun.studio',
      'RESEND_FROM_EMAIL',
      'Resend sender'
    )
    expect(result.state).toBe('ok')
    expect(result.detail).toBe('no-reply@auth.funun.studio')
  })
})

// ─── Task 2 — bounded, concurrent, read-only network probes ───────────────
// Follows lib/esign/docuseal.test.ts's own fetch-mocking idiom: a plain
// object shaped like Response, never the real network. EVERY test here
// mocks global.fetch (and @/lib/playbook/digest for the Supabase probe) —
// this suite must never reach a live vendor API.

type Call = { url: string; init: RequestInit }

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>): { calls: Call[] } {
  const calls: Call[] = []
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    const call: Call = { url: String(url), init: (init ?? {}) as RequestInit }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch
  return { calls }
}

const CREDENTIALED_ENV_VARS = [
  'RESEND_API_KEY',
  'DOCUSEAL_API_KEY',
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
] as const

const SENDER_ENV_VARS = ['RESEND_FROM_EMAIL', 'ESIGN_FROM_EMAIL', 'PITCH_FROM_EMAIL'] as const

function clearVendorEnv() {
  for (const key of CREDENTIALED_ENV_VARS) delete process.env[key]
  for (const key of SENDER_ENV_VARS) delete process.env[key]
}

describe('runVendorHealthChecks', () => {
  beforeEach(() => {
    clearVendorEnv()
    mockGetDashboardHealth.mockReset()
    mockGetDashboardHealth.mockResolvedValue('healthy')
  })

  afterEach(() => {
    clearVendorEnv()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('resolves not-configured with zero outbound calls when a credential is unset', async () => {
    const { calls } = mockFetch(() => jsonResponse({}))
    const { results } = await runVendorHealthChecks()
    const resend = results.find(r => r.id === 'resend')!
    expect(resend.state).toBe('not-configured')
    expect(calls).toHaveLength(0)
  })

  it('resolves not-configured (not failed) for a placeholder credential', async () => {
    process.env.RESEND_API_KEY = 'your_key_here'
    const { calls } = mockFetch(() => jsonResponse({}))
    const { results } = await runVendorHealthChecks()
    const resend = results.find(r => r.id === 'resend')!
    expect(resend.state).toBe('not-configured')
    expect(calls).toHaveLength(0)
  })

  it('resolves ok when the credential is present and fetch resolves 200', async () => {
    process.env.RESEND_API_KEY = 'present-real-key'
    mockFetch(() => jsonResponse({ data: [{ name: 'funun.studio', status: 'verified' }] }))
    const { results } = await runVendorHealthChecks()
    const resend = results.find(r => r.id === 'resend')!
    expect(resend.state).toBe('ok')
  })

  it('resolves failed when the credential is present and fetch resolves 401', async () => {
    process.env.RESEND_API_KEY = 'present-real-key'
    mockFetch(() => jsonResponse({ message: 'unauthorized' }, 401))
    const { results } = await runVendorHealthChecks()
    const resend = results.find(r => r.id === 'resend')!
    expect(resend.state).toBe('failed')
  })

  it('resolves failed on a rejecting fetch, and every other vendor still resolves', async () => {
    process.env.RESEND_API_KEY = 'present-real-key'
    process.env.STRIPE_SECRET_KEY = 'present-real-key'
    global.fetch = jest.fn((url: unknown) => {
      if (String(url).includes('resend')) return Promise.reject(new Error('network down'))
      return Promise.resolve(jsonResponse({ livemode: false }))
    }) as unknown as typeof fetch

    const { results } = await runVendorHealthChecks()
    const resend = results.find(r => r.id === 'resend')!
    const stripe = results.find(r => r.id === 'stripe')!
    expect(resend.state).toBe('failed')
    expect(stripe.state).toBe('ok')
  })

  it('resolves failed with a timeout detail when fetch never settles, without hanging the caller', async () => {
    jest.useFakeTimers()
    process.env.RESEND_API_KEY = 'present-real-key'
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch

    const promise = runVendorHealthChecks()
    await jest.advanceTimersByTimeAsync(VENDOR_PROBE_TIMEOUT_MS)
    const { results } = await promise

    const resend = results.find(r => r.id === 'resend')!
    expect(resend.state).toBe('failed')
  })

  it('uses a read-only verb and a no-store cache directive on every recorded call', async () => {
    process.env.RESEND_API_KEY = 'present-real-key'
    process.env.DOCUSEAL_API_KEY = 'present-real-key'
    process.env.ANTHROPIC_API_KEY = 'present-real-key'
    process.env.STRIPE_SECRET_KEY = 'present-real-key'
    const { calls } = mockFetch(() => jsonResponse({ data: [], livemode: false }))

    await runVendorHealthChecks()

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.init.method).toBe('GET')
      expect(call.init.cache).toBe('no-store')
    }
  })

  it('issues probes concurrently, not serially', async () => {
    process.env.RESEND_API_KEY = 'present-real-key'
    process.env.DOCUSEAL_API_KEY = 'present-real-key'
    process.env.ANTHROPIC_API_KEY = 'present-real-key'
    process.env.STRIPE_SECRET_KEY = 'present-real-key'
    const DELAY_MS = 60
    global.fetch = jest.fn(
      () =>
        new Promise<Response>(resolve =>
          setTimeout(() => resolve(jsonResponse({ data: [], livemode: false })), DELAY_MS)
        )
    ) as unknown as typeof fetch

    const startedAt = Date.now()
    await runVendorHealthChecks()
    const elapsed = Date.now() - startedAt

    // Serial execution of 4 credentialed probes would take >= 4 * DELAY_MS;
    // concurrent execution takes roughly one DELAY_MS.
    expect(elapsed).toBeLessThan(DELAY_MS * 3)
  })

  it('never leaks a credential value — sentinel no-leak guarantee', async () => {
    const sentinels: Record<(typeof CREDENTIALED_ENV_VARS)[number], string> = {
      RESEND_API_KEY: 'SENTINEL_RESEND_9f1a2b3c',
      DOCUSEAL_API_KEY: 'SENTINEL_DOCUSEAL_9f4d5e6f',
      ANTHROPIC_API_KEY: 'SENTINEL_ANTHROPIC_9f7a8b9c',
      STRIPE_SECRET_KEY: 'SENTINEL_STRIPE_9fadbecf',
    }
    for (const [key, value] of Object.entries(sentinels)) process.env[key] = value

    // Hostile mock: echoes every inbound request header verbatim into the
    // JSON body, exactly as a real vendor error payload might. Only a
    // probe that reads response fields via a narrow allowlist (not the
    // whole body) can survive this.
    mockFetch(call => {
      const headers = (call.init.headers ?? {}) as Record<string, string>
      return jsonResponse({
        data: [{ name: 'domain.example', status: 'verified' }],
        livemode: false,
        echoedHeaders: headers,
      })
    })

    const { results, summary } = await runVendorHealthChecks()
    const serialized = JSON.stringify({ results, summary })

    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel)
    }
  })
})

describe('summarizeVendorHealth', () => {
  function row(state: VendorProbeResult['state']): VendorProbeResult {
    return { id: 'x', label: 'X', envVar: 'X_KEY', state, detail: '', durationMs: 0 }
  }

  it('counts ok/failed/notConfigured', () => {
    const summary = summarizeVendorHealth([row('ok'), row('ok'), row('failed'), row('not-configured')])
    expect(summary.ok).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.notConfigured).toBe(1)
  })

  it('allOk is true only when zero rows are failed', () => {
    expect(summarizeVendorHealth([row('ok'), row('not-configured')]).allOk).toBe(true)
    expect(summarizeVendorHealth([row('ok'), row('failed')]).allOk).toBe(false)
  })

  it('not-configured rows never flip allOk false', () => {
    expect(summarizeVendorHealth([row('not-configured'), row('not-configured')]).allOk).toBe(true)
  })
})
