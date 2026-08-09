import { createServiceClient } from '@/lib/supabase/server'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { POST } from './route'

// ─── POST /api/waitlist (27-07 Task 1) ─────────────────────────────────────
// Integration test with a mocked service client + mocked Turnstile
// verification, mirroring app/api/sync/register/route.test.ts's
// conventions. Covers: valid submit -> upsert (insert path) + neutral
// success, captcha-fail short-circuits before any DB write (fail-closed),
// invalid email -> 400, ip/email rate limits -> 429, the conflict
// (existing row) path clearing unsubscribed_at (D-19 auto-resubscribe),
// and the sanitizeWaitlistEntry mass-assignment allowlist.

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
    existingRows?: Array<{ id: string } | null>
    insertError?: { code: string; message: string } | null
  } = {}
) {
  const { existingRows = [null], insertError = null } = options
  let selectCallIndex = 0

  const maybeSingleSpy = jest.fn(async () => {
    const row = existingRows[selectCallIndex] ?? existingRows[existingRows.length - 1] ?? null
    selectCallIndex += 1
    return { data: row, error: null }
  })
  const selectEqSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const selectSpy = jest.fn(() => ({ eq: selectEqSpy }))

  const updateEqSpy = jest.fn(async () => ({ data: null, error: null }))
  const updateSpy = jest.fn((_patch: Record<string, unknown>) => ({ eq: updateEqSpy }))

  const insertSpy = jest.fn(async (_row: Record<string, unknown>) => ({ data: null, error: insertError }))

  const from = jest.fn((table: string) => {
    if (table === 'artist_waitlist') return { select: selectSpy, update: updateSpy, insert: insertSpy }
    return {}
  })

  return { from, selectSpy, updateSpy, updateEqSpy, insertSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(verifyTurnstileToken as jest.Mock).mockResolvedValue(true)
})

describe('POST /api/waitlist', () => {
  it('captures a new waitlist entry behind captcha + rate-limit and returns a neutral success', async () => {
    const service = mockService({ existingRows: [null] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'new-visitor@example.test' }), {
        'x-forwarded-for': '20.0.0.1',
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new-visitor@example.test' })
    )
    expect(service.updateSpy).not.toHaveBeenCalled()
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
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
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

  it('clears unsubscribed_at on the conflict path (auto-resubscribe, D-19)', async () => {
    const service = mockService({ existingRows: [{ id: 'row-uuid-1' }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(validBody({ email: 'returning-visitor@example.test' }), {
        'x-forwarded-for': '20.0.3.1',
      })
    )

    expect(res.status).toBe(200)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).toHaveBeenCalled()
    expect(service.updateSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ unsubscribed_at: null })
    )
  })

  it('drops extra keys via the sanitizeWaitlistEntry allowlist (mass-assignment defense)', async () => {
    const service = mockService({ existingRows: [null] })
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
    const insertedRow = service.insertSpy.mock.calls[0][0]
    expect(insertedRow).not.toHaveProperty('status')
    expect(insertedRow).not.toHaveProperty('id')
  })
})
