import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { buildEngagementRollup } from '@/lib/selects/engagement-rollup'
import { GET } from './route'

// ─── GET /api/admin/client-partners/engagement-rollup ───────────────────────
// (31.2 plan 10, Task 2, R13/D-31.2-13/14/T-31.2-27). Machine-verifies the
// leadership-only gate: a non-leadership caller never reaches
// buildEngagementRollup at all (never a 200 with partial/filtered data —
// the aggregation itself is unreachable), mirroring the hide-not-filter
// discipline lib/admin/gate.test.ts's D-31.1-01 suite already covers for
// loadWholeBookWithCoverage.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  verifyAdmin: jest.fn(),
}))

jest.mock('@/lib/selects/engagement-rollup', () => ({
  buildEngagementRollup: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/admin/client-partners/engagement-rollup', () => {
  it('returns 403 for a non-leadership caller and never calls buildEngagementRollup', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await GET()

    expect(res.status).toBe(403)
    expect(buildEngagementRollup).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 401 for an unauthenticated caller and never calls buildEngagementRollup', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await GET()

    expect(res.status).toBe(401)
    expect(buildEngagementRollup).not.toHaveBeenCalled()
  })

  it('calls buildEngagementRollup exactly once and returns its data for leadership', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'lead-1' } })
    const service = { from: jest.fn() }
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const rollupData = { byAe: [{ aeId: 'ae-1', aeName: 'Jordan', audibleSeconds: 90, qualifiedListens: 2, replayCount: 1, opens: 4, selects: [] }] }
    ;(buildEngagementRollup as jest.Mock).mockResolvedValue(rollupData)

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(buildEngagementRollup).toHaveBeenCalledTimes(1)
    expect(buildEngagementRollup).toHaveBeenCalledWith(service)
    expect(json.data).toEqual(rollupData)
  })
})
