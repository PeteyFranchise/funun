import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/broadcast (27-08 Task 3) ─────────────
// Colocated route test, same mocked-dependency conventions as the sibling
// artist-invites routes. Covers: leadership triggers send to eligible rows
// only (query excludes opted-out/already-notified rows), a second call
// sends 0 (idempotent), and AE/BD get 403.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

type WaitlistRow = { id: string; email: string; unsubscribe_token: string }

function mockService(options: { eligibleRows?: WaitlistRow[] } = {}) {
  const { eligibleRows = [] } = options

  const auditInsert = jest.fn(async () => ({ error: null }))
  const updateEq = jest.fn(async () => ({ error: null }))
  const updateSpy = jest.fn(() => ({ eq: updateEq }))
  // .select(...).is('unsubscribed_at', null).is('notified_reopen_at', null)
  // resolves to the already-filtered eligible set — the DB does the
  // filtering; this mock represents that resolved query result.
  const isInner = jest.fn(async () => ({ data: eligibleRows, error: null }))
  const isOuter = jest.fn(() => ({ is: isInner }))
  const selectSpy = jest.fn(() => ({ is: isOuter }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    if (table === 'artist_waitlist') {
      return { select: selectSpy, update: updateSpy }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, auditInsert, updateSpy, updateEq, selectSpy, isOuter, isInner }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/admin/artist-invites/broadcast', () => {
  it('sends to eligible rows only (Leadership) and audits the count', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [
      { id: 'w1', email: 'a@example.com', unsubscribe_token: 'tok-a' },
      { id: 'w2', email: 'b@example.com', unsubscribe_token: 'tok-b' },
    ]
    const service = mockService({ eligibleRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(2)

    expect(requireStaff).toHaveBeenCalledWith(['leadership'])
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect((sendEmail as jest.Mock).mock.calls.map(c => c[0].to)).toEqual([
      'a@example.com',
      'b@example.com',
    ])
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notified_reopen_at: expect.any(String) })
    )

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'artist_invite.broadcast',
      targetType: 'artist_waitlist',
      changes: { count: 2 },
    })
  })

  it('queries with the opt-out + already-notified exclusion filters', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ eligibleRows: [] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST()

    expect(service.isOuter).toHaveBeenCalledWith('unsubscribed_at', null)
    expect(service.isInner).toHaveBeenCalledWith('notified_reopen_at', null)
  })

  it('is idempotent — a second broadcast (no eligible rows left) sends 0', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ eligibleRows: [] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).toHaveBeenCalledWith(service, expect.objectContaining({ changes: { count: 0 } }))
  })

  it('rejects a non-leadership staff caller (AE/BD) with 403 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST()

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller with 401', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST()

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
