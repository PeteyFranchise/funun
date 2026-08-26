import { GET } from '@/app/api/admin/vendor-health/route'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { runVendorHealthChecks } from '@/lib/observability/vendor-health'

// ─── GET /api/admin/vendor-health — gate + ordering coverage (260826-2qm) ─
// Mirrors __tests__/staff-buyer-orgs-api.test.ts's jest.mock route-test
// idiom. The load-bearing assertion is ordering: a refused request must
// invoke zero probes (T-2qm-04).

jest.mock('@/lib/playbook/rooms', () => ({
  requireRoomAccess: jest.fn(),
}))

jest.mock('@/lib/observability/vendor-health', () => ({
  runVendorHealthChecks: jest.fn(),
}))

const mockRequireRoomAccess = requireRoomAccess as jest.MockedFunction<typeof requireRoomAccess>
const mockRunVendorHealthChecks = runVendorHealthChecks as jest.MockedFunction<
  typeof runVendorHealthChecks
>

describe('GET /api/admin/vendor-health', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 with no vendor rows when unauthenticated', async () => {
    mockRequireRoomAccess.mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).not.toHaveProperty('results')
    expect(mockRunVendorHealthChecks).not.toHaveBeenCalled()
  })

  it('returns 403 with no vendor rows when staff lacks it-team access', async () => {
    mockRequireRoomAccess.mockResolvedValue({ error: 'Forbidden', status: 403 })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).not.toHaveProperty('results')
    expect(mockRunVendorHealthChecks).not.toHaveBeenCalled()
  })

  it('returns 200 with results and summary for an authorized caller', async () => {
    mockRequireRoomAccess.mockResolvedValue({
      user: { id: 'staff-1' } as never,
      staffRole: 'it',
    })
    mockRunVendorHealthChecks.mockResolvedValue({
      results: [
        {
          id: 'supabase',
          label: 'Supabase',
          envVar: 'SUPABASE_SERVICE_ROLE_KEY',
          state: 'ok',
          detail: 'Healthy',
          durationMs: 12,
        },
      ],
      summary: { ok: 1, failed: 0, notConfigured: 0, allOk: true, checkedAt: '2026-08-26T00:00:00.000Z' },
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.summary).toMatchObject({ ok: 1, failed: 0 })
    expect(mockRunVendorHealthChecks).toHaveBeenCalledTimes(1)
  })

  it('evaluates the gate before any probe runs — the gate call happens first', async () => {
    let gateCalled = false
    mockRequireRoomAccess.mockImplementation(async () => {
      gateCalled = true
      return { error: 'Unauthorized', status: 401 }
    })
    mockRunVendorHealthChecks.mockImplementation(async () => {
      if (!gateCalled) throw new Error('probe ran before gate')
      return { results: [], summary: { ok: 0, failed: 0, notConfigured: 0, allOk: true, checkedAt: '' } }
    })

    await GET()

    expect(gateCalled).toBe(true)
    expect(mockRunVendorHealthChecks).not.toHaveBeenCalled()
  })
})
