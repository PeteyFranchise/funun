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
    // IN-01: the (current max + 1) sort_order lookup on POST — null means
    // "table is empty" (no existing stages).
    maxSortRow?: { sort_order: number } | null
    // WR-04: buyer_orgs rows that referenced the stage being deleted, and
    // whether the stage_entered_at cleanup update should error.
    affectedOrgRows?: { id: string }[]
    clearError?: { message: string } | null
  } = {}
) {
  const {
    rows = [{ id: STAGE_UUID, key: 'new_lead', label: 'New lead', sort_order: 1, is_terminal: false }],
    insertResult = null,
    insertError = null,
    updateError = null,
    maxSortRow = null,
    affectedOrgRows = [],
    clearError = null,
  } = options

  // pipeline_stages .select(...).order(...) — GET's listing chain resolves
  // directly; POST's IN-01 max-sort-order chain continues with
  // .limit(1).maybeSingle().
  const maxSortMaybeSingle = jest.fn(async () => ({ data: maxSortRow, error: null }))
  const maxSortLimit = jest.fn(() => ({ maybeSingle: maxSortMaybeSingle }))
  const selectSpy = jest.fn(() => ({
    order: jest.fn((_col: string, opts?: { ascending?: boolean }) => {
      if (opts?.ascending === false) return { limit: maxSortLimit }
      return Promise.resolve({ data: rows, error: null })
    }),
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

  // buyer_orgs — WR-04 affected-rows lookup + stage_entered_at cleanup.
  const orgsSelectEqSpy = jest.fn(async () => ({ data: affectedOrgRows, error: null }))
  const orgsSelectSpy = jest.fn(() => ({ eq: orgsSelectEqSpy }))
  const orgsClearNotSpy = jest.fn(async () => ({ error: clearError }))
  const orgsClearInSpy = jest.fn(() => ({ not: orgsClearNotSpy }))
  const orgsUpdateSpy = jest.fn(() => ({ in: orgsClearInSpy }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    if (table === 'buyer_orgs') return { select: orgsSelectSpy, update: orgsUpdateSpy }
    return { select: selectSpy, insert: insertSpy, update: updateSpy, delete: deleteSpy }
  })

  return {
    from,
    selectSpy,
    insertSpy,
    updateSpy,
    deleteSpy,
    auditInsert,
    orgsSelectSpy,
    orgsSelectEqSpy,
    orgsUpdateSpy,
    orgsClearInSpy,
    orgsClearNotSpy,
  }
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

describe('POST /api/admin/pipeline-stages — IN-01 sort_order default', () => {
  it('defaults sort_order to (current max + 1) when not supplied', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ maxSortRow: { sort_order: 2 } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { key: 'follow_up', label: 'Follow up' }, 'POST')
    )

    expect(res.status).toBe(200)
    expect(service.insertSpy).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 3 }))
  })

  it('defaults sort_order to 0 for the first stage when the table is empty', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ maxSortRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { key: 'first', label: 'First' }, 'POST')
    )

    expect(res.status).toBe(200)
    expect(service.insertSpy).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 0 }))
  })

  it('still honors an explicit sort_order and never queries the max', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest(
        'http://t.local/api/admin/pipeline-stages',
        { key: 'explicit', label: 'Explicit', sort_order: 9 },
        'POST'
      )
    )

    expect(res.status).toBe(200)
    expect(service.insertSpy).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 9 }))
    expect(service.selectSpy).not.toHaveBeenCalled()
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

  it('does not touch buyer_orgs when no org referenced the deleted stage', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ affectedOrgRows: [] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID }, 'DELETE')
    )

    expect(res.status).toBe(200)
    expect(service.orgsSelectEqSpy).toHaveBeenCalledTimes(1)
    expect(service.orgsUpdateSpy).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/pipeline-stages — WR-04 stale stage_entered_at cleanup', () => {
  it('captures affected org ids before delete and clears their stage_entered_at after', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ affectedOrgRows: [{ id: 'org-1' }, { id: 'org-2' }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID }, 'DELETE')
    )

    expect(res.status).toBe(200)
    expect(service.orgsSelectSpy).toHaveBeenCalledTimes(1)
    expect(service.orgsSelectEqSpy).toHaveBeenCalledWith('pipeline_stage_id', STAGE_UUID)
    expect(service.orgsUpdateSpy).toHaveBeenCalledWith({ stage_entered_at: null })
    expect(service.orgsClearInSpy).toHaveBeenCalledWith('id', ['org-1', 'org-2'])
    expect(service.deleteSpy).toHaveBeenCalledTimes(1)
  })

  it('returns 500 and never audits when the stage_entered_at cleanup fails', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({
      affectedOrgRows: [{ id: 'org-1' }],
      clearError: { message: 'cleanup failed' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await DELETE(
      jsonRequest('http://t.local/api/admin/pipeline-stages', { id: STAGE_UUID }, 'DELETE')
    )

    expect(res.status).toBe(500)
    expect(logStaffAction).not.toHaveBeenCalled()
  })
})
