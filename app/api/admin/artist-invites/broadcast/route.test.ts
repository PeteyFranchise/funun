import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/broadcast (27-08 Task 3; B3/M5 fix
// 27-CODEX-REVIEW.md; follow-up review atomic-claim hardening) ────────────
// Colocated route test, same mocked-dependency conventions as the sibling
// artist-invites routes. Covers: leadership triggers send to eligible rows
// only (query excludes opted-out/already-notified rows); each row is
// atomically CLAIMED (notified_reopen_at stamped via a conditional
// `UPDATE ... WHERE notified_reopen_at IS NULL`) BEFORE any mint/send work;
// a mint failure or a send failure RESETS the claim (retryable) and is
// counted as `failed`; a row whose claim is lost to a concurrent broadcast
// run is skipped without mint/send and without being double-counted;
// AE/BD get 403. The mint claim/rotate logic itself is tested in
// lib/invites/mintInvite.test.ts — this file mocks that module.

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

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

type WaitlistRow = { id: string; email: string; unsubscribe_token: string }
type ClaimResult = { data: { id: string } | null; error: { message: string } | null }

function mockService(
  options: { eligibleRows?: WaitlistRow[]; claimResults?: ClaimResult[] } = {}
) {
  const { eligibleRows = [], claimResults } = options

  const auditInsert = jest.fn(async () => ({ error: null }))

  // ── update(...).eq(id).is('notified_reopen_at', null).select('id').maybeSingle()
  // — the atomic claim. ── update(...).eq(id) alone (no further chaining,
  // awaited directly) — the best-effort claim RESET on mint/send failure.
  // Both paths share the same eq() return value; awaiting a plain object
  // (the reset path never chains further) resolves immediately to itself.
  let claimCallIndex = 0
  const maybeSingleSpy = jest.fn(async () => {
    if (claimResults) {
      const result = claimResults[claimCallIndex] ?? claimResults[claimResults.length - 1]
      claimCallIndex += 1
      return result
    }
    return { data: { id: 'claimed' }, error: null }
  })
  const selectSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))
  const isSpy = jest.fn(() => ({ select: selectSpy }))
  const eqSpy = jest.fn(() => ({ is: isSpy }))
  const updateSpy = jest.fn(() => ({ eq: eqSpy }))

  // ── select('id, email, unsubscribe_token').is('unsubscribed_at', null)
  // .is('notified_reopen_at', null) — the eligible-rows query. The DB does
  // the filtering; this mock represents that resolved query result.
  const isInner = jest.fn(async () => ({ data: eligibleRows, error: null }))
  const isOuter = jest.fn(() => ({ is: isInner }))
  const selectQuerySpy = jest.fn(() => ({ is: isOuter }))

  const from = jest.fn((table: string) => {
    if (table === 'staff_audit_log') return { insert: auditInsert }
    if (table === 'artist_waitlist') {
      return { select: selectQuerySpy, update: updateSpy }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    from,
    auditInsert,
    updateSpy,
    eqSpy,
    isSpy,
    selectSpy,
    maybeSingleSpy,
    selectQuerySpy,
    isOuter,
    isInner,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(sendEmail as jest.Mock).mockResolvedValue({ ok: true })
  ;(mintOrRotateInvite as jest.Mock).mockImplementation(async (_service, { email }: { email: string }) => ({
    ok: true,
    id: `invite-for-${email}`,
    token: `tok-${email}`,
    state: 'created',
  }))
})

describe('POST /api/admin/artist-invites/broadcast', () => {
  it('claims each row, mints an invite for it before sending, and delivers to all', async () => {
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
    expect(body.delivered).toBe(2)
    expect(body.failed).toBe(0)

    expect(requireStaff).toHaveBeenCalledWith(['leadership'])

    // Exactly one UPDATE per row (the claim) — no reset needed on success.
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ notified_reopen_at: expect.any(String) })
    )
    // The claim is conditioned on not-already-notified.
    expect(service.isSpy).toHaveBeenCalledWith('notified_reopen_at', null)

    expect(mintOrRotateInvite).toHaveBeenCalledTimes(2)
    expect(mintOrRotateInvite).toHaveBeenNthCalledWith(1, service, {
      email: 'a@example.com',
      source: 'staff',
      invitedByUserId: LEADERSHIP_UUID,
    })

    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect((sendEmail as jest.Mock).mock.calls.map(c => c[0].to)).toEqual([
      'a@example.com',
      'b@example.com',
    ])
    // The recipient's own minted token must be in the deep link they receive.
    expect((sendEmail as jest.Mock).mock.calls[0][0].html).toContain('tok-a@example.com')

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'artist_invite.broadcast',
      targetType: 'artist_waitlist',
      changes: { delivered: 2, failed: 0 },
    })
  })

  it('claims the row BEFORE minting or sending (claim-before-send ordering)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'a@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({ eligibleRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST()

    const claimOrder = service.maybeSingleSpy.mock.invocationCallOrder[0]
    const mintOrder = (mintOrRotateInvite as jest.Mock).mock.invocationCallOrder[0]
    const sendOrder = (sendEmail as jest.Mock).mock.invocationCallOrder[0]

    expect(claimOrder).toBeLessThan(mintOrder)
    expect(mintOrder).toBeLessThan(sendOrder)
  })

  it('counts a mint failure as failed, never sends, and RESETS the claim (retryable)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'no-invite@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({ eligibleRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(mintOrRotateInvite as jest.Mock).mockResolvedValue({ ok: false, error: 'db boom' })

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(1)
    expect(sendEmail).not.toHaveBeenCalled()
    // Claim (stamped), then reset (nulled) — two writes, not zero.
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ notified_reopen_at: expect.any(String) }))
    expect(service.updateSpy).toHaveBeenNthCalledWith(2, { notified_reopen_at: null })
  })

  it('counts a send failure as failed and RESETS the claim (M5, retryable)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'bounces@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({ eligibleRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: 'send failed' })

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(1)
    expect(mintOrRotateInvite).toHaveBeenCalledTimes(1)
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    expect(service.updateSpy).toHaveBeenNthCalledWith(2, { notified_reopen_at: null })
  })

  it('skips a row whose claim is lost to a concurrent broadcast run, without mint/send or double-counting', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [
      { id: 'w1', email: 'lost-race@example.com', unsubscribe_token: 'tok-a' },
      { id: 'w2', email: 'wins-race@example.com', unsubscribe_token: 'tok-b' },
    ]
    const service = mockService({
      eligibleRows,
      claimResults: [
        { data: null, error: null }, // w1: another concurrent run already claimed it
        { data: { id: 'w2' }, error: null }, // w2: we win the claim
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.delivered).toBe(1)
    expect(body.failed).toBe(0)
    expect(mintOrRotateInvite).toHaveBeenCalledTimes(1)
    expect(mintOrRotateInvite).toHaveBeenCalledWith(service, expect.objectContaining({ email: 'wins-race@example.com' }))
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((sendEmail as jest.Mock).mock.calls[0][0].to).toBe('wins-race@example.com')
  })

  it('counts a claim UPDATE error as failed without minting or sending', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'db-down@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({
      eligibleRows,
      claimResults: [{ data: null, error: { message: 'connection reset' } }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(1)
    expect(mintOrRotateInvite).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('queries with the opt-out + already-notified exclusion filters', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ eligibleRows: [] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST()

    expect(service.isOuter).toHaveBeenCalledWith('unsubscribed_at', null)
    expect(service.isInner).toHaveBeenCalledWith('notified_reopen_at', null)
  })

  it('is idempotent — a second broadcast (no eligible rows left) delivers 0', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ eligibleRows: [] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(0)
    expect(mintOrRotateInvite).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(service.updateSpy).not.toHaveBeenCalled()
    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ changes: { delivered: 0, failed: 0 } })
    )
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
