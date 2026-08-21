import { GET as staffGET, POST as staffPOST } from '@/app/api/admin/staff/route'
import { PATCH as staffPATCH, DELETE as staffDELETE } from '@/app/api/admin/staff/[id]/route'
import { POST as staffRESEND } from '@/app/api/admin/staff/[id]/resend/route'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'
import { logStaffAction } from '@/lib/staff/audit'
import { sendEmail } from '@/lib/email'

jest.mock('@/lib/supabase/server', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return { ...actual, requireStaff: jest.fn() }
})
jest.mock('@/lib/staff/createStaffAccount', () => {
  class DuplicateStaffAccountError extends Error {}
  return { createStaffAccount: jest.fn(), DuplicateStaffAccountError }
})
jest.mock('@/lib/staff/audit', () => ({ logStaffAction: jest.fn(async () => ({ ok: true })) }))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn(async () => ({ ok: true })) }))
jest.mock('@/lib/email/staffInvite', () => ({
  staffInviteEmail: () => ({ subject: 'Invite', html: '<p>hi</p>' }),
}))

const LEADER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const NEW_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_LEADER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const asManager = () =>
  (requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })

// Service mock covering every funun_staff shape the [id] routes use:
//   .select('user_id').contains('staff_roles', ['leadership'])  → the last-leadership guard
//   .select(COLS).eq('user_id', id).maybeSingle()               → the post-write row read
//   .update({...}).eq('user_id', id)                            → the display-copy write
function buildService(opts: {
  leaders?: string[]
  tableErr?: unknown
  email?: string | null
} = {}) {
  const leaders = (opts.leaders ?? [LEADER_ID, NEW_USER_ID]).map(id => ({ user_id: id }))
  const updateUserById = jest.fn(async () => ({ error: null }))
  const deleteUser = jest.fn(async () => ({ error: null }))
  const getUserById = jest.fn(async () => ({
    data: opts.email === null ? { user: null } : { user: { email: opts.email ?? 'x@funun.studio', user_metadata: {} } },
  }))
  const generateLink = jest.fn(async () => ({
    data: { properties: { action_link: 'https://funun.studio/magic' } },
    error: null,
  }))
  const fununUpdateEq = jest.fn(async () => ({ error: opts.tableErr ?? null }))
  const fununUpdate = jest.fn(() => ({ eq: fununUpdateEq }))
  const contains = jest.fn(async () => ({ data: leaders, error: null }))
  const maybeSingle = jest.fn(async () => ({
    data: { id: '1', user_id: NEW_USER_ID, staff_role: 'bd', staff_roles: ['bd'], display_name: 'BD Person' },
    error: null,
  }))
  const select = jest.fn(() => ({ contains, eq: jest.fn(() => ({ maybeSingle })) }))
  const from = jest.fn(() => ({ select, update: fununUpdate }))
  return {
    auth: { admin: { updateUserById, deleteUser, getUserById, generateLink } },
    from,
    updateUserById,
    deleteUser,
    getUserById,
    generateLink,
    fununUpdate,
    fununUpdateEq,
    contains,
  }
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/admin/staff', () => {
  it('403s a non-manager caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    expect((await staffGET()).status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns the staff list (column-explicit, incl. staff_roles) for a manager', async () => {
    asManager()
    const selectSpy = jest.fn(() => ({
      order: jest.fn(async () => ({
        data: [{ id: '1', user_id: NEW_USER_ID, staff_role: 'ae', staff_roles: ['ae'], display_name: 'AE' }],
        error: null,
      })),
    }))
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ select: selectSpy })),
      auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'ae@funun.studio' } } })) } },
    })
    const res = await staffGET()
    expect(res.status).toBe(200)
    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('staff_roles'))
    const body = await res.json()
    expect(body.data[0].email).toBe('ae@funun.studio')
  })
})

describe('POST /api/admin/staff', () => {
  it('403s before touching createStaffAccount', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'a@funun.studio', display_name: 'A', staff_roles: ['ae'] })
    )
    expect(res.status).toBe(403)
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('400s an empty/invalid/absent staff_roles', async () => {
    asManager()
    for (const roles of [undefined, [], ['root'], 'ae']) {
      const res = await staffPOST(
        jsonRequest('http://t.local/api/admin/staff', { email: 'x@funun.studio', display_name: 'X', staff_roles: roles })
      )
      expect(res.status).toBe(400)
    }
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('creates a multi-role account with phone, logs once, returns 201', async () => {
    asManager()
    ;(createStaffAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_ID, emailSent: true })
    ;(createServiceClient as jest.Mock).mockReturnValue({})

    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', {
        email: 'multi@funun.studio',
        display_name: 'Multi',
        staff_roles: ['tms', 'leadership'],
        phone: '(313) 555-0142',
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.staff_roles).toEqual(['tms', 'leadership'])
    expect(body.data.staff_role).toBe('leadership') // primary
    expect(body.data.phone).toBe('(313) 555-0142')
    expect(createStaffAccount).toHaveBeenCalledWith({
      email: 'multi@funun.studio',
      displayName: 'Multi',
      staffRoles: ['tms', 'leadership'],
      phone: '(313) 555-0142',
      invitedBy: LEADER_ID,
    })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'create_staff', targetId: NEW_USER_ID })
    )
  })

  it('accepts the new legal + tms roles as creatable', async () => {
    asManager()
    ;(createStaffAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_ID, emailSent: true })
    ;(createServiceClient as jest.Mock).mockReturnValue({})
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'l@funun.studio', display_name: 'L', staff_roles: ['legal', 'tms'] })
    )
    expect(res.status).toBe(201)
  })

  it('409s a duplicate email (no log)', async () => {
    asManager()
    ;(createStaffAccount as jest.Mock).mockRejectedValue(new DuplicateStaffAccountError('exists'))
    ;(createServiceClient as jest.Mock).mockReturnValue({})
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'd@funun.studio', display_name: 'D', staff_roles: ['bd'] })
    )
    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/staff/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('403s a non-manager', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${NEW_USER_ID}`, { staff_roles: ['bd'] }, 'PATCH'),
      ctx(NEW_USER_ID)
    )
    expect(res.status).toBe(403)
  })

  it('dual-writes app_metadata (set + primary) AND funun_staff, logs once', async () => {
    asManager()
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${NEW_USER_ID}`, { staff_roles: ['tms', 'ae'] }, 'PATCH'),
      ctx(NEW_USER_ID)
    )

    expect(res.status).toBe(200)
    expect(service.updateUserById).toHaveBeenCalledWith(NEW_USER_ID, {
      app_metadata: { staff_roles: ['tms', 'ae'], staff_role: 'ae', is_admin: false }, // ae outranks tms
    })
    expect(service.fununUpdate).toHaveBeenCalledWith({ staff_roles: ['tms', 'ae'], staff_role: 'ae' })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('updates phone alone without touching roles/app_metadata', async () => {
    asManager()
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${NEW_USER_ID}`, { phone: '(313) 555-0100' }, 'PATCH'),
      ctx(NEW_USER_ID)
    )

    expect(res.status).toBe(200)
    expect(service.updateUserById).not.toHaveBeenCalled()
    expect(service.fununUpdate).toHaveBeenCalledWith({ phone: '(313) 555-0100' })
  })

  it('400s an invalid role set and performs no write', async () => {
    asManager()
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${NEW_USER_ID}`, { staff_roles: ['root'] }, 'PATCH'),
      ctx(NEW_USER_ID)
    )
    expect(res.status).toBe(400)
    expect(service.updateUserById).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('blocks demoting the LAST leadership member (last-leadership guard)', async () => {
    asManager()
    // NEW_USER_ID is the only leader; removing leadership from them is blocked
    const service = buildService({ leaders: [NEW_USER_ID] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${NEW_USER_ID}`, { staff_roles: ['ae'] }, 'PATCH'),
      ctx(NEW_USER_ID)
    )
    expect(res.status).toBe(400)
    expect(service.updateUserById).not.toHaveBeenCalled()
  })

  it('allows self-demotion when another leadership remains (no blanket self-guard)', async () => {
    asManager()
    const service = buildService({ leaders: [LEADER_ID, OTHER_LEADER_ID] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffPATCH(
      jsonRequest(`http://t.local/x/${LEADER_ID}`, { staff_roles: ['ae'] }, 'PATCH'),
      ctx(LEADER_ID)
    )
    expect(res.status).toBe(200)
    expect(service.updateUserById).toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/staff/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('403s a non-manager', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    expect((await staffDELETE(jsonRequest(`http://t.local/x/${NEW_USER_ID}`, {}, 'DELETE'), ctx(NEW_USER_ID))).status).toBe(403)
  })

  it('blocks removing yourself', async () => {
    asManager()
    const service = buildService({})
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffDELETE(jsonRequest(`http://t.local/x/${LEADER_ID}`, {}, 'DELETE'), ctx(LEADER_ID))
    expect(res.status).toBe(400)
    expect(service.deleteUser).not.toHaveBeenCalled()
  })

  it('blocks removing the last leadership member', async () => {
    asManager()
    const service = buildService({ leaders: [NEW_USER_ID] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffDELETE(jsonRequest(`http://t.local/x/${NEW_USER_ID}`, {}, 'DELETE'), ctx(NEW_USER_ID))
    expect(res.status).toBe(400)
    expect(service.deleteUser).not.toHaveBeenCalled()
  })

  it('removes a member (deletes the auth user) and logs it', async () => {
    asManager()
    const service = buildService({ leaders: [LEADER_ID] }) // target NEW_USER_ID is not a leader
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffDELETE(jsonRequest(`http://t.local/x/${NEW_USER_ID}`, {}, 'DELETE'), ctx(NEW_USER_ID))
    expect(res.status).toBe(200)
    expect(service.deleteUser).toHaveBeenCalledWith(NEW_USER_ID)
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'remove_staff', targetId: NEW_USER_ID })
    )
  })
})

describe('POST /api/admin/staff/[id]/resend', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('403s a non-manager', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    expect((await staffRESEND(jsonRequest(`http://t.local/x/${NEW_USER_ID}/resend`, {}), ctx(NEW_USER_ID))).status).toBe(403)
  })

  it('404s when the member has no auth user / email', async () => {
    asManager()
    ;(createServiceClient as jest.Mock).mockReturnValue(buildService({ email: null }))
    expect((await staffRESEND(jsonRequest(`http://t.local/x/${NEW_USER_ID}/resend`, {}), ctx(NEW_USER_ID))).status).toBe(404)
  })

  it('regenerates a magic link, re-sends the invite, and logs it', async () => {
    asManager()
    const service = buildService({ email: 'resend@funun.studio' })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    const res = await staffRESEND(jsonRequest(`http://t.local/x/${NEW_USER_ID}/resend`, {}), ctx(NEW_USER_ID))
    expect(res.status).toBe(200)
    expect(service.generateLink).toHaveBeenCalled()
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'resend@funun.studio' }))
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'resend_staff_invite', targetId: NEW_USER_ID })
    )
  })
})
