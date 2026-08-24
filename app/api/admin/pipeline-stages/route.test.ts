import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { GET, POST, PATCH, DELETE } from './route'

// ─── /api/admin/pipeline-stages (31.1 plan 05, Task 1, D-10) ──────────────
// Leadership-only stage CRUD. Colocated route test, mirrors
// app/api/admin/buyer-orgs/[id]/route.test.ts's fake-chainable-service
// convention. Covers: 403 on all four handlers for non-leadership, the
// KEY_REGEX rejection on POST, and the field allowlist on PATCH.

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
const STAGE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function jsonRequest(url: string, body: unknown, method: string) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(
  options: {
    rows?: Record<string, unknown>[]
    insertResult?: Record<string, unknown> | null
    insertError?: { message: string } | null
    updateError?: { message: string } | null
  } = {}
) {
  const {
    rows = [{ id: STAGE_UUID, key: 'new_lead', label: 'New lead', sort_order: 1, is_terminal: false }],
    insertResult = null,
    insertError = null,
    updateError = null,
  } = options

  const selectSpy = jest.fn(() => ({
    order: jest.fn(async () => ({ data: rows, error: null })),
  }))

  const insertSpy = jest.fn((payload: Record<string, unknown>) => ({
    select: jest.fn(() => ({
      single: jest.fn(async () => ({
        data: insertError ? null : (insertResult ?? { id: STAGE_UUID, ...payload }),
        error: insertError,
      })),
    })),
  }))

  const updateSpy = jest.fn((patch: Record<string, unknown>) => ({
    eq: jest.fn(() => ({
      select: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({
          data: updateError ? null : { id: STAGE_UUID, ...patch },
          error: updateError,
        })),
      })),
    })),
  }))

  const deleteSpy = jest.fn(() => ({
    eq: jest.fn(async () => ({ error: null })),
  }))

  const auditInsert = jest.fn(async () => ({ error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    return { select: selectSpy, insert: insertSpy, update: updateSpy, delete: deleteSpy }
  })

  return { from, selectSpy, insertSpy, updateSpy, deleteSpy, auditInsert }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('pipeline-stages — leadership-only gate', () => {
  it('GET returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())

    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('POST returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())

    const res = await POST(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { key: 'follow_up', label: 'Follow up' }, 'POST')
    )
    expect(res.status).toBe(403)
  })

  it('PATCH returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())

    const res = await PATCH(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID, label: 'New' }, 'PATCH')
    )
    expect(res.status).toBe(403)
  })

  it('DELETE returns 403 for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    ;(createServiceClient as jest.Mock).mockReturnValue(mockService())

    const res = await DELETE(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID }, 'DELETE')
    )
    expect(res.status).toBe(403)
  })
})

describe('GET /api/admin/pipeline-stages', () => {
  it('lists stages ordered for leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].key).toBe('new_lead')
  })
})

describe('POST /api/admin/pipeline-stages — KEY_REGEX', () => {
  it('rejects an uppercase/space key with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/pipeline-stages',
        { key: 'Follow Up', label: 'Follow up' },
        'POST'
      )
    )

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('accepts a valid lowercase/underscore key and creates the stage', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/pipeline-stages',
        { key: 'follow_up', label: 'Follow up', sort_order: 6 },
        'POST'
      )
    )

    expect(res.status).toBe(200)
    expect(service.insertSpy).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/admin/pipeline-stages — field allowlist', () => {
  it('writes only allowlisted fields, dropping unknown keys', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(
        'http://t.local/api/admin/pipeline-stages',
        { id: STAGE_UUID, label: 'Renamed', evil_field: 'nope', buyer_org_id: 'hijack' },
        'PATCH'
      )
    )

    expect(res.status).toBe(200)
    const patch = service.updateSpy.mock.calls[0][0]
    expect(patch).toEqual({ label: 'Renamed' })
    expect(patch).not.toHaveProperty('evil_field')
    expect(patch).not.toHaveProperty('buyer_org_id')
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('rejects an uppercase/space key on rename with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(
        'http://t.local/api/admin/pipeline-stages',
        { id: STAGE_UUID, key: 'Bad Key' },
        'PATCH'
      )
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/pipeline-stages', () => {
  it('deletes the stage and audits for leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID }, 'DELETE')
    )

    expect(res.status).toBe(200)
    expect(service.deleteSpy).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })
})
