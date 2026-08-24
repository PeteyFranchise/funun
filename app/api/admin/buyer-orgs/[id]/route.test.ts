import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { PATCH } from './route'

// ─── PATCH /api/admin/buyer-orgs/[id] — status transition (23-06 Task 1) ───
// Colocated route test, mirroring __tests__/staff-buyer-orgs-api.test.ts's
// admin-route conventions (same mockService shape). Covers this task's four
// behaviors: status transition + audit, invalid-status 400 (no write),
// unchanged scope-denial 404, and unchanged name-edit behavior.

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

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(
  options: {
    orgRow?: { id: string; ae_user_id: string | null; pipeline_stage_id?: string | null } | null
    updateError?: { message: string } | null
  } = {}
) {
  const { orgRow = null, updateError = null } = options
  const selectSpy = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: orgRow, error: null })),
    })),
  }))
  // review #8: the write now chains .eq('id').[.eq('ae_user_id')].select().maybeSingle()
  // — a chainable eq (returns the same builder) terminating in maybeSingle.
  const updateSpy = jest.fn((update: Record<string, unknown>) => {
    const builder: { eq: jest.Mock; select: jest.Mock } = {
      eq: jest.fn(() => builder),
      select: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({
          data: updateError ? null : { id: ORG_UUID, name: 'Fallback Org', ...update },
          error: updateError,
        })),
      })),
    }
    return builder
  })
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

describe('PATCH /api/admin/buyer-orgs/[id] — status transition', () => {
  it('lets staff flip status to active on an assigned org, writes it, and audits the change', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: AE_UUID },
      staffRole: 'ae',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: AE_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { status: 'active' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.status).toBe('active')
    expect(service.updateSpy).toHaveBeenCalledWith({ status: 'active' })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: AE_UUID,
      action: 'edit_buyer_org',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
      changes: { status: 'active' },
    })
  })

  it('rejects an invalid status with 400 and never writes to the DB', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { status: 'churned' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('still returns 404 (not 403) for an AE not assigned to the org, writes nothing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: OTHER_AE_UUID },
      staffRole: 'ae',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: AE_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { status: 'active' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('still allows editing name (existing behavior preserved)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { name: 'Renamed Co' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('Renamed Co')
    expect(service.updateSpy).toHaveBeenCalledWith({ name: 'Renamed Co' })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })
})

// ─── PATCH /api/admin/buyer-orgs/[id] — pipeline_stage_id (31.1 plan 04, D-10) ──
const STAGE_A_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const STAGE_B_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

describe('PATCH /api/admin/buyer-orgs/[id] — pipeline_stage_id', () => {
  it('rejects a non-UUID pipeline_stage_id with 400 and never writes to the DB', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: null, pipeline_stage_id: STAGE_A_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { pipeline_stage_id: 'not-a-uuid' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('stamps stage_entered_at when pipeline_stage_id actually changes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: null, pipeline_stage_id: STAGE_A_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { pipeline_stage_id: STAGE_B_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledTimes(1)
    const patch = service.updateSpy.mock.calls[0][0]
    expect(patch.pipeline_stage_id).toBe(STAGE_B_UUID)
    expect(typeof patch.stage_entered_at).toBe('string')
  })

  it('does NOT stamp stage_entered_at when pipeline_stage_id is unchanged (no-op resubmit)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockService({ orgRow: { id: ORG_UUID, ae_user_id: null, pipeline_stage_id: STAGE_A_UUID } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}`, { pipeline_stage_id: STAGE_A_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    const patch = service.updateSpy.mock.calls[0][0]
    expect(patch.pipeline_stage_id).toBe(STAGE_A_UUID)
    expect(patch.stage_entered_at).toBeUndefined()
  })
})
