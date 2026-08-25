import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { appendRelationshipLog } from '@/lib/client-partners/contacts'
import { insertOnboardingTask } from '@/lib/client-partners/onboarding'
import { PATCH } from './route'

// ─── PATCH /api/admin/buyer-orgs/[id]/ae — D-07 structural handoff ──────────
// (31.1 plan 06, Task 1) Colocated route test, mirrors
// app/api/admin/health-rules/route.test.ts's admin-route conventions.
// Covers this task's <behavior>: the required handoff note, leadership
// self-assign, the auto-created onboarding task + relationship-log entry,
// best-effort email/notification that never blocks the response, and the
// non-staff-target 400. __tests__/staff-buyer-orgs-api.test.ts retains the
// pre-existing reassignment-notification coverage (unaffected by this task
// except for the now-required `note` field on assign requests).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => {
  const actual = jest.requireActual('@/lib/admin/gate')
  return {
    ...actual,
    requireStaff: jest.fn(),
    getStaffRole: (u: { app_metadata?: { staff_role?: string; is_admin?: boolean } } | null) => {
      const r = u?.app_metadata?.staff_role
      if (r === 'leadership' || r === 'ae' || r === 'bd') return r
      return u?.app_metadata?.is_admin === true ? 'leadership' : null
    },
  }
})

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/client-partners/contacts', () => ({
  appendRelationshipLog: jest.fn(),
}))

jest.mock('@/lib/client-partners/onboarding', () => ({
  insertOnboardingTask: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_LEADERSHIP_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const AE_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
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
    priorAeUserId?: string | null
    updateError?: { message: string } | null
    targetUser?: { app_metadata: Record<string, unknown>; email?: string } | null
  } = {}
) {
  const { priorAeUserId = null, updateError = null, targetUser = { app_metadata: { staff_role: 'ae' }, email: 'ae@funun.studio' } } = options

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
  const getUserById = jest.fn(async () => ({ data: { user: targetUser }, error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    return { select: selectSpy, update: updateSpy }
  })

  return { from, selectSpy, updateSpy, auditInsert, auth: { admin: { getUserById } }, getUserById }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
  ;(appendRelationshipLog as jest.Mock).mockResolvedValue({ id: 'log-1' })
  ;(insertOnboardingTask as jest.Mock).mockResolvedValue({ id: 'task-1' })
})

describe('PATCH /api/admin/buyer-orgs/[id]/ae — required handoff note', () => {
  it('returns 400 for a missing note when assigning, and never writes ae_user_id', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('returns 400 for a whitespace-only note when assigning, and never writes ae_user_id', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: '   ' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('does not require a note when unassigning (ae_user_id: null)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: null }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: null })
  })
})

describe('PATCH /api/admin/buyer-orgs/[id]/ae — WR-05 zod .strict() body schema', () => {
  it('rejects a note over the 2000-char cap with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: AE_UUID,
        note: 'x'.repeat(2001),
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('accepts a note at exactly the 2000-char cap', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: AE_UUID,
        note: 'x'.repeat(2000),
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
  })

  it('rejects an unknown extra field (strict) with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: AE_UUID,
        note: 'Fine.',
        evil_field: 'nope',
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/buyer-orgs/[id]/ae — D-07 structural handoff', () => {
  it('assigns, writes the relationship log + onboarding task, and notifies with an intro email', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: AE_UUID,
        note: 'They love fast turnarounds.',
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })

    expect(appendRelationshipLog).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ orgId: ORG_UUID, kind: 'assignment', body: 'They love fast turnarounds.', authorUserId: LEADERSHIP_UUID })
    )

    expect(insertOnboardingTask).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ orgId: ORG_UUID, assigneeId: AE_UUID, handoffNote: 'They love fast turnarounds.' })
    )

    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(AE_UUID)
    expect(payload.type).toBe('ae_assigned')
    expect(payload.sendEmailCopy).toBe(true)
    expect(payload.email).toBe('ae@funun.studio')
  })

  it('a same-AE re-submit (prev === new) does not re-fire the D-07 handoff — no duplicate onboarding task or notification (WR-02)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ priorAeUserId: AE_UUID })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: AE_UUID,
        note: 'Re-submitting the same assignment.',
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
    expect(appendRelationshipLog).not.toHaveBeenCalled()
    expect(insertOnboardingTask).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
    // The authority write and its audit log entry still happen.
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('leadership can self-assign — target-role check accepts leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ targetUser: { app_metadata: { staff_role: 'leadership' }, email: 'lead@funun.studio' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, {
        ae_user_id: OTHER_LEADERSHIP_UUID,
        note: 'Taking this one myself.',
      }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: OTHER_LEADERSHIP_UUID })
  })

  it('rejects a non-staff / artist target with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ targetUser: { app_metadata: { member_type: 'artist' } } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: 'Note.' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(400)
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('a thrown notification/email error does not fail the response — ae_user_id + onboarding task still commit', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(createNotification as jest.Mock).mockRejectedValue(new Error('Resend is down'))

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: 'Note.' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
    expect(insertOnboardingTask).toHaveBeenCalledTimes(1)
  })

  it('a thrown onboarding-task error does not fail the response — ae_user_id still commits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(insertOnboardingTask as jest.Mock).mockRejectedValue(new Error('DB down'))

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: 'Note.' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
  })

  it('a thrown relationship-log error does not fail the response — ae_user_id still commits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(appendRelationshipLog as jest.Mock).mockRejectedValue(new Error('DB down'))

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: 'Note.' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(200)
    expect(service.updateSpy).toHaveBeenCalledWith({ ae_user_id: AE_UUID })
    expect(insertOnboardingTask).toHaveBeenCalledTimes(1)
  })

  it('returns 403 for a non-leadership caller — assignment stays leadership-only', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await PATCH(
      jsonRequest(`http://t.local/api/admin/buyer-orgs/${ORG_UUID}/ae`, { ae_user_id: AE_UUID, note: 'Note.' }),
      { params: Promise.resolve({ id: ORG_UUID }) }
    )

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
