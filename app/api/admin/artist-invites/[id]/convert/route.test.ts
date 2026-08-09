import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/[id]/convert (27-08 Task 2; H1 fix
// 27-CODEX-REVIEW.md; follow-up review atomic-claim hardening) ───────────
// Colocated route test, same mocked-dependency conventions as
// app/api/admin/artist-invites/route.test.ts. Covers: convert creates
// invite + stamps converted_to_invite_at + sends template B + audits;
// unsubscribed row still sends (D-19); unknown id -> 404; non-staff -> 403;
// an already-converted row with a still-active invite is a true duplicate
// (no resend); an already-converted row whose invite has since EXPIRED is
// re-issued and resent (H1); a FIRST-TIME conversion requires winning an
// atomic `converted_to_invite_at IS NULL` claim before minting/sending —
// losing that race (a concurrent duplicate POST) is treated as
// already-converted with no double email. The mint claim/rotate logic
// itself is tested in lib/invites/mintInvite.test.ts — this file mocks
// that module.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/invites/mintInvite', () => ({
  mintOrRotateInvite: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const AE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WAITLIST_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type ClaimResult = { data: { id: string } | null; error: { message: string } | null }

function postRequest() {
  return new Request(`http://t.local/api/admin/artist-invites/${WAITLIST_UUID}/convert`, {
    method: 'POST',
  })
}

function mockService(
  options: {
    waitlistRow?: { id: string; email: string; converted_to_invite_at: string | null } | null
    claimResult?: ClaimResult
    restampResult?: ClaimResult
  } = {}
) {
  const {
    waitlistRow = null,
    claimResult = { data: { id: WAITLIST_UUID }, error: null },
    restampResult,
  } = options

  const auditInsert = jest.fn(async () => ({ error: null }))

  // ── update(...).eq(id).is('converted_to_invite_at', null).select('id')
  // .maybeSingle() — the first-time atomic claim.
  const claimMaybeSingle = jest.fn(async () => claimResult)
  const claimSelect = jest.fn(() => ({ maybeSingle: claimMaybeSingle }))
  const isSpy = jest.fn(() => ({ select: claimSelect }))

  // ── update(...).eq(id).select('id').maybeSingle() — the non-CAS restamp
  // on an already-converted row's re-issue-on-expiry path (H1).
  const restampMaybeSingle = jest.fn(async () => restampResult ?? claimResult)
  const restampSelect = jest.fn(() => ({ maybeSingle: restampMaybeSingle }))

  const eqSpy = jest.fn(() => ({ is: isSpy, select: restampSelect }))
  const updateSpy = jest.fn(() => ({ eq: eqSpy }))

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
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, auditInsert, updateSpy, eqSpy, isSpy, claimMaybeSingle, restampMaybeSingle }
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
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'invite-1', token: 'tok-1', state: 'created' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.email).toBe('waiter@example.com')

    // The first-time claim happens BEFORE the mint call.
    expect(service.isSpy).toHaveBeenCalledWith('converted_to_invite_at', null)

    expect(mintOrRotateInvite).toHaveBeenCalledWith(service, {
      email: 'waiter@example.com',
      source: 'waitlist_conversion',
      invitedByUserId: AE_UUID,
    })
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )
    // Exactly one write (the claim) — no separate restamp for a first-time
    // conversion.
    expect(service.updateSpy).toHaveBeenCalledTimes(1)

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('waiter@example.com')
    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.html).toContain('tok-1')

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
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'invite-2', token: 'tok-2', state: 'created' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('opted-out@example.com')
  })

  it('returns 404 for an unknown waitlist id and never mints', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ waitlistRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(404)
    expect(mintOrRotateInvite).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not duplicate an invite for an already-converted row with a still-active invite', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'already@example.com',
        converted_to_invite_at: '2026-08-01T00:00:00Z',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'existing-invite-1', token: 'active-tok', state: 'reused' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    // Already-converted rows skip the claim entirely — no write at all.
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('re-issues and resends for an already-converted row whose invite has EXPIRED (H1)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'stale@example.com',
        converted_to_invite_at: '2026-01-01T00:00:00Z',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'existing-invite-2', token: 'rotated-tok', state: 'rotated' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.duplicate).toBeUndefined()
    // The re-issue restamp is a checked, non-CAS write (no `.is()` guard —
    // this row is legitimately already converted).
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('stale@example.com')
  })

  it('returns 500 when the mint claim fails and never sends', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: { id: WAITLIST_UUID, email: 'boom@example.com', converted_to_invite_at: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: false, error: 'db boom' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('loses the first-time conversion claim race and returns duplicate without minting or sending (follow-up review)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: { id: WAITLIST_UUID, email: 'raced@example.com', converted_to_invite_at: null },
      claimResult: { data: null, error: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(mintOrRotateInvite).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 500 when the first-time claim UPDATE errors', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: { id: WAITLIST_UUID, email: 'db-down@example.com', converted_to_invite_at: null },
      claimResult: { data: null, error: { message: 'connection reset' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(500)
    expect(mintOrRotateInvite).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 500 when the re-issue restamp UPDATE fails and never sends', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'restamp-fails@example.com',
        converted_to_invite_at: '2026-01-01T00:00:00Z',
      },
      restampResult: { data: null, error: { message: 'restamp boom' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'existing-invite-3', token: 'rotated-tok', state: 'rotated' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a non-staff caller with 403 before touching the service client', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
