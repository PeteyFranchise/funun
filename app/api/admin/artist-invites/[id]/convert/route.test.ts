import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/[id]/convert (27-08 Task 2) ──────────
// Colocated route test, same mocked-dependency conventions as
// app/api/admin/artist-invites/route.test.ts. Covers: convert creates
// invite + stamps converted_to_invite_at + sends template B + audits;
// unsubscribed row still sends (D-19); unknown id -> 404; non-staff -> 403;
// already-converted row is idempotent.

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

const AE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WAITLIST_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function postRequest() {
  return new Request(`http://t.local/api/admin/artist-invites/${WAITLIST_UUID}/convert`, {
    method: 'POST',
  })
}

function mockService(
  options: {
    waitlistRow?: { id: string; email: string; converted_to_invite_at: string | null } | null
    existingInvite?: { id: string } | null
    insertedId?: string
    insertError?: { message: string } | null
  } = {}
) {
  const { waitlistRow = null, existingInvite = null, insertedId = 'invite-1', insertError = null } = options

  const auditInsert = jest.fn(async () => ({ error: null }))
  const updateSpy = jest.fn(() => ({
    eq: jest.fn(async () => ({ error: null })),
  }))
  const insertSpy = jest.fn(() => ({
    select: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({
        data: insertError ? null : { id: insertedId },
        error: insertError,
      })),
    })),
  }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    if (table === 'artist_waitlist') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: waitlistRow, error: null })),
          })),
        })),
        update: updateSpy,
      }
    }
    if (table === 'artist_invites') {
      return {
        select: jest.fn(() => ({
          ilike: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: existingInvite, error: null })),
            })),
          })),
        })),
        insert: insertSpy,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, auditInsert, updateSpy, insertSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/admin/artist-invites/[id]/convert', () => {
  it('creates an invite, stamps converted_to_invite_at, sends template B, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: { id: WAITLIST_UUID, email: 'waiter@example.com', converted_to_invite_at: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.email).toBe('waiter@example.com')

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'waiter@example.com',
        source: 'waitlist_conversion',
        invited_by_user_id: AE_UUID,
      })
    )
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('waiter@example.com')

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: AE_UUID,
      action: 'artist_invite.convert',
      targetType: 'artist_waitlist',
      targetId: WAITLIST_UUID,
      changes: { email: 'waiter@example.com' },
    })
  })

  it('still sends the email for an unsubscribed row (D-19)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: { id: WAITLIST_UUID, email: 'opted-out@example.com', converted_to_invite_at: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('opted-out@example.com')
  })

  it('returns 404 for an unknown waitlist id and writes nothing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ waitlistRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(404)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not duplicate an invite for an already-converted row', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'already@example.com',
        converted_to_invite_at: '2026-08-01T00:00:00Z',
      },
      existingInvite: { id: 'existing-invite-1' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a non-staff caller with 403 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
