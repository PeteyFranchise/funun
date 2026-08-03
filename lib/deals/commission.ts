// ─── Commission economics (D-20) ─────────────────────────────────────────
// Pure function computing the Funūn/artist split on a closed deal's gross
// fee. Feeds both the Stripe application fee (D-17a, plan 16-08) and the
// GTM average-sync-fee metric (D-20/D-10) — both callers need the two
// components to always reconstitute the gross exactly, so this uses a
// single integer rounding step and derives the artist net by subtraction
// rather than computing both halves independently (which could drift by a
// cent under floating-point rounding).

export type NetFeeResult = {
  commissionCents: number
  artistNetCents: number
}

export function computeNetFee(grossCents: number, commissionPct: number): NetFeeResult {
  if (!Number.isFinite(grossCents) || grossCents < 0) {
    throw new Error(`Gross fee must be a non-negative finite number of cents, got: ${grossCents}`)
  }
  if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
    throw new Error(`Commission percentage must be a finite number between 0 and 100, got: ${commissionPct}`)
  }

  const commissionCents = Math.round(grossCents * (commissionPct / 100))
  const artistNetCents = grossCents - commissionCents

  return { commissionCents, artistNetCents }
}
