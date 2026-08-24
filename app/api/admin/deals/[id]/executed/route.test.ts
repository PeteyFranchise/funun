import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { POST } from './route'

// ─── POST /api/admin/deals/[id]/executed — D-31.1-09 stamping seam ─────────
// Colocated route test mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// mockService shape. Covers the gate (403 for non-admin), the idempotent
// stamp (a second call never moves the date), and that the write touches
// ONLY executed_at — never `stage` — proving this route is a distinct
// action from the closed_won deal-stage transition.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  verifyAdmin: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const DEAL_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function jsonRequest() {
  return new Request(`http://t.local/api/admin/deals/${DEAL_UUID}/executed`, { method: 'POST' })
}

/**
 * A tiny in-memory license_requests row + audit log, enough to exercise
 * lib/deals/executed.ts's stampLicenseExecuted through the real route
 * handler (no mocking of the helper itself — this is an integration test
 * of the route + helper together).
 */
function mockService(initialRow: { id: string; executed_at: string | null } | null) {
  let row = initialRow ? { ...initialRow } : null
  const capturedPatches: Record<string, unknown>[] = []
  const auditInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }

    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row ? { ...row } : null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        capturedPatches.push(patch)
        return {
          eq: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => {
                  if (!row || row.executed_at) {
                    // WHERE executed_at IS NULL excluded this row.
                    return { data: null, error: null }
                  }
                  row = { ...row, ...patch }
                  return { data: { executed_at: row.executed_at }, error: null }
                },
              }),
            }),
          }),
        }
      },
    }
  })

  return { from, auditInsert, capturedPatches, getRow: () => row }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/admin/deals/[id]/executed', () => {
  it('returns 403 for a non-leadership caller and never touches the database', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService({ id: DEAL_UUID, executed_at: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })

    expect(res.status).toBe(403)
    expect(service.from).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 401 when there is no session', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })
    const service = mockService({ id: DEAL_UUID, executed_at: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when the deal does not exist', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService(null)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('stamps executed_at on the first call, writing ONLY that column (never stage)', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService({ id: DEAL_UUID, executed_at: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.alreadyExecuted).toBe(false)
    expect(typeof body.data.executedAt).toBe('string')
    expect(service.capturedPatches).toEqual([{ executed_at: body.data.executedAt }])
    expect(Object.keys(service.capturedPatches[0])).not.toContain('stage')
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'stamp_license_executed',
      targetType: 'license_request',
      targetId: DEAL_UUID,
      changes: { executed_at: body.data.executedAt },
    })
  })

  it('is idempotent — a second POST leaves executed_at unchanged and reports alreadyExecuted', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID } })
    const service = mockService({ id: DEAL_UUID, executed_at: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const first = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })
    const firstBody = await first.json()
    expect(firstBody.data.alreadyExecuted).toBe(false)

    const second = await POST(jsonRequest(), { params: Promise.resolve({ id: DEAL_UUID }) })
    const secondBody = await second.json()

    expect(secondBody.data.executedAt).toBe(firstBody.data.executedAt)
    expect(secondBody.data.alreadyExecuted).toBe(true)
    // Only the first call's write actually landed a patch on the row.
    expect(service.getRow()?.executed_at).toBe(firstBody.data.executedAt)
  })
})
