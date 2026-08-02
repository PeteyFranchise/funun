// ─── buildNextMoves() — the dashboard's "Your next moves" action feed ────
// ④ (21-CONTEXT.md "Dashboard rework"): the dashboard drops the vanity
// Avg-readiness stat and gains an action surface instead. This module is
// that surface's derivation layer, mirroring buildAttentionSections()
// (lib/contracts/locker-attention.ts) — Funūn generated every row this
// module looks at, so a pure structured derivation over already-fetched
// rows is faster and more correct than a notifications-table read or an
// AI pass over the same data (21-RESEARCH.md Pattern 3).
//
// The ONE way this module differs from buildAttentionSections: the
// inclusion rule is "is this waiting on you?", not "what needs signing on
// THIS project's Locker" — so the caller feeds it sheets reachable via
// BOTH owned and shared-reachable projects (fetchSplitSheetsForUser's
// initiated + party-of merge already returns exactly this set, cross-
// account, by construction — RESEARCH's "one caller-side gap"), and the
// output splits into a `pinned` money/signature tier (locked, never
// reordered — ④'s "never bury a contract") and a `flexible` softer tier
// (data-shaped so a future per-user ordering/mute layer can sort ONLY
// `flexible` without touching `pinned` — CONTEXT.md Deferred Ideas).
//
// P18-11 (17-DUAL-ENTRY-DESIGN.md section 10b) applies here exactly as it
// does in locker-attention.ts: a draft sheet is invisible to anyone but
// its initiator, in every section.

import { CONSENSUS_RESET_STATUSES, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'

// Money/signature status bucket (④): review/approve a sheet
// (pending_approval/approved, sourced from lifecycle.ts's OWN
// freeze-boundary vocabulary rather than fresh literals — a future
// freeze-boundary change to those two statuses cannot silently leave this
// feed stale), respond to a counter (countered), sign a document
// (esign_pending). Identical bucket shape to locker-attention.ts's
// AWAITING_SIGNATURE_STATUSES, reused here for the SAME reason: two of the
// four are lifecycle.ts's own vocabulary, not re-declared literals.
const PINNED_STATUSES: SplitSheetStatus[] = [...CONSENSUS_RESET_STATUSES, 'countered', 'esign_pending']

export type NextMoveKind = 'complete_draft' | 'review_approve' | 'respond_to_counter' | 'sign_document'

export type NextMoveTier = 'pinned' | 'flexible'

export type NextMoveRow = {
  kind: NextMoveKind
  /** The split sheet this row is about, when the row is sheet-derived. */
  sheetId: string | null
  /** Reserved for a future document-derived row kind (e.g. a standalone
   * vault_documents e-sign flow) — always null for the launch action set,
   * which is entirely split-sheet-status-derived (esign_pending IS a
   * split_sheets.status, not a vault_documents.status, in this codebase). */
  documentId: string | null
  label: string
  href: string
  tier: NextMoveTier
}

export type NextMoveSections = {
  /** Money & signature items — locked ranking, never reordered (④). */
  pinned: NextMoveRow[]
  /** Softer items — a future per-user ordering/mute layer bolts on here. */
  flexible: NextMoveRow[]
}

export type NextMoveSheetPartyInput = {
  userId: string | null
}

export type NextMoveSheetInput = {
  id: string
  songName: string
  status: string
  initiatorUserId: string
  parties: NextMoveSheetPartyInput[]
}

export type BuildNextMovesInput = {
  viewerUserId: string
  /** Sheets the viewer can act on — owned + party-of + shared-reachable
   * (the SAME initiated+party-of merge fetchSplitSheetsForUser already
   * builds, RESEARCH's one caller-side gap: feed it that result, not the
   * owner-scoped stat query). */
  sheets: NextMoveSheetInput[]
}

/** Whether the viewer is the initiator or a named party on this sheet —
 * i.e. whether this sheet is "theirs to act on" at all. Sheets reaching
 * this module are already reachability-filtered by the caller's query
 * (fetchSplitSheetsForUser), so this is a defensive re-check, matching
 * this codebase's convention of re-applying P18-11-style rules at the
 * derivation layer rather than trusting the caller's query alone. */
function isReachableByViewer(sheet: NextMoveSheetInput, viewerUserId: string): boolean {
  if (sheet.initiatorUserId === viewerUserId) return true
  return sheet.parties.some(p => p.userId === viewerUserId)
}

/**
 * Turns plain, already-fetched split-sheet row arrays into the dashboard's
 * "Your next moves" pinned/flexible sections. No I/O, no model call — every
 * fact here was already computed by Funūn's own approval/e-sign pipeline
 * (mirrors buildAttentionSections' design rationale). An unrecognized
 * sheet status produces no row rather than throwing, matching
 * deriveSheetTier()'s (lib/vault/readiness-tiers.ts) and
 * buildAttentionSections' degrade-not-throw posture.
 */
export function buildNextMoves({ viewerUserId, sheets }: BuildNextMovesInput): NextMoveSections {
  const pinned: NextMoveRow[] = []
  const flexible: NextMoveRow[] = []

  for (const sheet of sheets) {
    // P18-11: a draft whose initiator is someone else does not exist for
    // this viewer, in any tier.
    if (sheet.status === 'draft') {
      if (sheet.initiatorUserId === viewerUserId) {
        flexible.push({
          kind: 'complete_draft',
          sheetId: sheet.id,
          documentId: null,
          label: `Finish the split-sheet draft for "${sheet.songName}"`,
          href: `/split-sheets/${sheet.id}`,
          tier: 'flexible',
        })
      }
      continue
    }

    if (!isReachableByViewer(sheet, viewerUserId)) continue

    if (!PINNED_STATUSES.includes(sheet.status as SplitSheetStatus)) {
      // Unrecognized (or settled, e.g. 'executed') status: no row rather
      // than throwing.
      continue
    }

    if (sheet.status === 'countered') {
      pinned.push({
        kind: 'respond_to_counter',
        sheetId: sheet.id,
        documentId: null,
        label: `Respond to a counter-proposal on "${sheet.songName}"`,
        href: `/split-sheets/${sheet.id}`,
        tier: 'pinned',
      })
      continue
    }

    if (sheet.status === 'esign_pending') {
      pinned.push({
        kind: 'sign_document',
        sheetId: sheet.id,
        documentId: null,
        label: `Sign the split sheet for "${sheet.songName}"`,
        href: `/split-sheets/${sheet.id}`,
        tier: 'pinned',
      })
      continue
    }

    // Remaining PINNED_STATUSES members: CONSENSUS_RESET_STATUSES
    // ('pending_approval', 'approved').
    pinned.push({
      kind: 'review_approve',
      sheetId: sheet.id,
      documentId: null,
      label: `Review and approve the split for "${sheet.songName}"`,
      href: `/split-sheets/${sheet.id}`,
      tier: 'pinned',
    })
  }

  return { pinned, flexible }
}
