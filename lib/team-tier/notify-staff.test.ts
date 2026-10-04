import { createNotification } from '@/lib/notifications'
import {
  buildTeamTierLeadNotification,
  resolveTeamTierBdStaff,
  notifyTeamTierLeadStaff,
} from './notify-staff'

// ─── lib/team-tier/notify-staff tests (261004-ttq Task 3) ──────────────────
// Mirrors app/api/sync/register/route.test.ts's mocking convention:
// jest.mock('@/lib/notifications', ...) + a hand-built fake Supabase client
// with .from()/.auth.admin.getUserById() returning controllable promises.

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

const BD_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LEADERSHIP_MULTI_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const IT_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function mockService(options: {
  staffRows?: Record<string, unknown>[] | null
  staffError?: { message: string } | null
  getUserByIdImpl?: (userId: string) => Promise<{ data: { user: { email: string | null } | null } }>
} = {}) {
  const {
    staffRows = [
      { user_id: BD_UUID, staff_role: 'bd', staff_roles: null },
      { user_id: LEADERSHIP_MULTI_UUID, staff_role: 'ae', staff_roles: ['leadership', 'ae'] },
      { user_id: IT_UUID, staff_role: 'it', staff_roles: ['it'] },
    ],
    staffError = null,
    getUserByIdImpl = async (userId: string) => ({
      data: { user: { email: `${userId}@funun.studio` } },
    }),
  } = options

  const from = jest.fn((table: string) => {
    if (table === 'funun_staff') {
      return {
        select: jest.fn(async () => ({ data: staffRows, error: staffError })),
      }
    }
    return {}
  })

  const getUserById = jest.fn(getUserByIdImpl)
  return { from, auth: { admin: { getUserById } } }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

describe('buildTeamTierLeadNotification', () => {
  it('returns the exact literal shape', () => {
    const payload = buildTeamTierLeadNotification({
      recipientId: BD_UUID,
      leadId: 'lead-1',
      seatAnswerLabel: 'More than ten',
    })
    expect(payload).toEqual({
      userId: BD_UUID,
      type: 'team_tier_lead',
      title: 'New Team-tier lead: More than ten',
      link: '/admin/team-tier-leads',
      data: { leadId: 'lead-1' },
    })
  })
})

describe('resolveTeamTierBdStaff', () => {
  it('includes a legacy staff_role=bd row and a multi-role staff_roles=[leadership,ae] row', async () => {
    const service = mockService()
    const recipients = await resolveTeamTierBdStaff(service as never)
    const ids = recipients.map(r => r.userId)
    expect(ids).toContain(BD_UUID)
    expect(ids).toContain(LEADERSHIP_MULTI_UUID)
  })

  it('excludes a role-irrelevant row (staff_role=it)', async () => {
    const service = mockService()
    const recipients = await resolveTeamTierBdStaff(service as never)
    const ids = recipients.map(r => r.userId)
    expect(ids).not.toContain(IT_UUID)
  })

  it('resolves to zero recipients on a funun_staff query error, never throws', async () => {
    const service = mockService({ staffError: { message: 'db down' } })
    const recipients = await resolveTeamTierBdStaff(service as never)
    expect(recipients).toEqual([])
  })

  it('dedupes by user_id', async () => {
    const service = mockService({
      staffRows: [
        { user_id: BD_UUID, staff_role: 'bd', staff_roles: null },
        { user_id: BD_UUID, staff_role: 'bd', staff_roles: ['bd', 'leadership'] },
      ],
    })
    const recipients = await resolveTeamTierBdStaff(service as never)
    expect(recipients).toEqual([{ userId: BD_UUID }])
  })
})

describe('notifyTeamTierLeadStaff', () => {
  it('notifies every bd/leadership staff member — no single arbitrary pick', async () => {
    const service = mockService()
    await notifyTeamTierLeadStaff(service as never, { id: 'lead-1', seatAnswerLabel: 'More than ten' })

    expect(createNotification).toHaveBeenCalledTimes(2)
    const notifiedIds = (createNotification as jest.Mock).mock.calls.map(call => call[1].userId)
    expect(notifiedIds).toContain(BD_UUID)
    expect(notifiedIds).toContain(LEADERSHIP_MULTI_UUID)
  })

  it('a getUserById failure for one recipient does not prevent the other recipient from being notified', async () => {
    const service = mockService({
      getUserByIdImpl: async (userId: string) => {
        if (userId === BD_UUID) throw new Error('lookup failed')
        return { data: { user: { email: `${userId}@funun.studio` } } }
      },
    })

    await notifyTeamTierLeadStaff(service as never, { id: 'lead-1', seatAnswerLabel: 'Not sure yet, it changes' })

    expect(createNotification).toHaveBeenCalledTimes(2)
    const calls = (createNotification as jest.Mock).mock.calls
    const bdCall = calls.find(call => call[1].userId === BD_UUID)
    const leadershipCall = calls.find(call => call[1].userId === LEADERSHIP_MULTI_UUID)
    expect(bdCall?.[1].email).toBeNull()
    expect(bdCall?.[1].sendEmailCopy).toBe(false)
    expect(leadershipCall?.[1].email).toBe(`${LEADERSHIP_MULTI_UUID}@funun.studio`)
    expect(leadershipCall?.[1].sendEmailCopy).toBe(true)
  })

  it('a createNotification failure for one recipient does not prevent the other from being notified', async () => {
    const service = mockService()
    ;(createNotification as jest.Mock)
      .mockRejectedValueOnce(new Error('insert failed'))
      .mockResolvedValueOnce({ ok: true })

    await expect(
      notifyTeamTierLeadStaff(service as never, { id: 'lead-1', seatAnswerLabel: 'More than ten' })
    ).resolves.toBeUndefined()

    expect(createNotification).toHaveBeenCalledTimes(2)
  })

  it('never throws when the staff roster resolves to zero recipients', async () => {
    const service = mockService({ staffError: { message: 'db down' } })
    await expect(
      notifyTeamTierLeadStaff(service as never, { id: 'lead-1', seatAnswerLabel: 'More than ten' })
    ).resolves.toBeUndefined()
    expect(createNotification).not.toHaveBeenCalled()
  })
})
