// Audit #6 — the public reactions endpoint must be rate-limited so a leaked
// Selects link can't be flooded with rotating viewer keys. Proves the limiter
// short-circuits before any write, checks both dimensions (per token+ip and per
// token), and lets legitimate traffic through.

const mockCheckRateLimit = jest.fn()
jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  getClientIp: () => '5.5.5.5',
}))

const mockResolveSelects = jest.fn()
const mockLoadTrack = jest.fn()
jest.mock('@/lib/selects/public-resolve', () => ({
  resolveSelectsByToken: (...a: unknown[]) => mockResolveSelects(...a),
  loadOwnSelectsTrack: (...a: unknown[]) => mockLoadTrack(...a),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
  createApiClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { POST, isSelectsReactionCapError } from '@/app/api/selects/[token]/react/route'

const UUID = '00000000-0000-0000-0000-000000000001'
function req(body: unknown) {
  return { json: async () => body, headers: { get: () => null } } as unknown as Request
}
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveSelects.mockResolvedValue({ id: 'sel-1', buyer_org_id: 'org-1' })
  mockLoadTrack.mockResolvedValue(null)
})

describe('POST /api/selects/[token]/react — rate limit (audit #6)', () => {
  it('returns 429 (before loading the track) when the limiter reports flooded', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(true)
    const res = await POST(req({ selectsTrackId: UUID, reaction: 'love', viewerKey: 'abcdefgh' }), ctx('tok'))
    expect(res.status).toBe(429)
    expect(mockLoadTrack).not.toHaveBeenCalled()
  })

  it('checks both the per-(token+ip) and per-token dimensions', async () => {
    mockCheckRateLimit.mockResolvedValue(false)
    await POST(req({ selectsTrackId: UUID, reaction: 'love', viewerKey: 'abcdefgh' }), ctx('tok'))
    const keys = mockCheckRateLimit.mock.calls.map(c => c[0])
    expect(keys).toEqual(expect.arrayContaining(['selects-react:tok:5.5.5.5', 'selects-react:tok']))
  })

  it('proceeds past the limiter when under the limit', async () => {
    mockCheckRateLimit.mockResolvedValue(false)
    const res = await POST(req({ selectsTrackId: UUID, reaction: 'love', viewerKey: 'abcdefgh' }), ctx('tok'))
    // track load returns null → 404, proving the limiter did not short-circuit
    expect(mockLoadTrack).toHaveBeenCalled()
    expect(res.status).toBe(404)
  })

  it('never rate-limits an invalid token past the 404', async () => {
    mockResolveSelects.mockResolvedValue(null)
    const res = await POST(req({ selectsTrackId: UUID, reaction: 'love', viewerKey: 'abcdefgh' }), ctx('bad'))
    expect(res.status).toBe(404)
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })
})

describe('Selects reaction cap errors', () => {
  it('recognizes only the database cap check violation', () => {
    expect(
      isSelectsReactionCapError({
        code: '23514',
        message: 'selects reaction cap reached for track track-1',
      })
    ).toBe(true)
    expect(isSelectsReactionCapError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isSelectsReactionCapError(null)).toBe(false)
  })
})
