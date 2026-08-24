import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { GET, PATCH } from './route'

// ─── GET/PATCH /api/admin/health-rules (31.1 plan 05, Task 1, D-31.1-03) ──
// Colocated route test, mirrors app/api/admin/buyer-orgs/[id]/route.test.ts's
// admin-route conventions (fake chainable service, requireStaff mocked).
// Covers: leadership-only 403s, threshold-ordering 400 (no write), the
// mass-assignment allowlist silently dropping unknown fields, and a
// successful PATCH writing only allowlisted fields + updated_by + audit.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return { ...actual, requireStaff: jest.fn() }
})

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const DEFAULT_CONFIG_ROW = {
  id: 1,
  good_within_days: 90,
  warning_after_days: 120,
  at_risk_after_days: 180,
  cold_after_days: 365,
  keep_warm_open_brief: true,
  keep_warm_open_deal: true,
  keep_warm_recent_selects: true,
  recent_selects_days: 21,
  keep_warm_recent_contact: false,
  recent_contact_days: 30,
  prospect_image_url: null,
  updated_by: null,
  updated_at: '2026-08-01T00:00:00.000Z',
}

function jsonRequest(url: string, body: unknown, method = 'PATCH') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(
  options: {
    configRow?: Record<string, unknown> | null
    updateError?: { message: string } | null
  } = {}
) {
  const { configRow = { ...DEFAULT_CONFIG_ROW }, updateError = null } = options
  let currentRow = configRow ? { ...configRow } : null

  const selectSpy = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: currentRow, error: null })),
    })),
  }))

  const updateSpy = jest.fn((patch: Record<string, unknown>) => ({
    eq: jest.fn(() => ({
      select: jest.fn(() => ({
        maybeSingle: jest.fn(async () => {
          if (updateError) return { data: null, error: updateError }
          currentRow = { ...currentRow, ...patch }
          return { data: currentRow, error: null }
        }),
      })),
    })),
  }))

  const auditInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    return { select: selectSpy, update: updateSpy }
  })

  return { from, selectSpy, updateSpy, auditInsert }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('GET /api/admin/health-rules', () => {
  it('returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    expect(res.status).toBe(403)
    expect(service.selectSpy).not.toHaveBeenCalled()
  })

  it('returns the singleton config for leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.good_within_days).toBe(90)
    expect(body.data.cold_after_days).toBe(365)
  })
})

describe('PATCH /api/admin/health-rules', () => {
  it('returns 403 for a non-leadership caller and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/health-rules', { good_within_days: 90 })
    )
    expect(res.status).toBe(403)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('succeeds with valid ordered thresholds, writes only allowlisted fields + updated_by, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/health-rules', {
        good_within_days: 90,
        warning_after_days: 120,
        at_risk_after_days: 180,
        cold_after_days: 365,
      })
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledTimes(1)
    const patch = service.updateSpy.mock.calls[0][0]
    expect(patch).toEqual({
      good_within_days: 90,
      warning_after_days: 120,
      at_risk_after_days: 180,
      cold_after_days: 365,
      updated_by: LEADERSHIP_UUID,
    })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('rejects a misordered threshold (warning <= good) with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/health-rules', {
        good_within_days: 120,
        warning_after_days: 90,
      })
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('ignores an unknown/extra field — it is never persisted', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/health-rules', {
        good_within_days: 100,
        prospect_image_url: 'https://evil.example/hijack.png',
        evil_field: 'nope',
      })
    )

    expect(res.status).toBe(200)
    const patch = service.updateSpy.mock.calls[0][0]
    expect(patch).toEqual({ good_within_days: 100, updated_by: LEADERSHIP_UUID })
    expect(patch).not.toHaveProperty('prospect_image_url')
    expect(patch).not.toHaveProperty('evil_field')
  })
})
