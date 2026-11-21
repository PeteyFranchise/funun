// ─── Request composer view (261121-505 Task 3) ─────────────────────────────
// Pure decision logic for app/sync/requests/new/page.tsx, matching the house
// pattern set by lib/deals/admin-deal-queue-view.ts: an explicit boolean
// withholding input, never `isReadWithheld` called from inside this module.
//
// WHY THIS EXISTS. `RequestComposer` is reached with `?project=` and offers
// every track on that project, so one request could name several
// recordings. The catalog's multi-track licence modal was already withheld
// (Task 1); withholding only that one left this second door into the same
// shape wide open.

import {
  LICENCE_REQUEST_WITHHELD_HEADING,
  LICENCE_REQUEST_WITHHELD_BODY,
} from '@/lib/deals/buyer-song-unit-read-withholding'
import { syncContactHref } from '@/lib/sync-library/contact'

export type RequestComposerViewInput = {
  /** True while the `request_composer` read surface must stay withheld. */
  withheld: boolean
}

export type RequestComposerView = {
  /** False while withheld — RequestComposer must not render. */
  showComposer: boolean
  heading: string | null
  body: string | null
  contactHref: string | null
}

export function requestComposerView(input: RequestComposerViewInput): RequestComposerView {
  const { withheld } = input

  if (!withheld) {
    return { showComposer: true, heading: null, body: null, contactHref: null }
  }

  return {
    showComposer: false,
    heading: LICENCE_REQUEST_WITHHELD_HEADING,
    body: LICENCE_REQUEST_WITHHELD_BODY,
    contactHref: syncContactHref('Licensing enquiry'),
  }
}
