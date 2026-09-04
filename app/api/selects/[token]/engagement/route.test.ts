// The public Selects engagement telemetry write path (R13, D-31.2-12/13/14).
// Mirrors __tests__/selects-react-ratelimit.test.ts's mocking shape for the
// exact structural analog (resolve → rate-limit → scope → persist).

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

const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

import { POST } from '@/app/api/selects/[token]/engagement/route'

const UUID = '00000000-0000-0000-0000-000000000001'
function req(body: unknown) {
  return { json: async () => body, headers: { get: () => null } } as unknown as Request
}
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveSelects.mockResolvedValue({ id: 'sel-1', buyer_org_id: 'org-1' })
  mockLoadTrack.mockResolvedValue({ id: UUID, selects_id: 'sel-1' })
  mockCheckRateLimit.mockResolvedValue(false)
  mockRpc.mockResolvedValue({ data: true, error: null })
})

describe('POST /api/selects/[token]/engagement — delta events', () => {
  it('clamps an over-ceiling delta to <=15 before persisting (Pitfall 2)', async () => {
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: 999, event: 'heartbeat', viewerKey: 'abcdefgh' }),
      ctx('tok')
    )
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith(
      'record_selects_engagement_event',
      expect.objectContaining({ p_delta_seconds: 15 })
    )
  })

  it('rejects a non-positive delta rather than inserting a zero-second row', async () => {
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: -3, event: 'heartbeat', viewerKey: 'abcdefgh' }),
      ctx('tok')
    )
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('a track id not scoped to this Selects is 404', async () => {
    mockLoadTrack.mockResolvedValueOnce(null)
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: 5, event: 'heartbeat', viewerKey: 'abcdefgh' }),
      ctx('tok')
    )
    expect(res.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('an invalid/expired token is 404 and never reaches the rate limiter', async () => {
    mockResolveSelects.mockResolvedValueOnce(null)
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: 5, event: 'heartbeat', viewerKey: 'abcdefgh' }),
      ctx('bad')
    )
    expect(res.status).toBe(404)
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })

  it('rate-limits per (token+ip) and per token, before any write', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(true)
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: 5, event: 'heartbeat', viewerKey: 'abcdefgh' }),
      ctx('tok')
    )
    expect(res.status).toBe(429)
    expect(mockLoadTrack).not.toHaveBeenCalled()
  })

  it('checks both rate-limit dimensions under a distinct key namespace from selects-react', async () => {
    await POST(req({ selectsTrackId: UUID, deltaSeconds: 5, event: 'heartbeat', viewerKey: 'abcdefgh' }), ctx('tok'))
    const keys = mockCheckRateLimit.mock.calls.map(c => c[0])
    expect(keys).toEqual(expect.arrayContaining(['selects-engagement:tok:5.5.5.5', 'selects-engagement:tok']))
  })

  it('persists the viewer_key and event exactly as sent for a within-ceiling delta', async () => {
    await POST(req({ selectsTrackId: UUID, deltaSeconds: 8, event: 'pause', viewerKey: 'abcdefgh' }), ctx('tok'))
    expect(mockRpc).toHaveBeenCalledWith('record_selects_engagement_event', {
      p_selects_id: 'sel-1',
      p_selects_track_id: UUID,
      p_viewer_key: 'abcdefgh',
      p_delta_seconds: 8,
      p_event: 'pause',
    })
  })

  it('the response never carries an engagement aggregate/total', async () => {
    const res = await POST(req({ selectsTrackId: UUID, deltaSeconds: 8, event: 'ended', viewerKey: 'abcdefgh' }), ctx('tok'))
    const body = (await res.json()) as { data?: Record<string, unknown> }
    expect(body.data).toEqual({ ok: true })
  })

  it('rejects a body with an unknown field (strict schema)', async () => {
    const res = await POST(
      req({ selectsTrackId: UUID, deltaSeconds: 5, event: 'heartbeat', viewerKey: 'abcdefgh', extra: 'nope' }),
      ctx('tok')
    )
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('POST /api/selects/[token]/engagement — open events', () => {
  it('writes a selects_opens row, not a delta row', async () => {
    const res = await POST(req({ event: 'open', viewerKey: 'abcdefgh' }), ctx('tok'))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_selects_engagement_event', {
      p_selects_id: 'sel-1',
      p_selects_track_id: null,
      p_viewer_key: 'abcdefgh',
      p_delta_seconds: null,
      p_event: 'open',
    })
    expect(mockLoadTrack).not.toHaveBeenCalled()
  })

  it('the open-event response never carries an engagement aggregate/total', async () => {
    const res = await POST(req({ event: 'open', viewerKey: 'abcdefgh' }), ctx('tok'))
    const body = (await res.json()) as { data?: Record<string, unknown> }
    expect(body.data).toEqual({ ok: true })
  })

  it('an invalid/expired token is 404 for an open event too', async () => {
    mockResolveSelects.mockResolvedValueOnce(null)
    const res = await POST(req({ event: 'open', viewerKey: 'abcdefgh' }), ctx('bad'))
    expect(res.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires a stable viewer key so anonymous traffic cannot create unbounded rows', async () => {
    const res = await POST(req({ event: 'open' }), ctx('tok'))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 429 when the bounded aggregate reaches capacity', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23514' } })
    const res = await POST(req({ event: 'open', viewerKey: 'abcdefgh' }), ctx('tok'))
    expect(res.status).toBe(429)
  })
})

// ─── D-31.2-14 contract: the public player render path never selects engagement ─
// The engagement/opens tables are staff-only (migration 132: RLS enabled,
// zero policies, REVOKE all from authenticated/anon — reachable only via the
// service role from this validated write route and requireStaff-gated read
// routes, plan 10). This is a source-content assertion — mirrors
// __tests__/selects-respond-cas.test.ts's audit-#10 convention — asserted at
// the source level because a true "never queries this table" guarantee needs
// either a live DB or a static grep; grepping the SSR render source is the
// cheap, durable proxy. This assertion string lives ONLY in this test file —
// never grepped by an acceptance gate.
import { readFileSync } from 'fs'
import path from 'path'

describe('D-31.2-14 — public player render path never reads engagement telemetry', () => {
  it('app/selects/[token]/page.tsx (the SSR resolvePlayerData path) never references the engagement tables', () => {
    const src = readFileSync(path.join(process.cwd(), 'app/selects/[token]/page.tsx'), 'utf8')
    expect(src).not.toContain('selects_track_engagement')
    expect(src).not.toContain('selects_opens')
  })

  it('components/selects-player/SelectsPlayer.tsx (the component the SSR path feeds) never references the engagement tables', () => {
    const src = readFileSync(path.join(process.cwd(), 'components/selects-player/SelectsPlayer.tsx'), 'utf8')
    expect(src).not.toContain('selects_track_engagement')
    expect(src).not.toContain('selects_opens')
  })
})
