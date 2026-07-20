// RED-first tests for envelope lifecycle helpers: the monthly cap check
// (AM-2/ESIGN-13), fast-lane backfill (P17-01), and void reset (P17-02).
// Pure shape/decision helpers — no Supabase client.

import {
  MONTHLY_ENVELOPE_CAP,
  VOIDED_ENVELOPES_COUNT_TOWARD_CAP,
  checkMonthlyCap,
  buildFastLaneBackfill,
  buildVoidReset,
} from './envelopes'

describe('MONTHLY_ENVELOPE_CAP', () => {
  it('defaults to 10 (AM-2 ~10/mo soft cap)', () => {
    expect(MONTHLY_ENVELOPE_CAP).toBe(10)
  })
})

describe('checkMonthlyCap', () => {
  it('allows a mint when under the cap', () => {
    const result = checkMonthlyCap({ completedOrPendingCount: 9, voidedCount: 0 })
    expect(result.allowed).toBe(true)
  })

  it('blocks the (cap+1)th mint exactly at the boundary', () => {
    const result = checkMonthlyCap({ completedOrPendingCount: MONTHLY_ENVELOPE_CAP, voidedCount: 0 })
    expect(result.allowed).toBe(false)
  })

  it('allows the cap-th mint itself (count == cap - 1 before minting)', () => {
    const result = checkMonthlyCap({ completedOrPendingCount: MONTHLY_ENVELOPE_CAP - 1, voidedCount: 0 })
    expect(result.allowed).toBe(true)
  })

  it('honors a custom cap override', () => {
    const result = checkMonthlyCap({ completedOrPendingCount: 3, voidedCount: 0, cap: 3 })
    expect(result.allowed).toBe(false)
  })

  it('ignores voided envelopes toward the cap when VOIDED_ENVELOPES_COUNT_TOWARD_CAP is false', () => {
    expect(VOIDED_ENVELOPES_COUNT_TOWARD_CAP).toBe(false)
    const result = checkMonthlyCap({ completedOrPendingCount: 5, voidedCount: 20 })
    expect(result.allowed).toBe(true)
    expect(result.count).toBe(5)
  })
})

describe('buildFastLaneBackfill (P17-01 signature ⊃ approval)', () => {
  it('sets every party to approved and the sheet to esign_pending', () => {
    const now = '2026-07-20T12:00:00.000Z'
    const backfill = buildFastLaneBackfill(now)
    expect(backfill.partyUpdate).toEqual({ approval_status: 'approved', approved_at: now })
    expect(backfill.sheetUpdate).toEqual({ status: 'esign_pending', all_approved_at: now })
  })
})

describe('buildVoidReset (P17-02)', () => {
  it('marks the envelope voided (not deleted)', () => {
    const now = '2026-07-20T12:00:00.000Z'
    const reset = buildVoidReset(now, false)
    expect(reset.envelopeUpdate).toEqual({ status: 'voided', voided_at: now })
  })

  it('resets the sheet to countered when a counter exists', () => {
    const reset = buildVoidReset('2026-07-20T12:00:00.000Z', true)
    expect(reset.sheetUpdate).toEqual({ status: 'countered' })
  })

  it('resets the sheet to pending_approval when no counter exists', () => {
    const reset = buildVoidReset('2026-07-20T12:00:00.000Z', false)
    expect(reset.sheetUpdate).toEqual({ status: 'pending_approval' })
  })
})
