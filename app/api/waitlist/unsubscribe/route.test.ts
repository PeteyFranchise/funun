import { createServiceClient } from '@/lib/supabase/server'
import { POST } from './route'

// ─── POST /api/waitlist/unsubscribe (Codex review Blocker B2 fix) ──────────
// Integration test with a mocked service client, mirroring
// resubscribe/route.test.ts's conventions. Covers: valid token sets
// unsubscribed_at, unknown/missing token -> generic 404, idempotency
// (already-unsubscribed row is a no-op, no second write), the route never
// filters on id/email (T-27-05 IDOR mitigation), and ip rate-limiting.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t.local/api/waitlist/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function mockService(
  options: {
    row?: { id: string; unsubscribed_at: string | null } | null
    updateError?: { message: string } | null
  } = {}
) {
  const { row = null, updateError = null } = options

  const maybeSingleSpy = jest.fn(async () => ({
    data: row,
    error: row ? null : { message: 'no rows' },
  }))
  const selectEqSpy = jest.fn((_column: string, _value: string) => ({ maybeSingle: maybeSingleSpy }))
  const selectSpy = jest.fn((_columns: string) => ({ eq: selectEqSpy }))

  const updateEqSpy = jest.fn(async () => ({ data: null, error: updateError }))
  const updateSpy = jest.fn((_patch: Record<string, unknown>) => ({ eq: updateEqSpy }))

  const from = jest.fn((table: string) => {
    if (table === 'artist_waitlist') return { select: selectSpy, update: updateSpy }
    return {}
  })

  return { from, selectSpy, selectEqSpy, updateSpy, updateEqSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/waitlist/unsubscribe', () => {
  it('sets unsubscribed_at for a row matching the token', async () => {
    const service = mockService({ row: { id: 'row-uuid-1', unsubscribed_at: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'valid-token-abc' }, { 'x-forwarded-for': '31.0.0.1' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(service.updateSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({ unsubscribed_at: expect.any(String) })
    )
    expect(service.updateEqSpy).toHaveBeenCalled()
    expect(service.selectEqSpy).toHaveBeenCalledWith('unsubscribe_token', 'valid-token-abc')
  })

  it('returns a generic 404 for an unknown token', async () => {
    const service = mockService({ row: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'does-not-exist' }, { 'x-forwarded-for': '31.0.0.2' })
    )

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing token without touching the DB', async () => {
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({}, { 'x-forwarded-for': '31.0.0.3' }))

    expect(res.status).toBe(404)
    expect(service.selectSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('is idempotent — an already-unsubscribed row returns ok without a second write', async () => {
    const service = mockService({
      row: { id: 'row-uuid-2', unsubscribed_at: '2026-08-01T00:00:00.000Z' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'already-unsubscribed-token' }, { 'x-forwarded-for': '31.0.0.4' })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('never accepts a row id or email as the unsubscribe key (IDOR-safe, T-27-05)', async () => {
    const service = mockService({ row: { id: 'row-uuid-3', unsubscribed_at: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST(
      jsonRequest(
        { token: 'the-real-token', id: 'row-uuid-3', email: 'someone@example.test' },
        { 'x-forwarded-for': '31.0.0.5' }
      )
    )

    // Only unsubscribe_token is ever used as the filter column.
    expect(service.selectEqSpy).toHaveBeenCalledWith('unsubscribe_token', 'the-real-token')
    expect(service.selectEqSpy).not.toHaveBeenCalledWith('id', expect.anything())
    expect(service.selectEqSpy).not.toHaveBeenCalledWith('email', expect.anything())
  })

  it('returns 500 when the update fails after a valid lookup', async () => {
    const service = mockService({
      row: { id: 'row-uuid-4', unsubscribed_at: null },
      updateError: { message: 'db down' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ token: 'valid-token-but-write-fails' }, { 'x-forwarded-for': '31.0.0.6' })
    )

    expect(res.status).toBe(500)
  })

  it('returns 429 after the ip rate-limit threshold is exceeded', async () => {
    const service = mockService({ row: { id: 'row-uuid-5', unsubscribed_at: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const ip = '31.0.1.1'
    let lastStatus = 0
    for (let i = 0; i < 6; i++) {
      const res = await POST(jsonRequest({ token: `token-${i}` }, { 'x-forwarded-for': ip }))
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })
})
