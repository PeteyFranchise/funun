import { GET as staffGET, POST as staffPOST } from '@/app/api/admin/staff/route'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'
import { logStaffAction } from '@/lib/staff/audit'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return { ...actual, requireStaff: jest.fn() }
})

jest.mock('@/lib/staff/createStaffAccount', () => {
  class DuplicateStaffAccountError extends Error {}
  return {
    createStaffAccount: jest.fn(),
    DuplicateStaffAccountError,
  }
})

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(async () => ({ ok: true })),
}))

const LEADER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const NEW_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/admin/staff', () => {
  it('rejects a non-leadership caller (ae/bd) with 403', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await staffGET()
    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller with 401', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })
    const res = await staffGET()
    expect(res.status).toBe(401)
  })

  it('returns the funun_staff list with a column-explicit select for leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    const selectSpy = jest.fn(() => ({
      order: jest.fn(async () => ({
        data: [{ id: '1', user_id: NEW_USER_ID, staff_role: 'ae', display_name: 'AE Person' }],
        error: null,
      })),
    }))
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => ({ select: selectSpy })),
      auth: { admin: { getUserById: jest.fn(async () => ({ data: { user: { email: 'ae@funun.studio' } } })) } },
    })

    const res = await staffGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      { id: '1', user_id: NEW_USER_ID, staff_role: 'ae', display_name: 'AE Person', email: 'ae@funun.studio' },
    ])
    expect(selectSpy).toHaveBeenCalledWith(expect.not.stringMatching(/^\*$/))
  })
})

describe('POST /api/admin/staff', () => {
  it('rejects a non-leadership caller with 403 before touching createStaffAccount', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'ae@funun.studio', display_name: 'AE', staff_role: 'ae' })
    )
    expect(res.status).toBe(403)
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('rejects an invalid/absent staff_role with 400', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'x@funun.studio', display_name: 'X', staff_role: 'root' })
    )
    expect(res.status).toBe(400)
    expect(createStaffAccount).not.toHaveBeenCalled()
  })

  it('rejects an absent staff_role with 400', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', { email: 'x@funun.studio', display_name: 'X' })
    )
    expect(res.status).toBe(400)
  })

  it('creates a staff account, logs the action once, and returns 201 for a valid leadership request', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    ;(createStaffAccount as jest.Mock).mockResolvedValue({ userId: NEW_USER_ID, emailSent: true })
    ;(createServiceClient as jest.Mock).mockReturnValue({})

    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', {
        email: 'ae@funun.studio',
        display_name: 'AE Person',
        staff_role: 'ae',
      })
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.user_id).toBe(NEW_USER_ID)
    expect(body.emailSent).toBe(true)
    expect(createStaffAccount).toHaveBeenCalledWith({
      email: 'ae@funun.studio',
      displayName: 'AE Person',
      staffRole: 'ae',
      invitedBy: LEADER_ID,
    })
    expect(logStaffAction).toHaveBeenCalledTimes(1)
    expect(logStaffAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: LEADER_ID, action: 'create_staff', targetType: 'funun_staff', targetId: NEW_USER_ID })
    )
  })

  it('returns 409 when createStaffAccount reports a duplicate email', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    ;(createStaffAccount as jest.Mock).mockRejectedValue(new DuplicateStaffAccountError('exists'))
    ;(createServiceClient as jest.Mock).mockReturnValue({})

    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', {
        email: 'dupe@funun.studio',
        display_name: 'Dupe',
        staff_role: 'bd',
      })
    )

    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 500 for a generic createStaffAccount failure', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADER_ID }, staffRole: 'leadership' })
    ;(createStaffAccount as jest.Mock).mockRejectedValue(new Error('outage'))
    ;(createServiceClient as jest.Mock).mockReturnValue({})

    const res = await staffPOST(
      jsonRequest('http://t.local/api/admin/staff', {
        email: 'outage@funun.studio',
        display_name: 'Outage',
        staff_role: 'bd',
      })
    )

    expect(res.status).toBe(500)
  })
})
