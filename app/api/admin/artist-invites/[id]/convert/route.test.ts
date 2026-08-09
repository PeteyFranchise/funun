import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/[id]/convert (27-08 Task 2; H1 fix
// 27-CODEX-REVIEW.md; follow-up review #1 atomic-claim hardening; follow-up
// review #2 MEDIUM — sent-marker/claim split + mint-failure release +
// idempotency key) ─────────────────────────────────────────────────────────
// Colocated route test, same mocked-dependency conventions as
// app/api/admin/artist-invites/route.test.ts. Covers: convert creates
// invite + stamps converted_to_invite_at + invite_email_sent_at + sends
// template B with an idempotency key + audits; unsubscribed row still sends
// (D-19); unknown id -> 404; non-staff -> 403; an already-converted row with
// a still-active invite AND a confirmed prior send is a true duplicate (no
// resend); an already-converted row whose invite has since EXPIRED is
// re-issued and resent (H1) regardless of invite_email_sent_at; an
// already-converted row whose invite is STILL active but was NEVER
// confirmed sent (a lost mint-response retry) resends using the reused
// invite instead of silently reporting a duplicate; a FIRST-TIME conversion
// requires winning an atomic `converted_to_invite_at IS NULL` claim before
// minting/sending — losing that race is treated as already-converted with
// no double email; a mint failure on a FIRST-TIME claim RELEASES it
// (retryable) but a mint failure on an already-converted row touches
// nothing (there was no claim to release). The mint claim/rotate logic
// itself is tested in lib/invites/mintInvite.test.ts — this file mocks that
// module.

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

type WaitlistRow = {
  id: string
  email: string
  converted_to_invite_at: string | null
  invite_email_sent_at: string | null
}
type MaybeSingleResult = { data: { id: string } | null; error: { message: string } | null }

function postRequest() {
  return new Request(`http://t.local/api/admin/artist-invites/${WAITLIST_UUID}/convert`, {
    method: 'POST',
  })
}

function mockService(
  options: {
    waitlistRow?: WaitlistRow | null
    maybeSingleResults?: MaybeSingleResult[]
  } = {}
) {
  const { waitlistRow = null, maybeSingleResults } = options

  const auditInsert = jest.fn(async () => ({ error: null }))

  // A single ordered queue of maybeSingle() results, consumed in call
  // order, shared by every terminal write this route can reach in a single
  // request (claim, release-on-mint-failure, restamp) — mirrors the route's
  // actual sequential execution (at most one of claim/release/restamp fires
  // per branch, in a fixed order).
  let callIndex = 0
  const maybeSingleSpy = jest.fn(async () => {
    if (maybeSingleResults) {
      const result = maybeSingleResults[callIndex] ?? maybeSingleResults[maybeSingleResults.length - 1]
      callIndex += 1
      return result
    }
    return { data: { id: WAITLIST_UUID }, error: null }
  })

  // ── claim chain: update(...).eq('id', id).is('converted_to_invite_at',
  // null).select('id').maybeSingle()
  const selectAfterIsSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const isSpy = jest.fn(() => ({ select: selectAfterIsSpy }))

  // ── release chain (mint-failure, first-time claim only):
  // update(...).eq('id', id).eq('converted_to_invite_at', stamp).select('id')
  // .maybeSingle()
  const selectAfterEq2Spy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const eq2Spy = jest.fn(() => ({ select: selectAfterEq2Spy }))

  // ── restamp chain (re-issue path) AND the confirmed-sent-marker write
  // both start with update(...).eq('id', id).select(...) or a bare
  // update(...).eq('id', id) awaited directly — the shared node below
  // supports both: .select() continues the restamp chain; a plain `await`
  // on the node itself resolves fine (it's just a non-thenable object,
  // which `await` passes through unchanged) for the fire-and-forget
  // sent-marker write.
  const selectAfterEqIdSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const eqIdNode = {
    is: isSpy,
    eq: eq2Spy,
    select: selectAfterEqIdSpy,
  }
  const eqSpy = jest.fn(() => eqIdNode)
  const updateSpy = jest.fn((_payload: Record<string, unknown>) => ({ eq: eqSpy }))

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

  return { from, auditInsert, updateSpy, eqSpy, isSpy, eq2Spy, selectAfterEqIdSpy, maybeSingleSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/admin/artist-invites/[id]/convert', () => {
  it('creates an invite, stamps converted_to_invite_at + invite_email_sent_at, sends template B with an idempotency key, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'waiter@example.com',
        converted_to_invite_at: null,
        invite_email_sent_at: null,
      },
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

    // Two writes: the first-time claim, then the confirmed-sent marker
    // (invite_email_sent_at) after a successful send — no separate restamp
    // for a first-time conversion.
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )
    expect(service.updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ invite_email_sent_at: expect.any(String) })
    )

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('waiter@example.com')
    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.html).toContain('tok-1')
    expect(sendArgs.idempotencyKey).toBe(`artist-convert-${WAITLIST_UUID}-tok-1`)

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
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'opted-out@example.com',
        converted_to_invite_at: null,
        invite_email_sent_at: null,
      },
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

  it('does not duplicate an invite for an already-converted row with a still-active invite AND a confirmed prior send', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'already@example.com',
        converted_to_invite_at: '2026-08-01T00:00:00Z',
        invite_email_sent_at: '2026-08-01T00:00:05Z',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'existing-invite-1', token: 'active-tok', state: 'reused' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    // Already-converted, already-confirmed-sent rows skip the claim AND the
    // restamp AND the sent-marker write entirely — no writes at all.
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('resends using the reused invite when a prior conversion was never confirmed sent (lost mint-response retry, follow-up review #2)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'lost-response@example.com',
        // A prior attempt already won the first-time claim and minted an
        // invite (converted_to_invite_at is set), but died/lost its
        // response before ever confirming a send — invite_email_sent_at is
        // still null.
        converted_to_invite_at: '2026-08-01T00:00:00Z',
        invite_email_sent_at: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    // mintOrRotateInvite is idempotent — the SAME still-active invite from
    // the prior attempt is reused, not recreated.
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: true, id: 'existing-invite-4', token: 'reused-tok', state: 'reused' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.duplicate).toBeUndefined()
    // No first-time claim attempted (converted_to_invite_at was already
    // set) — the ONLY writes are the re-issue restamp and the sent marker.
    expect(service.isSpy).not.toHaveBeenCalled()
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )
    expect(service.updateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ invite_email_sent_at: expect.any(String) })
    )
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('lost-response@example.com')
    expect((sendEmail as jest.Mock).mock.calls[0][0].idempotencyKey).toBe(
      `artist-convert-${WAITLIST_UUID}-reused-tok`
    )
  })

  it('re-issues and resends for an already-converted row whose invite has EXPIRED (H1), regardless of a prior confirmed send', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'stale@example.com',
        converted_to_invite_at: '2026-01-01T00:00:00Z',
        // Even though the ORIGINAL invite was confirmed sent, its token has
        // since expired — a rotated token is genuinely different content
        // and must always be resent.
        invite_email_sent_at: '2026-01-01T00:00:05Z',
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
    expect(service.updateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ converted_to_invite_at: expect.any(String) })
    )
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('stale@example.com')
  })

  it('returns 500 when the mint fails on a FIRST-TIME claim and RELEASES the claim (retryable, not permanently stuck)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'boom@example.com',
        converted_to_invite_at: null,
        invite_email_sent_at: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: false, error: 'db boom' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
    // Claim, then release — two writes, not a stuck single claim.
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    const claimStamp = service.updateSpy.mock.calls[0][0].converted_to_invite_at
    expect(typeof claimStamp).toBe('string')
    expect(service.updateSpy).toHaveBeenNthCalledWith(2, { converted_to_invite_at: null })
    // The release is CAS'd on the EXACT stamp this request just wrote.
    expect(service.eq2Spy).toHaveBeenCalledWith('converted_to_invite_at', claimStamp)
  })

  it('returns 500 when the mint fails on an ALREADY-converted row — no claim to release, no writes at all', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'already-boom@example.com',
        converted_to_invite_at: '2026-01-01T00:00:00Z',
        invite_email_sent_at: '2026-01-01T00:00:05Z',
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: false, error: 'db boom' })

    const res = await POST(postRequest(), { params: Promise.resolve({ id: WAITLIST_UUID }) })

    expect(res.status).toBe(500)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('loses the first-time conversion claim race and returns duplicate without minting or sending (follow-up review #1)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'raced@example.com',
        converted_to_invite_at: null,
        invite_email_sent_at: null,
      },
      maybeSingleResults: [{ data: null, error: null }],
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
      waitlistRow: {
        id: WAITLIST_UUID,
        email: 'db-down@example.com',
        converted_to_invite_at: null,
        invite_email_sent_at: null,
      },
      maybeSingleResults: [{ data: null, error: { message: 'connection reset' } }],
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
        invite_email_sent_at: null,
      },
      maybeSingleResults: [{ data: null, error: { message: 'restamp boom' } }],
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
