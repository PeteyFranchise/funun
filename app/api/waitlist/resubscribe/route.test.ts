import { createServiceClient } from '@/lib/supabase/server'
import { POST } from './route'

// ─── POST /api/waitlist/resubscribe (27-07 Task 2) ─────────────────────────
// Integration test with a mocked service client, mirroring
// app/api/waitlist/route.test.ts's conventions. Covers: valid token clears
// unsubscribed_at, unknown/missing token -> generic 404, the route never
// filters on id/email (T-27-05 IDOR mitigation), and ip rate-limiting.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/waitlist/resubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function mockService(options: { row?: { id: string } | null } = {}) {
  const { row = null } = options

  const maybeSingleSpy = jest.fn(async () => ({
    data: row,
    error: row ? null : { message: 'no rows' },
  }))
  const selectAfterUpdateSpy = jest.fn((_columns: string) => ({ maybeSingle: maybeSingleSpy }))
  const eqSpy = jest.fn((_column: string, _value: string) => ({ select: selectAfterUpdateSpy }))
  const updateSpy = jest.fn((_patch: Record<string, unknown>) => ({ eq: eqSpy }))

  const from = jest.fn((table: string) => {
    if (table === 'artist_waitlist') return { update: updateSpy }
    return {}
  })

  return { from, updateSpy, eqSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/waitlist/resubscribe', () => {
  it('clears unsubscribed_at for a row matching the token', async () => {
    const service = mockService({ row: { id: 'row-uuid-1' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'valid-token-abc' }, { 'x-forwarded-for': '30.0.0.1' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(service.updateSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ unsubscribed_at: null })
    )
    expect(service.eqSpy).toHaveBeenCalledWith('unsubscribe_token', 'valid-token-abc')
  })

  it('returns a generic 404 for an unknown token', async () => {
    const service = mockService({ row: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'does-not-exist' }, { 'x-forwarded-for': '30.0.0.2' })
    )

    expect(res.status).toBe(404)
  })

  it('returns 404 for a missing token without touching the DB', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({}, { 'x-forwarded-for': '30.0.0.3' }))

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('never accepts a row id or email as the resubscribe key (IDOR-safe, T-27-05)', async () => {
    const service = mockService({ row: { id: 'row-uuid-2' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST(
      jsonRequest(
        { token: 'the-real-token', id: 'row-uuid-2', email: 'someone@example.test' },
        { 'x-forwarded-for': '30.0.0.4' }
      )
    )

    // Only unsubscribe_token is ever used as the filter column.
    expect(service.eqSpy).toHaveBeenCalledWith('unsubscribe_token', 'the-real-token')
    expect(service.eqSpy).not.toHaveBeenCalledWith('id', expect.anything())
    expect(service.eqSpy).not.toHaveBeenCalledWith('email', expect.anything())
  })

  it('returns 429 after the ip rate-limit threshold is exceeded', async () => {
    const service = mockService({ row: { id: 'row-uuid-3' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const ip = '30.0.1.1'
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(jsonRequest({ token: `token-${i}` }, { 'x-forwarded-for': ip }))
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })
})
