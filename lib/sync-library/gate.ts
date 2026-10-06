// ─── Sync Library inclusion gate — pure predicate over pre-composed signals
// (Phase 30, 30-CONTEXT.md "The gate checks" — rights clear / quality bar /
// metadata complete). CONTEXT.md: "Incomplete ≠ rejected: incomplete tracks
// enter a completion pipeline, not a bin." This module returns a
// STRUCTURED verdict — never a bare boolean, and never 'rejected' — so the
// admit route (30-04) can distinguish "clear to admit" from "route to the
// Sync Readiness worklist."
//
// Pure: no I/O. `rightsClear` is supplied by the caller — this module
// never recomputes rights from raw documents (30-RESEARCH.md Pitfall 3:
// Sync Readiness/the gate FEED isRightsReady's inputs, they are not a
// fourth, independently-drifting readiness signal).
//
// ─── rightsClear is NOT computeStage3().canContinue (2026-09-10) ────────
// This header used to say it was. It is not, and the difference is
// load-bearing. The only production caller
// (app/api/sync-library/admin/[listingId]/route.ts) computes ONE
// syncReadinessForTrack() result and derives `rightsClear` from
// isSyncRightsClear() over it (lib/sync-library/readiness.ts); it does
// not call computeStage3() at all, and says so at its own call site.
//
// canContinue is `readinessScore >= 60 && !sampleBlock` — the ARTIST's
// release-pipeline signal, where an uncleared sample MUST keep blocking,
// because you cannot distribute a track with an uncleared sample. The
// sync catalogue asks the BUYER's question, and the owner decided on
// 2026-09-09 that a sampled track IS listed, labelled "Contains a
// sample". Sample clearance is therefore DELIBERATELY outside this
// admission check. Re-pointing `rightsClear` at canContinue would
// silently restore the block this route exists to exclude, and make the
// shipped "Contains a sample" label unreachable for anything newly
// reviewed — which is exactly the defect fixed on 2026-09-10. See that
// route's header note and
// .planning/deliberations/sync-catalogue-entry-and-samples.md.
//
// `qualityOk` is the persisted staff quality judgment
// (sync_listings.quality_ok, wired in 30-04) — v1 has no automated
// audio-quality analysis (30-RESEARCH.md Open Question 2).
import type { Stage3Result } from '@/lib/vault/stage3'

export type GateSignal = {
  /**
   * The sync-specific rights verdict: isSyncRightsClear() over
   * syncReadinessForTrack()'s output. NOT computeStage3().canContinue —
   * an uncleared sample does not appear in this signal at all, on
   * purpose (see the header note).
   */
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
 * Derives the rights badge from a Stage3Result. 'contact' when nothing
 * required is done yet, or a sample is blocking (a buyer must talk to
 * staff); 'ready' when every required document is signed and the legal
 * gate is open; 'partial' otherwise.
 *
 * This reads a DIFFERENT signal from evaluateInclusionGate()'s
 * `rightsClear`, and that is deliberate, not drift. This badge takes a
 * Stage3Result (its only production caller is catalogRightsFromStage3(),
 * lib/deals/catalog.ts); the admit gate's `rightsClear` comes from
 * isSyncRightsClear() and excludes sample clearance entirely. The badge
 * must keep seeing `sampleBlock`, because rendering "Contains a sample"
 * is the entire point of admitting a sampled track. Do not "unify" the
 * two by feeding this function the gate's signal — the label disappears.
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
