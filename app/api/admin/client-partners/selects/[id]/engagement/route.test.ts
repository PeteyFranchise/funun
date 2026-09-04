import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { loadSelectsInScope } from '@/lib/selects/persistence'
import { GET } from './route'

// ─── GET /api/admin/client-partners/selects/[id]/engagement ────────────────
// (31.2 plan 10, Task 1, R13/D-31.2-13/14). Mirrors app/api/admin/
// client-partners/[orgId]/game-plan/route.test.ts's mocking conventions.
// Covers: the aggregation matches lib/selects/engagement.ts (>=30s -> one
// qualified listen, replay distinct), an out-of-book Selects -> 404 (never
// a raw-row read), and the response is staff-shaped (no viewer_key leaks).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/selects/persistence', () => ({
  loadSelectsInScope: jest.fn(),
}))

const AE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SELECTS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const TRACK_ROW_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const TRACK_ID = '11111111-1111-1111-1111-111111111111'

function paramsFor(id = SELECTS_ID) {
  return { params: Promise.resolve({ id }) }
}

function mockService(options: {
  trackRows?: { id: string; track_id: string }[]
  titleRows?: { id: string; title: string | null }[]
  summaryRows?: {
    selects_id: string
    selects_track_id: string | null
    audible_seconds: number
    qualified_listens: number
    replay_count: number
    opens: number
  }[]
  opensCount?: number
} = {}) {
  const {
    trackRows = [{ id: TRACK_ROW_ID, track_id: TRACK_ID }],
    titleRows = [{ id: TRACK_ID, title: 'Test Track' }],
    summaryRows = [],
    opensCount = 0,
  } = options

  const from = jest.fn((table: string) => {
    if (table === 'selects_tracks') {
      return {
        select: () => ({
          eq: () => ({
            is: async () => ({ data: trackRows, error: null }),
          }),
        }),
      }
    }
    if (table === 'tracks') {
      return {
        select: () => ({
          in: async () => ({ data: titleRows, error: null }),
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  const rpc = jest.fn().mockResolvedValue({
    data: summaryRows.map(row => ({ ...row, opens: row.opens || opensCount })),
    error: null,
  })

  return { from, rpc }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_ID }, staffRole: 'ae' })
})

describe('GET /api/admin/client-partners/selects/[id]/engagement', () => {
  it('returns 404 for an out-of-book Selects, never reading raw rows', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue(null)
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(new Request('http://t.local'), paramsFor())

    expect(res.status).toBe(404)
    expect(service.from).not.toHaveBeenCalled()
  })

  it('aggregates >=30s audible seconds into exactly one qualified listen, with replays counted distinctly', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, buyer_org_id: 'org-1' })
    const summaryRows = [
      {
        selects_id: SELECTS_ID,
        selects_track_id: TRACK_ROW_ID,
        audible_seconds: 45,
        qualified_listens: 1,
        replay_count: 2,
        opens: 0,
      },
    ]
    const service = mockService({ summaryRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(new Request('http://t.local'), paramsFor())
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.data.tracks).toHaveLength(1)
    const trackReadout = json.data.tracks[0]
    expect(trackReadout.selectsTrackId).toBe(TRACK_ROW_ID)
    expect(trackReadout.title).toBe('Test Track')
    expect(trackReadout.audibleSeconds).toBe(45)
    // one viewer crosses the >=30s threshold -> exactly one qualified listen,
    // never multiplied by the two 'ended' events also present for that viewer.
    expect(trackReadout.qualifiedListens).toBe(1)
    expect(trackReadout.replayCount).toBe(2)

    expect(json.data.summary).toEqual({
      audibleSeconds: 45,
      qualifiedListens: 1,
      replayCount: 2,
      trackCount: 1,
    })
  })

  it('is staff-shaped — the response never leaks a viewer_key', async () => {
    ;(loadSelectsInScope as jest.Mock).mockResolvedValue({ id: SELECTS_ID, buyer_org_id: 'org-1' })
    const service = mockService({
      summaryRows: [{
        selects_id: SELECTS_ID,
        selects_track_id: TRACK_ROW_ID,
        audible_seconds: 5,
        qualified_listens: 0,
        replay_count: 0,
        opens: 3,
      }],
      opensCount: 3,
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(new Request('http://t.local'), paramsFor())
    const json = await res.json()

    expect(JSON.stringify(json)).not.toContain('viewer_key')
    expect(JSON.stringify(json)).not.toContain('secret-viewer')
    expect(json.data.opens).toBe(3)
    expect(requireStaff).toHaveBeenCalledTimes(1)
  })
})
