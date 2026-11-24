// ─── Buyer request identity view (261121-505 Task 2) ───────────────────────
// Pure decision logic shared by components/buyer/OrgRequestDashboard.tsx and
// app/sync/requests/[id]/page.tsx, matching the house pattern set by
// lib/deals/admin-deal-queue-view.ts: explicit boolean withholding inputs,
// never `isReadWithheld` called from inside this module.
//
// WHY THIS EXISTS. `license_requests` is keyed to a project, and the song the
// request is actually about sits in a child table (`license_request_tracks`).
// Until a request names a captured song, the only subject line available is
// the project's title — and a project is never the licensing unit (see
// CLAUDE.md's Crate Vocabulary). Presenting that title as the request's
// subject is the same conflation the rest of this phase is closing.
//
// `app/sync/requests/[id]/page.tsx` had ZERO guards before this task: it
// rendered `project?.title ?? 'Unknown project'` as its own `<h1>` and listed
// every linked track title underneath, with no withholding at all. This seam
// closes that gap as well as OrgRequestDashboard's existing one.

import { BEING_CONFIRMED } from '@/lib/deals/buyer-song-unit-read-withholding'

export type BuyerRequestIdentityViewInput = {
  projectTitle: string | null
  /** True while the `buyer_request_identity` read surface must stay withheld. */
  withheld: boolean
}

export type BuyerRequestIdentityView = {
  /** Never the project title while withheld — see the module header. */
  displayHeading: string
  /** Present while withheld, null when open. */
  identityNotice: string | null
  /** False while withheld — a multi track title list must not render. */
  showTrackTitles: boolean
}

/**
 * Shown beneath the heading while withheld. The single source for this
 * copy now — OrgRequestDashboard used to inline this string directly; this
 * module is where it lives so neither call site can drift from the other.
 */
export const REQUEST_IDENTITY_WITHHELD_NOTICE = 'Song details being confirmed'

export function buyerRequestIdentityView(input: BuyerRequestIdentityViewInput): BuyerRequestIdentityView {
  const { projectTitle, withheld } = input

  return {
    // BEING_CONFIRMED, not the project title — a project is never the
    // licensing unit, and the subject line must not claim one is.
    displayHeading: withheld ? BEING_CONFIRMED : projectTitle ?? 'Unknown project',
    identityNotice: withheld ? REQUEST_IDENTITY_WITHHELD_NOTICE : null,
    showTrackTitles: !withheld,
  }
}
