// ─── E-sign usage + spend telemetry (ESIGN-14, AM-3) ──────────────────
// Pure math. No Supabase import, no fetch, no clock of its own beyond the
// injectable one currentMonthRange takes.
//
// THERE IS NO COUNTER TABLE, DELIBERATELY. esign_envelopes is already the
// authoritative ledger — one row per mint attempt, flipped to 'completed'
// by the webhook at the exact moment DocuSeal's $0.20 is incurred. A
// parallel counter would be a second source of truth for a number the
// access model is metered against, and it would drift the first time a
// webhook retried, a backfill ran, or a row was corrected by hand
// (RESEARCH "Don't Hand-Roll"). The admin route COUNTs the ledger.
//
// WHY "ESTIMATED": Funūn never sees DocuSeal's invoice. This multiplies a
// count Funūn does observe by a published rate, which is an estimate and
// is labelled as one everywhere it surfaces. It is a trigger for a human
// to go look at the real bill, not a substitute for it.

/**
 * DocuSeal's hosted-tier price per COMPLETED document (confirmed at the
 * provider-verification gate, 2026-07-20). Voided/archived submissions
 * never reach 'completed' and therefore never bill — which is why the
 * count this rate multiplies is completed envelopes only, and why
 * VOIDED_ENVELOPES_COUNT_TOWARD_CAP is false in lib/split-sheets/envelopes.
 */
export const DOCUSEAL_PER_DOCUMENT_RATE_USD = 0.2

/**
 * AM-3's monthly aggregate-spend review trigger. Reaching it does not
 * throttle anything — there is deliberately no binding document ceiling
 * anywhere in Phase 17 (see envelopes.ts on why AM-2c replaced the
 * document cap with a new-recipient cap). This is the number that tells a
 * human to look at pricing, not a limit that stops an artist mid-release.
 */
export const AM3_MONTHLY_SPEND_TRIGGER_USD = 500

export type MonthlyEsignUsageInput = {
  /** Completed esign_envelopes rows for the month, already counted by the caller. */
  completedCount: number
  /** Override the published rate (a negotiated or changed price). */
  perDocRate?: number
}

export type MonthlyEsignUsage = {
  completedCount: number
  perDocRate: number
  /** completedCount * perDocRate, rounded to whole cents. */
  estimatedSpendUsd: number
  triggerUsd: number
  /** True once estimated spend reaches the trigger — at it, not only past it. */
  triggerReached: boolean
  /** Estimated spend as a percentage of the trigger, rounded to 1 decimal. */
  percentOfTrigger: number
}

/** Coerces a count to a non-negative finite integer. */
function safeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.floor(value)
}

/** Rounds to whole cents so 3 * 0.2 renders as 0.6, not 0.6000000000000001. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Current-month completed-envelope count and estimated spend, for the AM-3
 * trigger surface.
 *
 * The trigger comparison is `>=`, not `>`: the threshold is a review
 * prompt, and a month that lands exactly on $500 is precisely the month
 * someone should be looking at.
 */
export function monthlyEsignUsage(input: MonthlyEsignUsageInput): MonthlyEsignUsage {
  const completedCount = safeCount(input.completedCount)
  const perDocRate =
    Number.isFinite(input.perDocRate) && (input.perDocRate as number) >= 0
      ? (input.perDocRate as number)
      : DOCUSEAL_PER_DOCUMENT_RATE_USD

  const estimatedSpendUsd = round2(completedCount * perDocRate)

  return {
    completedCount,
    perDocRate,
    estimatedSpendUsd,
    triggerUsd: AM3_MONTHLY_SPEND_TRIGGER_USD,
    triggerReached: estimatedSpendUsd >= AM3_MONTHLY_SPEND_TRIGGER_USD,
    percentOfTrigger:
      Math.round((estimatedSpendUsd / AM3_MONTHLY_SPEND_TRIGGER_USD) * 1000) / 10,
  }
}

/**
 * The half-open [start, end) UTC window for the calendar month containing
 * `now` — the range the admin route filters completed_at on.
 *
 * HALF-OPEN IS LOAD-BEARING: an inclusive upper bound would count a
 * document completed at exactly 00:00:00.000 on the 1st in BOTH months,
 * which is the one way a spend estimate can overstate a real bill.
 *
 * UTC throughout, matching the mint route's own month boundary
 * (deriveRecipientHistory) so the cap and the spend trigger never disagree
 * about which month a document belongs to.
 */
export function currentMonthRange(now: Date): { startIso: string; endIso: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  // Month index 12 rolls the year over correctly in Date.UTC.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}
