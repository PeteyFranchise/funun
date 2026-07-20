// ─── Split-sheet e-sign envelope lifecycle helpers ───────────────────
// Pure shape/decision helpers: the monthly mint cap (AM-2/ESIGN-13), the
// fast-lane backfill (P17-01, signature ⊃ approval), and the void reset
// (P17-02, envelope voided not deleted — re-consensus re-mints). No
// Supabase client is imported here — the mint/void routes (17-06) apply
// these shapes through the service client.

// ─── Monthly cap (AM-2) ─────────────────────────────────────────────

/** ~10/mo per-artist soft cap (AM-2). An admin bump is a config/env
 * override kept deliberately schema-free for now — raise this constant or
 * thread an explicit `cap` override through checkMonthlyCap() at the call
 * site; do not hardcode a second cap value elsewhere. */
export const MONTHLY_ENVELOPE_CAP = 10

/**
 * Whether a voided envelope counts toward the monthly cap.
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
 * re-derive the billing assumption anywhere else.
 */
export const VOIDED_ENVELOPES_COUNT_TOWARD_CAP = false

export type MonthlyCapCheckInput = {
  /** Envelopes minted this calendar month that are completed or still pending (not voided). */
  completedOrPendingCount: number
  /** Envelopes voided this calendar month — counted only when VOIDED_ENVELOPES_COUNT_TOWARD_CAP is true. */
  voidedCount: number
  /** Override the default MONTHLY_ENVELOPE_CAP (admin bump). */
  cap?: number
}

export type MonthlyCapCheckResult = {
  /** The count actually compared against the cap (voided included/excluded per the flag above). */
  count: number
  cap: number
  allowed: boolean
}

/** Blocks the (cap+1)th mint in a calendar month — call BEFORE minting with
 * the count of envelopes already minted this month; returns whether one
 * more mint is allowed. */
export function checkMonthlyCap(input: MonthlyCapCheckInput): MonthlyCapCheckResult {
  const cap = input.cap ?? MONTHLY_ENVELOPE_CAP
  const count =
    input.completedOrPendingCount + (VOIDED_ENVELOPES_COUNT_TOWARD_CAP ? input.voidedCount : 0)
  return { count, cap, allowed: count < cap }
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
