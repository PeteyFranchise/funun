import { createServiceClient } from '@/lib/supabase/server'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { POST } from './route'

// ─── POST /api/waitlist (27-07 Task 1; H2/L3 fix 27-CODEX-REVIEW.md) ──────
// Integration test with a mocked service client + mocked Turnstile
// verification, mirroring app/api/sync/register/route.test.ts's
// conventions. Covers: valid submit -> atomic upsert RPC call + neutral
// success, captcha-fail short-circuits before any DB write (fail-closed),
// invalid email -> 400, missing name -> 400 (L3), ip/email rate limits ->
// 429, the RPC's error/null-id result -> neutral 500 failure (H2 — never
// {ok:true} without a persisted row), and the sanitizeWaitlistEntry
// mass-assignment allowlist.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: jest.fn(),
}))

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    email: 'visitor@example.test',
    name: 'Visitor Name',
    note: 'Would love an invite!',
    turnstileToken: 'valid-token',
    ...overrides,
  }
}

function mockService(
  options: {
    rpcResult?: { data: string | null; error: { message: string } | null }
  } = {}
) {
  const { rpcResult = { data: 'row-uuid-1', error: null } } = options

  const rpcSpy = jest.fn(async (_fn: string, _args: Record<string, unknown>) => rpcResult)

  return { rpc: rpcSpy, from: jest.fn(() => ({})) }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(true)
})

describe('POST /api/waitlist', () => {
  it('captures a new waitlist entry behind captcha + rate-limit via the atomic upsert RPC', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'new-visitor@example.test' }), {
        'x-forwarded-for': '20.0.0.1',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(service.rpc).toHaveBeenCalledWith('upsert_artist_waitlist', {
      p_email: 'new-visitor@example.test',
      p_name: 'Visitor Name',
      p_note: 'Would love an invite!',
    })
  })

  it('rejects before any DB write when Turnstile verification fails (fail-closed)', async () => {
    ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(false)
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'captcha-fail@example.test' }), {
        'x-forwarded-for': '20.0.0.2',
      })
    )

    expect([400, 403]).toContain(res.status)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(service.rpc).not.toHaveBeenCalled()
  })

  it('returns 400 on an invalid email and never calls Turnstile or the DB', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'not-an-email' }), { 'x-forwarded-for': '20.0.0.3' })
    )

    expect(res.status).toBe(400)
    expect(verifyTurnstileToken).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 on a missing name and never calls Turnstile or the DB (L3)', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ name: undefined }), { 'x-forwarded-for': '20.0.0.4' })
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('A name is required.')
    expect(verifyTurnstileToken).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 429 after the ip rate-limit threshold is exceeded', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const ip = '20.0.1.1'
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        jsonRequest(validBody({ email: `ip-limit-${i}@example.test` }), { 'x-forwarded-for': ip })
      )
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })

  it('returns 429 after the email rate-limit threshold is exceeded', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(
        jsonRequest(validBody({ email: 'repeat-visitor@example.test' }), {
          'x-forwarded-for': `20.0.2.${i}`,
        })
      )
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })

  it('returns a neutral 500 (never {ok:true}) when the RPC returns an error (H2)', async () => {
    const service = mockService({ rpcResult: { data: null, error: { message: 'connection reset' } } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'rpc-error@example.test' }), { 'x-forwarded-for': '20.0.3.1' })
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBeUndefined()
  })

  it('returns a neutral 500 (never {ok:true}) when the RPC succeeds but returns no id (H2)', async () => {
    const service = mockService({ rpcResult: { data: null, error: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'rpc-null@example.test' }), { 'x-forwarded-for': '20.0.3.2' })
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBeUndefined()
  })

  it('drops extra keys via the sanitizeWaitlistEntry allowlist (mass-assignment defense)', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(
        validBody({
          email: 'allowlist-test@example.test',
          status: 'accepted',
          unsubscribed_at: null,
          id: 'attacker-controlled',
        }),
        { 'x-forwarded-for': '20.0.4.1' }
      )
    )

    expect(res.status).toBe(200)
    const rpcArgs = service.rpc.mock.calls[0][1]
    expect(rpcArgs).toEqual({
      p_email: 'allowlist-test@example.test',
      p_name: 'Visitor Name',
      p_note: 'Would love an invite!',
    })
  })
})
