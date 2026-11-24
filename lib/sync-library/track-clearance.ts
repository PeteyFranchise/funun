import { rightsBadge, type CatalogRightsCode } from '@/lib/sync-library/gate'
import { syncReadinessCoverage, type CatalogProjectLike } from '@/lib/deals/catalog'
import type { Stage3Result } from '@/lib/vault/stage3'
import type { TrackAiProvenanceVerdict } from '@/lib/catalogue/track-work-link'
import type { ReadinessItem } from '@/types'
import { trackExposure, type TrackExposureInput } from '@/lib/sync-library/track-exposure'

// ─── trackClearance — what remains before THIS track can be licensed? ────
//
// The second of owner decision D-11's two authorities. The first,
// trackExposure, decides discoverability. This one decides the BADGE and the
// licensing path, and it never removes a track from the catalogue:
//
//   "A non-ready result changes the badge and routes the buyer to Funūn; it
//    does not hide an admitted track."  — D-11
//
// WHY THIS EXTENDS rightsBadge RATHER THAN REPLACING IT. rightsBadge
// (lib/sync-library/gate.ts:50-55) is already this codebase's authority on
// rights standing, and D-11 did not change what it computes — only what the
// answer is allowed to control. Defining a second rights standing here would
// reintroduce exactly the two-definitions problem the repo's doctrine forbids.
// So rightsBadge is consumed, and extended with the two facts it does not
// consider: the terminal listing state, and AI provenance.
//
// The buyer sees three states. rightsBadge's 'partial' and 'contact' BOTH
// collapse to 'clearance_required', because the buyer-facing difference D-11
// describes is binary — ready, or contact Funūn. The distinction rightsBadge
// draws is not lost: it survives in `outstanding`, which is also what the
// artist-facing journey (S5c) renders. One computation, two audiences.
//
// AI PROVENANCE: 'unresolved' can never reach 'rights_ready'. Absence of a
// disqualifier is not clearance — the reframed owner decision D-10 is explicit
// that only a manual, explicitly-approved attestation establishes a negative,
// and that the database does not enforce it.

export type ClearanceItemKind = 'required' | 'human_review' | 'optional'

export type ClearanceItem = {
  key: string
  kind: ClearanceItemKind
  /** Plain-language reason. Rendered to staff and, via S5c, to the artist. */
  reason: string
}

export type TrackClearance = {
  status: 'rights_ready' | 'clearance_required' | 'unavailable'
  outstanding: ClearanceItem[]
}

export type TrackClearanceInput = {
  /** The same input trackExposure takes — the two results must agree on 'unavailable'. */
  exposure: TrackExposureInput
  /** Project shape for the readiness-coverage question. */
  project: CatalogProjectLike
  /** Readiness items as the caller assembled them. */
  readinessItems: ReadinessItem[]
  /** Document/sample standing, the same Stage3Result rightsBadge consumes. */
  stage3: Stage3Result
  /**
   * AI provenance for this track. Pass null ONLY where plan 50-02 has not yet
   * landed; null is treated as unresolved and yields a human_review item —
   * never silence, and never 'rights_ready'.
   */
  aiProvenance: TrackAiProvenanceVerdict | null
}

export function trackClearance(input: TrackClearanceInput): TrackClearance {
  const outstanding: ClearanceItem[] = []

  // The ONE state the two authorities share. D-11 distinguishes this from
  // "ordinary clearance work in progress": Funūn cannot offer the track at all.
  const exposure = trackExposure(input.exposure)
  if (exposure.status === 'unavailable') {
    return {
      status: 'unavailable',
      outstanding: [
        {
          key: `listing_${exposure.reason}`,
          kind: 'human_review',
          reason: `This listing was ${exposure.reason}, so Funūn is not offering the track.`,
        },
      ],
    }
  }

  // ── Rights standing, delegated, never redefined ──
  const badge = rightsBadge(input.stage3)
  if (badge !== 'ready') {
    const missingRequired = input.stage3.requiredTotal - input.stage3.requiredComplete
    if (missingRequired > 0) {
      outstanding.push({
        key: 'required_documents',
        kind: 'required',
        reason: `${missingRequired} required document${missingRequired === 1 ? '' : 's'} not yet signed.`,
      })
    }
    if (input.stage3.sampleBlock) {
      outstanding.push({
        key: 'sample_clearance',
        kind: 'human_review',
        reason: 'A flagged sample needs clearance before this can be licensed. Funūn handles this with you.',
      })
    }
  }

  // ── The six sync-readiness keys. A CLEARANCE question since D-11. ──
  const coverage = syncReadinessCoverage(input.project, input.readinessItems)
  if (coverage.status === 'indeterminate') {
    outstanding.push({
      key: 'readiness_coverage',
      kind: 'human_review',
      reason: 'Funūn cannot yet evaluate every entry requirement for this track. Nothing for you to do.',
    })
  } else if (coverage.status === 'incomplete') {
    for (const key of coverage.incompleteKeys) {
      outstanding.push({ key, kind: 'required', reason: `${key} is not complete.` })
    }
  }

  // ── AI provenance. Absence of a disqualifier is not clearance. ──
  const ai = input.aiProvenance
  if (ai === null || ai.status === 'unresolved') {
    outstanding.push({
      key: 'ai_provenance',
      kind: 'human_review',
      reason: 'AI involvement has not been established for this recording and needs review.',
    })
  } else if (ai.status === 'disqualified') {
    for (const reason of ai.reasons) {
      outstanding.push({ key: 'ai_provenance', kind: 'required', reason })
    }
  }

  return {
    status: outstanding.length === 0 ? 'rights_ready' : 'clearance_required',
    outstanding,
  }
}

// ─── clearanceToCatalogRights — the one mapping to the buyer's badge code ─
// D-11 makes the buyer-facing answer binary: rights ready, or contact Funūn.
// So this maps onto the EXISTING CatalogRightsCode union
// (RIGHTS_BADGE_TO_CATALOG_RIGHTS, lib/sync-library/gate.ts) rather than
// inventing a parallel code — 'part' simply stops being produced, and the
// distinction it drew survives itemised in TrackClearance.outstanding.
//
// 'unavailable' maps to 'req' rather than to a fourth code on purpose: an
// unavailable track is never reachable through an exposure-filtered surface in
// the first place, so a code for it would be unreachable UI. The undefined case
// fails closed to 'req' for the same reason every other gate here does — a
// missing answer must never read as "cleared".
export function clearanceToCatalogRights(
  status: TrackClearance['status'] | undefined
): CatalogRightsCode {
  return status === 'rights_ready' ? 'ok' : 'req'
}
