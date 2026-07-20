// ─── Split-sheet e-sign envelope lifecycle helpers ───────────────────
// Pure shape/decision helpers: the monthly NEW-RECIPIENT cap (AM-2c /
// ESIGN-13), the fast-lane backfill (P17-01, signature ⊃ approval), and
// the void reset (P17-02, envelope voided not deleted — re-consensus
// re-mints). No Supabase client is imported here — the mint/void routes
// (17-06) apply these shapes through the service client.

// ─── Monthly new-recipient cap (AM-2c) ──────────────────────────────
//
// AMENDED 2026-07-20 — AM-2c REPLACED the original document-count cap.
// The prior MONTHLY_ENVELOPE_CAP (~10 documents/month) and its
// checkMonthlyCap() are retired, not deprecated: a document ceiling
// breaks correct use. P18-15 requires a split sheet per TRACK, so a
// 12-track album sent to the same three bandmates is 12 documents — and
// under a document cap the artist is blocked partway through their own
// record for doing exactly the right thing.
//
// What the cap actually targets is the SPAM shape, not the volume shape:
// many documents to a few known collaborators is normal use and must
// never be throttled; many documents to many STRANGERS is the abuse
// vector (T-17-16). So the limit counts distinct NEW recipient email
// addresses per calendar month — people this initiator has never sent a
// split sheet to before. A stable writing team stops counting after the
// first send and costs nothing ongoing.
//
// There is deliberately NO binding document ceiling anywhere. AM-3's
// $500/mo aggregate spend trigger is the cost monitor. Uploads are exempt
// by construction — they mint no envelope, so they never reach this check.
//
// Rationale: .planning/FINANCIALS.md §5 and the deliberation doc's AM-2c.

/**
 * 25 distinct new recipients per calendar month per initiator (CONFIRMED
 * by Pete, 2026-07-20). Kept as a single named constant so tuning it is a
 * one-line change; 17-07's admin telemetry surfaces the current value. Do
 * not hardcode a second cap value anywhere — thread the optional `cap`
 * override through checkNewRecipientCap() instead (admin bump).
 */
export const MONTHLY_NEW_RECIPIENT_CAP = 25

/**
 * Whether a voided envelope's recipients consume the initiator's monthly
 * new-recipient allowance.
 *
 * RESOLVED at the provider-verification gate (2026-07-20), not a default:
 * `DELETE /submissions/{id}` ARCHIVES a submission — `archived_at` is set,
 * status stays `pending`, and it never reaches `completed`. DocuSeal bills
 * per COMPLETED document, so an envelope archived before completion is
 * free. Verified live on void test submission 9477116; see
 * .planning/phases/17-split-sheet-esign/17-PROVIDER-VERIFICATION.md row (c).
 *
 * A void therefore costs nothing and must not consume anyone's allowance —
 * charging an artist for a mistake they corrected is the wrong incentive.
 * This is the ONE named flag every cap-check call site reads; do not
 * re-derive the billing assumption anywhere else. Call sites read it
 * through envelopeCountsTowardCap() rather than testing it directly.
 */
export const VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false

/**
 * Whether an envelope in `status` contributes its recipients to the cap
 * history. The single reader of VOIDED_ENVELOPES_COUNT_TOWARD_CAP: the
 * mint route filters an initiator's envelope history through this before
 * building the recipient sets, so a voided attempt's recipients are
 * treated as never-contacted and become "new" again on a re-mint.
 */
export function envelopeCountsTowardCap(status: string): boolean {
  if (status === 'voided') return VOIDED_ENVELOPES_COUNT_TOWARD_CAP
  return true
}

/**
 * Normalizes an email for identity comparison — trimmed and lowercased.
 * Recipient identity must be case-insensitive: sending to `Sam@x.com` and
 * then `sam@x.com` is one collaborator, and counting them twice would
 * burn an artist's allowance on a capitalization difference.
 */
export function normalizeRecipient(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/** Distinct, normalized, non-empty recipients preserving first-seen order. */
function distinctRecipients(emails: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of emails) {
    const email = normalizeRecipient(raw)
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export type NewRecipientCapCheckInput = {
  /**
   * Every recipient this initiator has EVER been sent a split sheet before
   * now, across all time, from cap-counting envelopes only (filter history
   * through envelopeCountsTowardCap first). Anyone in this set is a known
   * collaborator and is free forever.
   */
  priorRecipients: (string | null | undefined)[]
  /**
   * The subset of recipients first contacted during the CURRENT calendar
   * month — the allowance already spent. A strict subset of
   * priorRecipients; anything not also in priorRecipients is ignored.
   */
  newRecipientsThisMonth: (string | null | undefined)[]
  /** The recipients this mint would send to. */
  outgoingRecipients: (string | null | undefined)[]
  /** Override the default MONTHLY_NEW_RECIPIENT_CAP (admin bump). */
  cap?: number
}

export type NewRecipientCapCheckResult = {
  /** Normalized recipients on this mint that the initiator has never contacted. */
  newRecipients: string[]
  /** Allowance already spent this calendar month. */
  spentThisMonth: number
  /** spentThisMonth + newRecipients.length — what the tally becomes if this mint proceeds. */
  projectedCount: number
  cap: number
  allowed: boolean
}

/**
 * The AM-2c cap check. Call BEFORE any provider call in the mint route.
 *
 * Allows the mint when the month's new-recipient tally would still land AT
 * OR BELOW the cap. Note this is `<=`, not the `<` a per-document counter
 * would use: this check evaluates a BATCH (a mint introduces every one of
 * its new recipients at once), so the comparison is against the projected
 * total rather than the pre-mint count.
 *
 * The load-bearing consequence: a mint whose recipients are ALL already
 * known adds zero and is allowed even when the initiator is already at or
 * over the cap. That is the 12-track-album case working correctly — it is
 * not an oversight, and any future edit that makes an all-known mint fail
 * has reintroduced the document cap AM-2c removed.
 */
export function checkNewRecipientCap(
  input: NewRecipientCapCheckInput
): NewRecipientCapCheckResult {
  const cap = input.cap ?? MONTHLY_NEW_RECIPIENT_CAP
  const known = new Set(distinctRecipients(input.priorRecipients))

  const newRecipients = distinctRecipients(input.outgoingRecipients).filter(
    email => !known.has(email)
  )

  // Guarded by `known` so a caller passing a looser month set (e.g. one
  // including recipients from voided-only envelopes) cannot inflate the
  // tally beyond the history the cap is actually derived from.
  const spentThisMonth = distinctRecipients(input.newRecipientsThisMonth).filter(email =>
    known.has(email)
  ).length

  const projectedCount = spentThisMonth + newRecipients.length

  return {
    newRecipients,
    spentThisMonth,
    projectedCount,
    cap,
    allowed: projectedCount <= cap,
  }
}

// ─── Fast-lane backfill (P17-01) ────────────────────────────────────
// Signature ⊃ approval: when the initiator skips straight to signing on a
// sheet already agreed in person, the completed signature backfills
// approval state so downstream logic (readiness tiering, notifications)
// has one truth — the sheet ENTERS at tier 10 (esign_pending), same as a
// sheet that reached esign_pending via the normal approve/counter loop.

export type FastLaneBackfill = {
  partyUpdate: { approval_status: 'approved'; approved_at: string }
  sheetUpdate: { status: 'esign_pending'; all_approved_at: string }
}

/** The party+sheet update shape for a fast-lane mint. Apply partyUpdate to
 * every split_sheet_parties row on the sheet, and sheetUpdate to the sheet
 * itself. */
export function buildFastLaneBackfill(nowIso: string): FastLaneBackfill {
  return {
    partyUpdate: { approval_status: 'approved', approved_at: nowIso },
    sheetUpdate: { status: 'esign_pending', all_approved_at: nowIso },
  }
}

// ─── Void reset (P17-02) ────────────────────────────────────────────
// Any-party objection voids a minted envelope before all signatures land.
// The envelope row is marked voided (never deleted — preserves audit
// history of the attempt); the sheet returns to the approval/counter
// stage so re-consensus can mint a new envelope.

export type VoidReset = {
  envelopeUpdate: { status: 'voided'; voided_at: string }
  sheetUpdate: { status: 'countered' | 'pending_approval' }
}

/** The envelope+sheet update shape for a void. `hasCounter` reflects
 * whether the objecting party's action was itself a counter-proposal (sheet
 * returns to 'countered') vs. a plain objection with no counter (sheet
 * returns to 'pending_approval'). */
export function buildVoidReset(nowIso: string, hasCounter: boolean): VoidReset {
  return {
    envelopeUpdate: { status: 'voided', voided_at: nowIso },
    sheetUpdate: { status: hasCounter ? 'countered' : 'pending_approval' },
  }
}
