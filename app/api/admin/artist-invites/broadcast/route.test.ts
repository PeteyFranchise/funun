import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { sendEmail } from '@/lib/email'
import { POST } from './route'

// ─── POST /api/admin/artist-invites/broadcast (27-08 Task 3; B3/M5 fix
// 27-CODEX-REVIEW.md; follow-up review #1 atomic-claim hardening; follow-up
// review #2 MEDIUM — claim-lease/delivered-marker split + idempotency key) ─
// Colocated route test, same mocked-dependency conventions as the sibling
// artist-invites routes. Covers: leadership triggers send to eligible rows
// only (query excludes opted-out/already-notified rows); each row is
// atomically CLAIMED via a fresh claim_token/claimed_at lease (conditional
// `UPDATE ... WHERE notified_reopen_at IS NULL AND (claimed_at IS NULL OR
// claimed_at < lease-expiry)`) BEFORE any mint/send work; a mint failure or
// a send failure RELEASES the claim (claim_token/claimed_at cleared via a
// claim_token compare-and-set) and is counted as `failed`; notified_reopen_at
// (the FINAL delivered marker) is stamped only on confirmed send success,
// also via a claim_token compare-and-set; every send carries a stable,
// day-scoped idempotency key; a row whose claim is lost to a concurrent
// broadcast run is skipped without mint/send and without being
// double-counted; AE/BD get 403. The mint claim/rotate logic itself is
// tested in lib/invites/mintInvite.test.ts — this file mocks that module.

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
type MaybeSingleResult = { data: { id: string } | null; error: { message: string } | null }

function mockService(
  options: { eligibleRows?: WaitlistRow[]; maybeSingleResults?: MaybeSingleResult[] } = {}
) {
  const { eligibleRows = [], maybeSingleResults } = options

  const auditInsert = jest.fn(async () => ({ error: null }))

  // A single ordered queue of maybeSingle() results, consumed in call
  // order, shared by BOTH update chains below (the claim chain and the
  // release/finalize chain) — mirrors the route's actual sequential
  // per-row execution (claim, then exactly one of release/finalize).
  let callIndex = 0
  const maybeSingleSpy = jest.fn(async () => {
    if (maybeSingleResults) {
      const result = maybeSingleResults[callIndex] ?? maybeSingleResults[maybeSingleResults.length - 1]
      callIndex += 1
      return result
    }
    return { data: { id: 'claimed' }, error: null }
  })
  const selectSpy = jest.fn(() => ({ maybeSingle: maybeSingleSpy }))

  // ── claim chain: update(...).eq('id', id).is('notified_reopen_at', null)
  // .or(leaseClause).select('id').maybeSingle()
  const orSpy = jest.fn(() => ({ select: selectSpy }))
  const isSpy = jest.fn(() => ({ or: orSpy }))

  // ── release/finalize chain: update(...).eq('id', id)
  // .eq('claim_token', token).select('id').maybeSingle()
  const eq2Spy = jest.fn(() => ({ select: selectSpy }))

  const eqSpy = jest.fn(() => ({ is: isSpy, eq: eq2Spy }))
  const updateSpy = jest.fn((_payload: Record<string, unknown>) => ({ eq: eqSpy }))

  // ── select('id, email, unsubscribe_token').is('unsubscribed_at', null)
  // .is('notified_reopen_at', null) — the eligible-rows query.
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
    orSpy,
    eq2Spy,
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
  it('claims each row via a fresh lease, mints an invite for it before sending, and delivers to all', async () => {
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

    // Two writes per row: claim, then finalize — no release needed on success.
    expect(service.updateSpy).toHaveBeenCalledTimes(4)

    // First write per row is the claim: a fresh claim_token + claimed_at,
    // conditioned on not-already-notified AND an unexpired-or-absent lease.
    const claimCall = service.updateSpy.mock.calls[0][0]
    expect(typeof claimCall.claim_token).toBe('string')
    expect(typeof claimCall.claimed_at).toBe('string')
    expect(service.isSpy).toHaveBeenCalledWith('notified_reopen_at', null)
    expect(service.orSpy).toHaveBeenCalledWith(expect.stringContaining('claimed_at.is.null'))
    expect(service.orSpy).toHaveBeenCalledWith(expect.stringContaining('claimed_at.lt.'))

    // Second write per row is the finalize: stamps notified_reopen_at
    // (the FINAL delivered marker) and clears the lease, CAS'd on the SAME
    // claim_token the claim just set.
    const finalizeCall = service.updateSpy.mock.calls[1][0]
    expect(finalizeCall).toEqual(
      expect.objectContaining({ notified_reopen_at: expect.any(String), claim_token: null, claimed_at: null })
    )
    expect(service.eq2Spy).toHaveBeenCalledWith('claim_token', claimCall.claim_token)

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

  it('sends with a stable, day-scoped idempotency key derived from the recipient row id', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'a@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({ eligibleRows })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await POST()

    const sendArgs = (sendEmail as jest.Mock).mock.calls[0][0]
    expect(sendArgs.idempotencyKey).toMatch(/^artist-reopen-w1-\d{4}-\d{2}-\d{2}$/)
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

  it('counts a mint failure as failed, never sends, and RELEASES the claim lease (retryable, not permanently skipped)', async () => {
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
    // Claim, then release — two writes, not zero.
    expect(service.updateSpy).toHaveBeenCalledTimes(2)
    const claimCall = service.updateSpy.mock.calls[0][0]
    expect(typeof claimCall.claim_token).toBe('string')
    // Release clears BOTH lease columns and is CAS'd on the exact claim_token
    // this attempt set — never a blind reset that could clobber a different
    // (later) attempt's live lease.
    expect(service.updateSpy).toHaveBeenNthCalledWith(2, { claim_token: null, claimed_at: null })
    // eq2Spy is only ever invoked on the release/finalize chain (the claim
    // chain uses isSpy instead) — its first call here IS the release.
    expect(service.eq2Spy).toHaveBeenNthCalledWith(1, 'claim_token', claimCall.claim_token)
    // notified_reopen_at (the FINAL delivered marker) is never touched on a
    // mint failure.
    expect(service.updateSpy.mock.calls.some(([payload]) => 'notified_reopen_at' in payload)).toBe(false)
  })

  it('counts a send failure as failed and RELEASES the claim lease (M5, retryable)', async () => {
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
    expect(service.updateSpy).toHaveBeenNthCalledWith(2, { claim_token: null, claimed_at: null })
  })

  it('does not finalize (does not count as delivered) when the post-send CAS loses the lease', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [{ id: 'w1', email: 'lease-lost@example.com', unsubscribe_token: 'tok-a' }]
    const service = mockService({
      eligibleRows,
      // 1st maybeSingle: claim succeeds. 2nd maybeSingle: finalize CAS finds
      // no matching claim_token (another run's lease reclaimed the row
      // between our send completing and our finalize write landing).
      maybeSingleResults: [
        { data: { id: 'w1' }, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST()

    expect(res.status).toBe(200)
    const body = await res.json()
    // The email genuinely went out (sendEmail resolved ok) but this
    // request's tally only counts a CONFIRMED (CAS-won) finalize as
    // delivered — the idempotency key is what protects the recipient from
    // an actual double send in this narrow window, not this counter.
    expect(body.delivered).toBe(0)
    expect(body.failed).toBe(1)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('skips a row whose claim is lost to a concurrent broadcast run, without mint/send or double-counting', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const eligibleRows: WaitlistRow[] = [
      { id: 'w1', email: 'lost-race@example.com', unsubscribe_token: 'tok-a' },
      { id: 'w2', email: 'wins-race@example.com', unsubscribe_token: 'tok-b' },
    ]
    const service = mockService({
      eligibleRows,
      maybeSingleResults: [
        { data: null, error: null }, // w1 claim: another concurrent run already owns an unexpired lease
        { data: { id: 'w2' }, error: null }, // w2 claim: we win
        { data: { id: 'w2' }, error: null }, // w2 finalize: we still own the lease
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
      maybeSingleResults: [{ data: null, error: { message: 'connection reset' } }],
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
