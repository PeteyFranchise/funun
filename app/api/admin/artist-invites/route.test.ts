import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { sendEmail } from '@/lib/email'
import { GET, POST } from './route'

// ─── GET+POST /api/admin/artist-invites (27-08 Task 1) ────────────────────
// Colocated route test, mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// admin-route conventions (mocked requireStaff/createServiceClient/audit).

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

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/admin/artist-invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(
  options: {
    waitlist?: unknown[]
    invites?: unknown[]
    existingInvite?: { id: string } | null
    insertedId?: string
    insertError?: { message: string } | null
    staffDisplayName?: string | null
  } = {}
) {
  const {
    waitlist = [],
    invites = [],
    existingInvite = null,
    insertedId = 'invite-1',
    insertError = null,
    staffDisplayName = null,
  } = options

  const auditInsert = jest.fn(async () => ({ error: null }))
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
    if (table === 'funun_staff') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({
              data: staffDisplayName ? { display_name: staffDisplayName } : null,
              error: null,
            })),
          })),
        })),
      }
    }
    if (table === 'artist_waitlist') {
      return {
        select: jest.fn(() => ({
          order: jest.fn(async () => ({ data: waitlist, error: null })),
        })),
      }
    }
    if (table === 'artist_invites') {
      return {
        select: jest.fn(() => ({
          // GET path
          order: jest.fn(async () => ({ data: invites, error: null })),
          // POST duplicate-check path
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

  return { from, auditInsert, insertSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('GET /api/admin/artist-invites', () => {
  it('returns both lists for any staff role', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ waitlist: [{ id: 'w1' }], invites: [{ id: 'i1' }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.waitlist).toEqual([{ id: 'w1' }])
    expect(body.invites).toEqual([{ id: 'i1' }])
  })

  it('returns 403 for a non-staff caller and never touches the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await GET()

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await GET()

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/artist-invites', () => {
  it('creates a tokened invite, sends template A, and audits (any staff)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ staffDisplayName: 'Jordan AE' })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ email: 'newartist@example.com' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.email).toBe('newartist@example.com')

    expect(service.insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newartist@example.com',
        status: 'pending',
        source: 'staff',
        invited_by_user_id: AE_UUID,
      })
    )

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.to).toBe('newartist@example.com')

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: AE_UUID,
      action: 'artist_invite.create',
      targetType: 'artist_invite',
      targetId: 'invite-1',
      changes: { email: 'newartist@example.com' },
    })
  })

  it('does not duplicate an already-pending invite for the same email', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ existingInvite: { id: 'existing-1' } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ email: 'dup@example.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(service.insertSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a non-staff caller with 403 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ email: 'x@example.com' }))

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects an invalid email with 400 and never writes', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ email: 'not-an-email' }))

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })
})
