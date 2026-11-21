// ─── Admin deal queue view (261121-452) ─────────────────────────────────────
// Pure decision logic extracted from components/admin/DealsQueue.tsx so it is
// testable without jsdom (jest.config.js:49 sets testEnvironment 'node', so a
// component's render output cannot be observed in this repo's test suite).
//
// Two HIGH findings this closes:
// 1. The match-filter chips rendered active state off `matchFilter` while the
//    filter body was skipped entirely under withholding — queue membership
//    never changed no matter which chip was selected.
// 2. The amber mismatch note was computed from `matched_precleared` with no
//    withholding guard at all, so neutralising the badge did nothing to stop
//    the queue publishing a negative conclusion computed from project terms.
//
// Withholding decisions are taken as explicit boolean inputs
// (`matchedPreclearedWithheld`, `readinessWithheld`) rather than read via
// `isReadWithheld` inside this module. A pure function whose output depends
// on a module-level constant cannot be exercised for both states without
// module surgery (see __tests__/buyer-song-unit-withheld.test.ts's
// `jest.isolateModulesAsync` loaders) — the caller supplies the decision.

import type { DealStage, LicenseRequestAdmin } from '@/lib/deals/schema'

export type MatchFilter = 'unmatched' | 'matched' | 'all'

export type AdminDealRow = {
  request: LicenseRequestAdmin
  buyerOrgName: string
  projectTitle: string
  projectReadinessScore: number | null
  submitterName: string | null
  ownerName: string | null
}

export type AdminDealQueueViewInput = {
  rows: AdminDealRow[]
  matchFilter: MatchFilter
  stageFilter: DealStage | null
  unassignedOnly: boolean
  /** True while the `matched_precleared` read surface must stay withheld. */
  matchedPreclearedWithheld: boolean
  /** True while the `project_readiness_figure` read surface must stay withheld. */
  readinessWithheld: boolean
}

export type AdminDealRowView = {
  matchBadgeText: string
  showMismatchNote: boolean
  mismatchNote: string | null
}

export type AdminDealQueueView = {
  visibleRows: AdminDealRow[]
  /** False while withheld — the three match chips must not render at all. */
  showMatchControls: boolean
  /** False while withheld — the project readiness figure must not render. */
  showReadiness: boolean
  rowView: (row: AdminDealRow) => AdminDealRowView
}

/** Neutral badge copy while `matched_precleared` is withheld (component :196-198). */
const MATCH_BADGE_WITHHELD_TEXT = 'Terms match being confirmed'

export function adminDealQueueView(input: AdminDealQueueViewInput): AdminDealQueueView {
  const {
    rows,
    matchFilter,
    stageFilter,
    unassignedOnly,
    matchedPreclearedWithheld,
    readinessWithheld,
  } = input

  const visibleRows = rows.filter(row => {
    // 50.5 Task 2 — WITHHELD. `matched_precleared` is written from PROJECT
    // terms, so a match proven for one sibling can hide or surface a deal
    // about a different song. With the filter withheld, queue membership must
    // not depend on it at all.
    if (!matchedPreclearedWithheld) {
      if (matchFilter === 'unmatched' && row.request.matched_precleared) return false
      if (matchFilter === 'matched' && !row.request.matched_precleared) return false
    }
    if (stageFilter && row.request.stage !== stageFilter) return false
    if (unassignedOnly && row.request.owner_id) return false
    return true
  })

  function rowView(row: AdminDealRow): AdminDealRowView {
    const matchBadgeText = matchedPreclearedWithheld
      ? MATCH_BADGE_WITHHELD_TEXT
      : row.request.matched_precleared
        ? 'Pre-cleared match'
        : 'Needs negotiation'

    // 261121-452 — the mismatch note is a NEGATIVE CONCLUSION computed from
    // project terms (`!matched_precleared && admin_notes`). Neutralising the
    // badge above did not stop this note from publishing that conclusion, so
    // it is gated on the same withholding decision as the badge and the
    // filter, not left to run unconditionally.
    const mismatchNote =
      !matchedPreclearedWithheld && !row.request.matched_precleared && row.request.admin_notes
        ? row.request.admin_notes
        : null

    return {
      matchBadgeText,
      showMismatchNote: mismatchNote != null,
      mismatchNote,
    }
  }

  return {
    visibleRows,
    showMatchControls: !matchedPreclearedWithheld,
    // 50.5 Task 2 — WITHHELD. This is the PROJECT's release readiness, shown
    // beside a deal whose subject is one song. A number that looks like an
    // answer and is not is the owner_segment lesson this repo already paid
    // for.
    showReadiness: !readinessWithheld,
    rowView,
  }
}
