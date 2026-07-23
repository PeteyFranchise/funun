// ─── E-sign usage/spend telemetry (ESIGN-14, AM-3) ────────────────────
// Phase 17 plan 07, Task 2. Pure math over a count the caller has already
// queried — see lib/esign/telemetry.ts's header for why there is no
// counter table.

import {
  monthlyEsignUsage,
  currentMonthRange,
  DOCUSEAL_PER_DOCUMENT_RATE_USD,
  AM3_MONTHLY_SPEND_TRIGGER_USD,
} from '@/lib/esign/telemetry'

describe('monthlyEsignUsage — count to spend', () => {
  it('multiplies the completed count by the per-document rate', () => {
    const usage = monthlyEsignUsage({ completedCount: 12, perDocRate: 0.2 })

    expect(usage.completedCount).toBe(12)
    expect(usage.perDocRate).toBe(0.2)
    expect(usage.estimatedSpendUsd).toBeCloseTo(2.4, 10)
  })

  it('defaults to the known DocuSeal per-completed-document rate', () => {
    const usage = monthlyEsignUsage({ completedCount: 10 })

    expect(usage.perDocRate).toBe(DOCUSEAL_PER_DOCUMENT_RATE_USD)
    expect(usage.estimatedSpendUsd).toBeCloseTo(10 * DOCUSEAL_PER_DOCUMENT_RATE_USD, 10)
  })

  it('reports zero spend for a month with no completions', () => {
    const usage = monthlyEsignUsage({ completedCount: 0 })

    expect(usage.estimatedSpendUsd).toBe(0)
    expect(usage.triggerReached).toBe(false)
    expect(usage.percentOfTrigger).toBe(0)
  })

  it('rounds spend to whole cents rather than leaking float noise', () => {
    // 3 * 0.2 is 0.6000000000000001 in IEEE 754 — an admin surface must
    // never render that.
    const usage = monthlyEsignUsage({ completedCount: 3, perDocRate: 0.2 })

    expect(usage.estimatedSpendUsd).toBe(0.6)
  })

  it('treats a negative or non-finite count as zero rather than negative spend', () => {
    expect(monthlyEsignUsage({ completedCount: -5 }).estimatedSpendUsd).toBe(0)
    expect(monthlyEsignUsage({ completedCount: Number.NaN }).completedCount).toBe(0)
  })
})

describe('monthlyEsignUsage — the AM-3 $500/mo trigger', () => {
  it('is not reached below the threshold', () => {
    const belowCount = Math.floor(
      (AM3_MONTHLY_SPEND_TRIGGER_USD - 1) / DOCUSEAL_PER_DOCUMENT_RATE_USD
    )
    const usage = monthlyEsignUsage({ completedCount: belowCount })

    expect(usage.triggerUsd).toBe(AM3_MONTHLY_SPEND_TRIGGER_USD)
    expect(usage.triggerReached).toBe(false)
    expect(usage.percentOfTrigger).toBeLessThan(100)
  })

  it('is reached exactly at the threshold, not only past it', () => {
    const exactCount = AM3_MONTHLY_SPEND_TRIGGER_USD / DOCUSEAL_PER_DOCUMENT_RATE_USD
    const usage = monthlyEsignUsage({ completedCount: exactCount })

    expect(usage.estimatedSpendUsd).toBe(AM3_MONTHLY_SPEND_TRIGGER_USD)
    expect(usage.triggerReached).toBe(true)
    expect(usage.percentOfTrigger).toBe(100)
  })

  it('reports how far past the trigger the month has run', () => {
    const overCount = (AM3_MONTHLY_SPEND_TRIGGER_USD * 2) / DOCUSEAL_PER_DOCUMENT_RATE_USD
    const usage = monthlyEsignUsage({ completedCount: overCount })

    expect(usage.triggerReached).toBe(true)
    expect(usage.percentOfTrigger).toBe(200)
  })
})

describe('currentMonthRange — the query window', () => {
  it('spans the first instant of this month to the first instant of the next', () => {
    const range = currentMonthRange(new Date('2026-07-20T15:45:12.000Z'))

    expect(range.startIso).toBe('2026-07-01T00:00:00.000Z')
    expect(range.endIso).toBe('2026-08-01T00:00:00.000Z')
  })

  it('rolls the year over at a December boundary', () => {
    const range = currentMonthRange(new Date('2026-12-31T23:59:59.999Z'))

    expect(range.startIso).toBe('2026-12-01T00:00:00.000Z')
    expect(range.endIso).toBe('2027-01-01T00:00:00.000Z')
  })

  it('includes a completion at the very first instant of the month', () => {
    // Half-open [start, end): a document completed at exactly 00:00:00.000
    // on the 1st belongs to this month, and one at the next month's 00:00
    // does not. An inclusive upper bound would double-count it.
    const range = currentMonthRange(new Date('2026-07-01T00:00:00.000Z'))

    expect(range.startIso).toBe('2026-07-01T00:00:00.000Z')
    expect(Date.parse(range.endIso)).toBeGreaterThan(Date.parse(range.startIso))
  })
})
