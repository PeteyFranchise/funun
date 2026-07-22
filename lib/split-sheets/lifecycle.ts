// ─── Split-sheet freeze boundary ─────────────────────────────────────────
// A split sheet is a LIVING DRAFT while terms are still being worked out in
// the room — writers join, a rapper adds a verse, percentages move. Once
// terms are put to the other parties, editing stops being free:
//
//   draft / countered  → freely editable (the living-draft states)
//   pending_approval   → editable, but consensus RESETS to draft
//   approved           → editable, but consensus RESETS to draft
//   esign_pending      → blocked; void the envelope first (P17-02)
//   executed           → immutable; amend with a new sheet
//
// The executed rule is not a product preference — the document's own
// preserved operative text says it: "may not be modified or amended except
// by writing and signed by all Co-writers named above."
//
// WHY THIS MODULE EXISTS (bug found 2026-07-20): PATCH /api/split-sheets/[id]
// delete-and-reinserts every party row with no status guard. On a sheet
// awaiting approvals that silently destroyed every party's approval_token
// (killing their links while the sheet still claimed pending_approval); on
// an EXECUTED sheet it cascade-deleted esign_envelope_signers rows
// (ON DELETE CASCADE, migration 062) — destroying the audit linkage between
// a signed document and who signed it. Pure module: no I/O, fully testable.
//
// WR-04 (18-REVIEW.md): "does the PATCH body merely CONTAIN a parties[]
// array" is not the same question as "does it change anything that
// matters" — the builder always includes the full parties[] on every
// save, so that first question was true on every edit, forcing a
// consensus reset (and destroying every approval_token via the route's
// delete-and-reinsert) even when nobody touched the party set or a split.
// partiesActuallyChanged() answers the real question via a genuine
// before/after diff, reusing summarizePartyChanges() (change-summary.ts)
// rather than hand-rolling a second comparison — a value-for-value
// resubmission (or a live-identity-only refresh, which that module is
// structurally incapable of seeing per its own P18-09 contract) reports
// no change, exactly like the diff the initiator already sees on save.

import { summarizePartyChanges, type PartyChangeSnapshot } from './change-summary'

export type SplitSheetStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'countered'
  | 'esign_pending'
  | 'executed'

/** States where the sheet is still a working document. */
export const LIVING_DRAFT_STATUSES: SplitSheetStatus[] = ['draft', 'countered']

/** States where editing terms invalidates prior consensus and resets to draft. */
export const CONSENSUS_RESET_STATUSES: SplitSheetStatus[] = ['pending_approval', 'approved']

export type EditGate =
  | { ok: true; resetsConsensus: boolean }
  | { ok: false; status: number; error: string }

/**
 * Whether the incoming party set materially differs from what's
 * persisted — a real add/remove/split-percentage change, per
 * summarizePartyChanges()'s own P18-09 contract (identity fields are
 * never part of this comparison; a value-for-value resubmission of the
 * same parties/splits produces no records). Used to derive `editsParties`
 * for assertEditable() below, so a PATCH that includes the full
 * parties[] array (as every builder save does) but changes nothing about
 * who's on the sheet or what they're owed does not force a consensus
 * reset (WR-04).
 */
export function partiesActuallyChanged(
  before: PartyChangeSnapshot[],
  after: PartyChangeSnapshot[]
): boolean {
  return summarizePartyChanges(before, after).length > 0
}

/**
 * Decides whether a PATCH may proceed against a sheet in `status`.
 *
 * @param status        the sheet's CURRENT persisted status
 * @param editsParties  true when the payload replaces the party set
 *                      (add/remove a writer, or change any split %)
 */
export function assertEditable(status: SplitSheetStatus, editsParties: boolean): EditGate {
  if (status === 'executed') {
    return {
      ok: false,
      status: 409,
      error:
        'This split sheet is fully executed and cannot be edited. Create an amendment split sheet instead — the signed agreement may only be amended in writing, signed by all co-writers.',
    }
  }

  if (status === 'esign_pending') {
    return {
      ok: false,
      status: 409,
      error:
        'A signature request is out for this split sheet. Void it first, then edit — changing terms under a live signature request would leave signers agreeing to different documents.',
    }
  }

  if (editsParties && CONSENSUS_RESET_STATUSES.includes(status)) {
    // Permitted, but the caller MUST reset to draft and clear approvals.
    return { ok: true, resetsConsensus: true }
  }

  return { ok: true, resetsConsensus: false }
}

/**
 * Whether a requested status transition is allowed via PATCH.
 * Guards the back-door: without this, a client could PATCH an executed sheet
 * back to 'draft' and then edit it freely, defeating assertEditable().
 * Lifecycle advancement is owned by the dedicated routes (send-for-approval,
 * mint, void, webhook completion) — never by a raw client-supplied status.
 */
export function isAllowedStatusTransition(
  from: SplitSheetStatus,
  to: SplitSheetStatus
): boolean {
  if (from === to) return true
  // Terminal: nothing leaves 'executed' via PATCH.
  if (from === 'executed') return false
  // Leaving an in-flight signature request is the void route's job.
  if (from === 'esign_pending') return false
  // Walking consensus back to a working draft is legitimate.
  if (to === 'draft') return true
  // Everything else (advancing the pipeline) belongs to the dedicated routes.
  return false
}
