import { GET as reportsGET, POST as reportsPOST } from '@/app/api/reports/route'
import { GET as adminReportsGET } from '@/app/api/admin/reports/route'
import { PATCH as adminReportPATCH } from '@/app/api/admin/reports/[id]/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import * as reportsLib from '@/lib/trust-safety/reports'
import * as adminReportsLib from '@/lib/trust-safety/admin-reports'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({ verifyAdmin: jest.fn() }))

jest.mock('@/lib/trust-safety/reports', () => {
  const actual = jest.requireActual('@/lib/trust-safety/reports')
  return {
    ...actual,
    isReportTargetVisible: jest.fn(),
    findOpenReport: jest.fn(),
  }
})

jest.mock('@/lib/trust-safety/admin-reports', () => {
  const actual = jest.requireActual('@/lib/trust-safety/admin-reports')
  return {
    ...actual,
    applyContentAction: jest.fn(),
    loadReportsForAdmin: jest.fn(),
  }
})

const PROFILE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REPORTER_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function sessionClient(userId: string | null) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn(async () => ({ data: [], error: null })),
      })),
    })),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/reports', () => {
  it('requires authentication', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(null))
    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'profile',
        targetId: PROFILE_UUID,
        reason: 'harassment',
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects an invalid targetType before touching the service client', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(REPORTER_UUID))
    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'not_a_real_target',
        targetId: PROFILE_UUID,
        reason: 'harassment',
      })
    )
    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects self-reporting a profile', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(REPORTER_UUID))
    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'profile',
        targetId: REPORTER_UUID,
        reason: 'harassment',
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 for both a nonexistent target and a not-visible target — identical shape', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(REPORTER_UUID))
    ;(createServiceClient as jest.Mock).mockReturnValue({})
    ;(reportsLib.isReportTargetVisible as jest.Mock).mockResolvedValue(false)

    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'profile',
        targetId: PROFILE_UUID,
        reason: 'harassment',
      })
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Report target not found' })
  })

  it('dedupes: returns the existing open report instead of inserting a duplicate', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(REPORTER_UUID))
    const insertSpy = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => ({ insert: insertSpy })) })
    ;(reportsLib.isReportTargetVisible as jest.Mock).mockResolvedValue(true)
    ;(reportsLib.findOpenReport as jest.Mock).mockResolvedValue({
      id: 'existing-report',
      target_type: 'profile',
      status: 'submitted',
      created_at: '2026-01-01T00:00:00Z',
    })

    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'profile',
        targetId: PROFILE_UUID,
        reason: 'harassment',
      })
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { id: 'existing-report', targetType: 'profile', status: 'submitted', createdAt: '2026-01-01T00:00:00Z' },
    })
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('creates a new report and returns only the reporter-facing status view shape', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(REPORTER_UUID))
    const insertResult = {
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: {
            id: 'new-report',
            target_type: 'profile',
            status: 'submitted',
            created_at: '2026-07-18T00:00:00Z',
          },
          error: null,
        })),
      })),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ insert: jest.fn(() => insertResult) })),
    })
    ;(reportsLib.isReportTargetVisible as jest.Mock).mockResolvedValue(true)
    ;(reportsLib.findOpenReport as jest.Mock).mockResolvedValue(null)

    const res = await reportsPOST(
      jsonRequest('http://t.local/api/reports', {
        targetType: 'profile',
        targetId: PROFILE_UUID,
        reason: 'harassment',
        details: 'Repeated unwanted messages',
      })
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual({
      id: 'new-report',
      targetType: 'profile',
      status: 'submitted',
      createdAt: '2026-07-18T00:00:00Z',
    })
    // Never leaks admin-only fields (reason/details/adminNotes/reviewedBy) —
    // only the four ReportStatusView keys are present.
    expect(Object.keys(body.data).sort()).toEqual(['createdAt', 'id', 'status', 'targetType'])
  })
})

describe('GET /api/reports', () => {
  it('requires authentication', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(sessionClient(null))
    const res = await reportsGET()
    expect(res.status).toBe(401)
  })

  it('returns only id/target_type/status/created_at for the caller (session client + RLS scope)', async () => {
    const client = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: REPORTER_UUID } } })) },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn(async () => ({
            data: [{ id: 'r1', target_type: 'profile', status: 'submitted', created_at: '2026-07-18T00:00:00Z' }],
            error: null,
          })),
        })),
      })),
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(client)

    const res = await reportsGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      { id: 'r1', targetType: 'profile', status: 'submitted', createdAt: '2026-07-18T00:00:00Z' },
    ])
  })
})

describe('GET /api/admin/reports', () => {
  it('rejects non-admins', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await adminReportsGET(new Request('http://t.local/api/admin/reports'))
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid status filter', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    const res = await adminReportsGET(new Request('http://t.local/api/admin/reports?status=bogus'))
    expect(res.status).toBe(400)
  })

  it('returns the enriched queue for a valid filter set', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue({})
    ;(adminReportsLib.loadReportsForAdmin as jest.Mock).mockResolvedValue([
      { id: 'r1', status: 'submitted', reporter: { id: REPORTER_UUID, artist_name: 'Rin', handle: 'rin', avatar_url: null } },
    ])

    const res = await adminReportsGET(
      new Request('http://t.local/api/admin/reports?status=submitted&reason=harassment&targetType=profile')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(adminReportsLib.loadReportsForAdmin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'submitted', reason: 'harassment', targetType: 'profile' })
    )
  })
})

describe('PATCH /api/admin/reports/[id]', () => {
  function serviceWithExisting(existing: unknown, updateResult: unknown) {
    return {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: existing, error: null })) })),
        })),
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: updateResult, error: null })) })),
          })),
        })),
      })),
    }
  }

  it('rejects non-admins', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })
    const res = await adminReportPATCH(jsonRequest('http://t.local/api/admin/reports/r1', { status: 'dismissed' }, 'PATCH'), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(401)
  })

  it('404s when the report does not exist', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(serviceWithExisting(null, null))
    const res = await adminReportPATCH(jsonRequest('http://t.local/api/admin/reports/r1', { status: 'dismissed' }, 'PATCH'), {
      params: Promise.resolve({ id: 'r1' }),
    })
    expect(res.status).toBe(404)
  })

  it('rejects a contentAction unsupported for the report target_type (e.g. profile)', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceWithExisting({ id: 'r1', target_type: 'profile', target_id: PROFILE_UUID, status: 'submitted' }, null)
    )
    const res = await adminReportPATCH(
      jsonRequest('http://t.local/api/admin/reports/r1', { status: 'actioned', contentAction: 'hide' }, 'PATCH'),
      { params: Promise.resolve({ id: 'r1' }) }
    )
    expect(res.status).toBe(400)
    expect(adminReportsLib.applyContentAction).not.toHaveBeenCalled()
  })

  it('routes a supported contentAction through applyContentAction, then updates the report row', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceWithExisting(
        { id: 'r1', target_type: 'green_room_post', target_id: PROFILE_UUID, status: 'submitted' },
        { id: 'r1', status: 'actioned' }
      )
    )
    ;(adminReportsLib.applyContentAction as jest.Mock).mockResolvedValue({ ok: true })

    const res = await adminReportPATCH(
      jsonRequest('http://t.local/api/admin/reports/r1', { status: 'actioned', contentAction: 'hide' }, 'PATCH'),
      { params: Promise.resolve({ id: 'r1' }) }
    )
    expect(res.status).toBe(200)
    expect(adminReportsLib.applyContentAction).toHaveBeenCalledWith(
      expect.anything(),
      'green_room_post',
      PROFILE_UUID,
      'hide'
    )
  })

  it('surfaces a 409 when the content action itself fails', async () => {
    ;(verifyAdmin as jest.Mock).mockResolvedValue({ user: { id: 'admin' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(
      serviceWithExisting({ id: 'r1', target_type: 'green_room_post', target_id: PROFILE_UUID, status: 'submitted' }, null)
    )
    ;(adminReportsLib.applyContentAction as jest.Mock).mockResolvedValue({ ok: false, error: 'update failed' })

    const res = await adminReportPATCH(
      jsonRequest('http://t.local/api/admin/reports/r1', { contentAction: 'remove' }, 'PATCH'),
      { params: Promise.resolve({ id: 'r1' }) }
    )
    expect(res.status).toBe(409)
  })
})
