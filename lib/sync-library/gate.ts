// ─── Sync Library inclusion gate — pure predicate over pre-composed signals
// (Phase 30, 30-CONTEXT.md "The gate checks" — rights clear / quality bar /
// metadata complete). CONTEXT.md: "Incomplete ≠ rejected: incomplete tracks
// enter a completion pipeline, not a bin." This module returns a
// STRUCTURED verdict — never a bare boolean, and never 'rejected' — so the
// admit route (30-04) can distinguish "clear to admit" from "route to the
// Sync Readiness worklist."
//
// Pure: no I/O. `rightsClear` is supplied by the caller — this module never
// recomputes rights from raw documents (30-RESEARCH.md Pitfall 3: Sync
// Readiness/the gate FEED the rights answer's inputs, they are not a fourth,
// independently-drifting readiness signal). `qualityOk` is the persisted
// staff quality judgment (sync_listings.quality_ok, wired in 30-04) — v1
// has no automated audio-quality analysis (30-RESEARCH.md Open Question 2).
//
// CORRECTED 2026-10-11: the note above said `rightsClear` came from
// computeStage3().canContinue. It has not since the admit route was wired to
// isSyncRightsClear(syncReadinessForTrack(...)) — the three SYNC_RIGHTS_KEYS,
// not Stage 3. The claim was stale, and it mattered, because the two answers
// are not the same question.
import type { Stage3Result } from '@/lib/vault/stage3'

export type GateSignal = {
  /**
   * Rights standing from the three SYNC_RIGHTS_KEYS (split_sheets, copyright,
   * hire_right) via isSyncRightsClear.
   *
   * REPORTED BUT NO LONGER BLOCKING since owner decision D-11 (2026-10-11) —
   * see evaluateInclusionGate below. Kept on the signal deliberately: staff
   * still need to SEE rights standing at the admit screen, and the admit
   * route still returns it in the refusal payload. Clearance became visible
   * rather than blocking; it did not become invisible.
   */
  rightsClear: boolean
  /** Manual staff judgment (audio quality + genuine sync fit) for v1. */
  qualityOk: boolean
  /** From isSyncMetadataComplete() over syncReadinessForTrack()'s output. */
  metadataComplete: boolean
}

export type InclusionGateVerdict = 'admit_eligible' | 'needs_completion'

/**
 * 'admit_eligible' when the staff quality bar is met and identity/metadata is
 * sufficient. Any false input returns 'needs_completion' — NEVER 'rejected'.
 * Incomplete tracks stay in the collaborative completion pipeline (the Sync
 * Readiness worklist), not a rejection bin.
 *
 * ─── rightsClear DROPPED FROM THE CONJUNCTION — owner decision D-11 ───────
 * This function required `rightsClear && qualityOk && metadataComplete` until
 * 2026-10-11. D-11 states the admission bar explicitly: quality judgment, a
 * playable finished master, sufficient identity/metadata and a valid project
 * type — and NOT every clearance document. `rightsClear` is precisely "every
 * clearance document": split_sheets, copyright and hire_right all complete
 * (SYNC_RIGHTS_KEYS, lib/sync-library/readiness.ts:318).
 *
 * WHY THIS HAD TO CHANGE HERE AND NOT ONLY AT THE ROUTE. Plan 50-05 Task 4 was
 * written to remove a *different* readiness refusal from the admit route and to
 * keep this gate path "verbatim". That would have left D-11 inert: a track with
 * outstanding paperwork would still have been refused admission, so it could
 * still never appear in The Crate, which is the entire outcome D-11 exists to
 * produce. The route-level refusal was the smaller of the two readiness gates.
 *
 * WHAT STILL REFUSES. Quality and metadata here; the project type and the bound
 * master at the route (the master via trackExposure, so the admit gate and the
 * buyer surfaces cannot disagree about playability). What no longer refuses is
 * unfinished rights paperwork — which now moves the buyer-facing badge to
 * "contact Funūn" through trackClearance instead of hiding the song.
 *
 * This is the only production consumer of this function, so the change has no
 * second caller to surprise.
 */
export function evaluateInclusionGate(signal: GateSignal): InclusionGateVerdict {
  if (signal.qualityOk && signal.metadataComplete) return 'admit_eligible'
  return 'needs_completion'
}

/** The tri-state rights badge the buyer/staff Crate surfaces show. */
export type RightsBadge = 'ready' | 'partial' | 'contact'

/**
 * Derives the rights badge from the SAME Stage3Result the gate's
 * rightsClear signal consumes — one definition of "rights standing," not
 * two. 'contact' when nothing required is done yet, or a sample is
 * blocking (a buyer must talk to staff); 'ready' when every required
 * document is signed and the legal gate is open; 'partial' otherwise.
 */
export function rightsBadge(stage3: Stage3Result): RightsBadge {
  if (stage3.requiredComplete === 0 || stage3.sampleBlock) return 'contact'
  if (stage3.canContinue && stage3.requiredComplete === stage3.requiredTotal) return 'ready'
  return 'partial'
}

/**
 * The catalogue's tri-state rights code (mirrors CatalogRights in
 * components/buyer/CatalogBrowserLight.tsx — 'ok' | 'part' | 'req'). Kept
 * as a small, separately-exported map so any caller (the Crate, 30-07/30-08)
 * can reuse the SAME rightsBadge()->CatalogRights mapping rather than
 * redefining the thresholds a second time.
 */
export type CatalogRightsCode = 'ok' | 'part' | 'req'

export const RIGHTS_BADGE_TO_CATALOG_RIGHTS: Record<RightsBadge, CatalogRightsCode> = {
  ready: 'ok',
  partial: 'part',
  contact: 'req',
}
