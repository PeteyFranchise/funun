import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { PATCH as orgPATCH } from '@/app/api/admin/buyer-orgs/[id]/route'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const AE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OTHER_AE_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ORG_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function jsonRequest(url: string, body: unknown, method = 'PATCH') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Builds a fake service client covering the buyer_orgs select-for-scope-check
// and update-and-return call shapes used by PATCH /api/admin/buyer-orgs/[id].
function mockService(options: {
  orgRow?: { id: string; ae_user_id: string | null } | null
  updateError?: { message: string } | null
} = {}) {
  const { orgRow = null, updateError = null } = options
  const selectSpy = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: orgRow, error: null })),
    })),
  }))
  const updateSpy = jest.fn((update: Record<string, unknown>) => ({
    eq: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: updateError ? null : { id: ORG_UUID, name: 'Fallback Org', ...update },
          error: updateError,
        })),
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

describe('PATCH /api/admin/buyer-orgs/[id] — scoped, allowlisted, audited edit', () => {
  it('lets leadership edit name on any org, logs the action, returns 200', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'New Name' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('New Name')
    // Leadership never needs the assignment-scope select.
    expect(service.selectSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).toHaveBeenCalledWith({ name: 'New Name' })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'edit_buyer_org',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
      changes: { name: 'New Name' },
    })
  })

  it('lets an AE edit name on an org they are assigned to, logs, returns 200', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: AE_UUID },
      staffRole: 'ae',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: AE_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'Renamed Co' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.selectSpy).toHaveBeenCalled()
    expect(service.updateSpy).toHaveBeenCalledWith({ name: 'Renamed Co' })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('returns 404 (not 403) for an AE editing an org they are not assigned to, writes nothing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: OTHER_AE_UUID },
      staffRole: 'ae',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: AE_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'Hijack' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 404 for an AE editing a nonexistent org (existence not leaked)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: AE_UUID },
      staffRole: 'ae',
    })
    const service = mockService({ orgRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'Ghost' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('never writes non-allowlisted fields (verified, ae_user_id, is_personal)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, {
        name: 'Clean Name',
        verified: true,
        ae_user_id: OTHER_AE_UUID,
        is_personal: true,
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    const writtenUpdate = service.updateSpy.mock.calls[0][0]
    expect(Object.keys(writtenUpdate)).toEqual(['name'])
    expect(writtenUpdate).not.toHaveProperty('verified')
    expect(writtenUpdate).not.toHaveProperty('ae_user_id')
    expect(writtenUpdate).not.toHaveProperty('is_personal')
  })

  it('returns 400 for an empty/no-valid-fields body, never touches the service client write', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { verified: true }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-staff caller, never touches the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'X' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 401 when there is no session', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await orgPATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'X' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(401)
  })
})
