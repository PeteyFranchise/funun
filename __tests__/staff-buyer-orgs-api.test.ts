import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { createBuyerAccount } from '@/lib/buyers/createBuyerAccount'
import { PATCH as orgPATCH } from '@/app/api/admin/buyer-orgs/[id]/route'
import { PATCH as aePATCH } from '@/app/api/admin/buyer-orgs/[id]/ae/route'
import { GET as orgsGET, POST as orgsPOST } from '@/app/api/admin/buyer-orgs/route'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
  // Faithful-enough getStaffRole for the AE-target validation (review #8):
  // reads app_metadata.staff_role, with the is_admin→leadership fallback.
  getStaffRole: (u: { app_metadata?: { staff_role?: string; is_admin?: boolean } } | null) => {
    const r = u?.app_metadata?.staff_role
    if (r === 'leadership' || r === 'ae' || r === 'bd') return r
    return u?.app_metadata?.is_admin === true ? 'leadership' : null
  },
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/buyers/createBuyerAccount', () => ({
  createBuyerAccount: jest.fn(),
  DuplicateBuyerAccountError: class DuplicateBuyerAccountError extends Error {},
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
  // review #8: the write now chains .eq('id').[.eq('ae_user_id')].select().maybeSingle()
  // — a chainable eq (returns the same builder) terminating in maybeSingle.
  const updateSpy = jest.fn((update: Record<string, unknown>) => {
    const builder: {
      eq: jest.Mock
      select: jest.Mock
    } = {
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
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

// Builds a fake service client covering the buyer_orgs assignment-write
// call shape used by PATCH /api/admin/buyer-orgs/[id]/ae — including the
// prior-ae_user_id select the reassignment-aware route reads BEFORE the
// update (25-09).
function mockAssignService(
  options: { updateError?: { message: string } | null; priorAeUserId?: string | null } = {}
) {
  const { updateError = null, priorAeUserId = null } = options
  const selectSpy = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: { ae_user_id: priorAeUserId }, error: null })),
    })),
  }))
  const updateSpy = jest.fn((update: Record<string, unknown>) => ({
    eq: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: updateError ? null : { id: ORG_UUID, name: 'Acme Co', ...update },
          error: updateError,
        })),
      })),
    })),
  }))
  const auditInsert = jest.fn(async () => ({ error: null }))
  // review #8: the /ae route now validates the target is an active AE/BD via
  // getUserById → getStaffRole; return an 'ae' user so a valid assignment passes.
  const getUserById = jest.fn(
    async (): Promise<{
      data: { user: { app_metadata: Record<string, unknown> } }
      error: null
    }> => ({
      data: { user: { app_metadata: { staff_role: 'ae' } } },
      error: null,
    })
  )
  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    return { select: selectSpy, update: updateSpy }
  })
  return { from, selectSpy, updateSpy, auditInsert, auth: { admin: { getUserById } }, getUserById }
}

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

describe('PATCH /api/admin/buyer-orgs/[id]/ae — leadership-only AE assignment + notify', () => {
  it('returns 403 for an AE/BD caller — assignment is leadership-only (D-03)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('leadership assigning an AE sets ae_user_id, logs assign_ae, and notifies the AE; returns 200', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'assign_ae',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
      changes: { ae_user_id: AE_UUID },
    })
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(AE_UUID)
    expect(payload.type).toBe('ae_assigned')
  })

  it('returns 400 for a non-UUID ae_user_id and writes nothing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: 'not-a-uuid' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('accepts ae_user_id: null (unassign), logs it, and skips the notification', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: null }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: null })
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'assign_ae',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
      changes: { ae_user_id: null },
    })
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('reads the prior ae_user_id before writing, then reassigning from one AE to another notifies BOTH the new and the previous AE', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService({ priorAeUserId: AE_UUID })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: OTHER_AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.selectSpy).toHaveBeenCalled()
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: OTHER_AE_UUID })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(createNotification).toHaveBeenCalledTimes(2)
    const calls = (createNotification as jest.Mock).mock.calls.map(([, payload]) => payload)
    const gained = calls.find(p => p.userId === OTHER_AE_UUID)
    const lost = calls.find(p => p.userId === AE_UUID)
    expect(gained?.type).toBe('ae_assigned')
    expect(lost?.type).toBe('ae_unassigned')
  })

  it('unassigning an org that had a prior AE notifies only the previous AE', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService({ priorAeUserId: AE_UUID })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: null }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: null })
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(AE_UUID)
    expect(payload.type).toBe('ae_unassigned')
  })

  it('reassigning an org to the SAME AE it already has notifies the AE again but not as unassigned', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService({ priorAeUserId: AE_UUID })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(AE_UUID)
    expect(payload.type).toBe('ae_assigned')
  })

  it('returns 401 when there is no session', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(401)
  })

  it('rejects assigning a Client Partner to a non-AE/BD target — 400, no write (review #8)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const service = mockAssignService()
    // target is an artist (no staff_role) → getStaffRole null → rejected before any write
    service.getUserById.mockResolvedValue({
      data: { user: { app_metadata: { member_type: 'artist' } } },
      error: null,
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await aePATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })
})

// Builds a fake service client for GET /api/admin/buyer-orgs — an
// awaitable/chainable buyer_orgs query (supports .eq() being appended for
// non-leadership scoping, mirroring supabase-js's PostgrestFilterBuilder
// shape) plus a per-org buyer_members count lookup.
function mockListService(orgs: Array<{ id: string; name: string; ae_user_id: string | null }>) {
  let filtered = orgs
  const eqSpy = jest.fn((col: string, val: string) => {
    filtered = filtered.filter(r => (r as Record<string, unknown>)[col] === val)
    return builder
  })
  const builder: {
    eq: typeof eqSpy
    then: (resolve: (v: { data: typeof orgs; error: null }) => void) => void
  } = {
    eq: eqSpy,
    then: resolve => resolve({ data: filtered, error: null }),
  }
  const orderSpy = jest.fn(() => builder)
  const selectSpy = jest.fn(() => ({ order: orderSpy }))
  const memberCountEq = jest.fn(async () => ({ count: 0 }))
  const memberSelectSpy = jest.fn(() => ({ eq: memberCountEq }))
  const from = jest.fn((table: string) => {
    if (table === 'buyer_members') return { select: memberSelectSpy }
    return { select: selectSpy }
  })
  return { from, selectSpy, orderSpy, eqSpy }
}

function mockCreateOrgService() {
  const insertSpy = jest.fn(() => ({
    select: jest.fn(() => ({
      single: jest.fn(async () => ({
        data: { id: ORG_UUID, name: 'Acme Co', is_personal: false, verified: false, created_at: '2026-01-01' },
        error: null,
      })),
    })),
  }))
  const from = jest.fn((table: string) => {
    if (table === 'buyer_orgs') return { insert: insertSpy }
    return {}
  })
  return { from, insertSpy }
}

describe('POST /api/admin/buyer-orgs — widened staff-create gate', () => {
  it('succeeds for an AE caller (was 403 under verifyAdmin) and logs create_buyer_account', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: AE_UUID },
      staffRole: 'ae',
    })
    const service = mockCreateOrgService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: 'new-admin-id', emailSent: true })

    const res = await orgsPOST(
      jsonRequest(
        'http://t.local/api/admin/buyer-orgs',
        { org_name: 'Acme Co', admin_email: 'admin@acme.test', admin_display_name: 'Admin' },
        'POST'
      )
    )

    expect(res.status).toBe(201)
    // two audit events now: the company creation (#9) then the first-admin invite
    expect(logStaffAction).toHaveBeenCalledTimes(2)
    // #9/#12: the buyer_org creation is audited immediately, and an AE creator is
    // auto-assigned (ae_user_id) so the new company stays in their scoped queue.
    expect(logStaffAction).toHaveBeenNthCalledWith(1, service, {
      actorId: AE_UUID,
      action: 'create_buyer_org',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
      changes: { name: 'Acme Co', ae_user_id: AE_UUID },
    })
    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: AE_UUID,
      action: 'create_buyer_account',
      targetType: 'buyer_org',
      targetId: ORG_UUID,
    })
  })

  it('succeeds for a BD caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: OTHER_AE_UUID },
      staffRole: 'bd',
    })
    const service = mockCreateOrgService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createBuyerAccount as jest.Mock).mockResolvedValue({ userId: 'new-admin-id', emailSent: true })

    const res = await orgsPOST(
      jsonRequest(
        'http://t.local/api/admin/buyer-orgs',
        { org_name: 'Acme Co', admin_email: 'admin@acme.test', admin_display_name: 'Admin' },
        'POST'
      )
    )

    expect(res.status).toBe(201)
  })

  it('returns 401 with no session', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await orgsPOST(
      jsonRequest('http://t.local/api/admin/buyer-orgs', { org_name: 'X' }, 'POST')
    )

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/buyer-orgs — scoped listing for non-leadership', () => {
  it('returns all orgs for leadership, unscoped', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: LEADERSHIP_UUID },
      staffRole: 'leadership',
    })
    const orgs = [
      { id: 'org-1', name: 'Org One', ae_user_id: AE_UUID },
      { id: 'org-2', name: 'Org Two', ae_user_id: null },
    ]
    const service = mockListService(orgs)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgsGET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(service.eqSpy).not.toHaveBeenCalled()
  })

  it('scopes the list to ae_user_id === caller for a non-leadership caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({
      user: { id: AE_UUID },
      staffRole: 'ae',
    })
    const orgs = [
      { id: 'org-1', name: 'Org One', ae_user_id: AE_UUID },
      { id: 'org-2', name: 'Org Two', ae_user_id: OTHER_AE_UUID },
    ]
    const service = mockListService(orgs)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await orgsGET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(service.eqSpy).toHaveBeenCalledWith('ae_user_id', AE_UUID)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('org-1')
  })

  it('returns 401 with no session', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await orgsGET()

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
