// ─── Sync Library inclusion gate — pure predicate over pre-composed signals
// (Phase 30, 30-CONTEXT.md "The gate checks" — rights clear / quality bar /
// metadata complete). CONTEXT.md: "Incomplete ≠ rejected: incomplete tracks
// enter a completion pipeline, not a bin." This module returns a
// STRUCTURED verdict — never a bare boolean, and never 'rejected' — so the
// admit route (30-04) can distinguish "clear to admit" from "route to the
// Sync Readiness worklist."
//
// Pure: no I/O. `rightsClear` is supplied by the caller from
// computeStage3().canContinue (lib/vault/stage3.ts) — this module never
// recomputes rights from raw documents (30-RESEARCH.md Pitfall 3: Sync
// Readiness/the gate FEED isRightsReady's inputs, they are not a fourth,
// independently-drifting readiness signal). `qualityOk` is the persisted
// staff quality judgment (sync_listings.quality_ok, wired in 30-04) — v1
// has no automated audio-quality analysis (30-RESEARCH.md Open Question 2).
import type { Stage3Result } from '@/lib/vault/stage3'

export type GateSignal = {
  /** From computeStage3(...).canContinue — the existing legal-doc gate. */
  rightsClear: boolean
  /** Manual staff judgment (audio quality + genuine sync fit) for v1. */
  qualityOk: boolean
  /** From isSyncMetadataComplete() over syncReadinessForTrack()'s output. */
  metadataComplete: boolean
}

export type InclusionGateVerdict = 'admit_eligible' | 'needs_completion'

/**
 * 'admit_eligible' only when rights are clear, quality bar is met, and
 * metadata is complete. Any false input returns 'needs_completion' — NEVER
 * 'rejected'. Incomplete tracks stay in the collaborative completion
 * pipeline (the Sync Readiness worklist), not a rejection bin.
 */
export function evaluateInclusionGate(signal: GateSignal): InclusionGateVerdict {
  if (signal.rightsClear && signal.qualityOk && signal.metadataComplete) return 'admit_eligible'
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
