// ─── Catalog row actions view (261121-505 Task 1) ──────────────────────────
// Pure decision logic extracted from components/buyer/CatalogBrowserLight.tsx
// so it is testable without jsdom (jest.config.js's testEnvironment is
// 'node' — a component's render output cannot be observed in this repo's
// test suite). Matches the house pattern set by
// lib/deals/admin-deal-queue-view.ts: explicit boolean withholding inputs,
// never `isReadWithheld` called from inside this module.
//
// Two read surfaces, both still project-shaped today:
// 1. simulated_playback — the playhead moves over a row whose identity is a
//    PROJECT, presenting a release as a playable song. Governs whether the
//    play control renders at all, and whether the sticky mini player (which
//    only exists once a row is playing) can ever appear.
// 2. license_request_modal — the multi-track licence form lets a buyer tick
//    several sibling songs into one request, which is not how these deals
//    are done (D-12) and the write route already refuses the POST.
//
// THE COPY FIX THIS TASK CARRIES. The withheld modal's CTA used to read
// "Email us about this song" about a row whose identity is a PROJECT — the
// exact conflation this phase exists to stop. `licenseCta` is the one and
// only place that string is produced now, and it does not claim a song.

import {
  LICENCE_REQUEST_WITHHELD_HEADING,
  LICENCE_REQUEST_WITHHELD_BODY,
} from '@/lib/deals/buyer-song-unit-read-withholding'

export type LicenseMode = 'withheld' | 'open'

export type CatalogRowActionsViewInput = {
  /** True while the `simulated_playback` read surface must stay withheld. */
  playbackWithheld: boolean
  /** True while the `license_request_modal` read surface must stay withheld. */
  modalWithheld: boolean
  /** True when a row is the current playback target (drives the sticky mini player). */
  hasRow: boolean
}

export type CatalogRowActionsView = {
  /** False while withheld — the per-row play button must not render. */
  showPlayControl: boolean
  /** False while withheld — the sticky mini player must not render, even if a row exists. */
  showMiniPlayer: boolean
  licenseMode: LicenseMode
  licenseHeading: string
  licenseBody: string
  licenseCta: string
}

/**
 * Withheld CTA text for the licence request modal.
 *
 * NOT "this song": the row this panel opens from is still a project, so
 * saying "this song" asserts an identity the data does not carry. This is
 * the ninth conflation named in the rev5 review — fixed here, and only here.
 */
export const LICENSE_CTA_WITHHELD = 'Email us about this listing'
const LICENSE_HEADING_OPEN = 'Request a license'
const LICENSE_BODY_OPEN =
  "Tell the artist how you'll use it. Inside their pre-cleared terms this moves fast."
const LICENSE_CTA_OPEN = 'Send request'

export function catalogRowActionsView(input: CatalogRowActionsViewInput): CatalogRowActionsView {
  const { playbackWithheld, modalWithheld, hasRow } = input

  return {
    showPlayControl: !playbackWithheld,
    showMiniPlayer: hasRow && !playbackWithheld,
    licenseMode: modalWithheld ? 'withheld' : 'open',
    licenseHeading: modalWithheld ? LICENCE_REQUEST_WITHHELD_HEADING : LICENSE_HEADING_OPEN,
    licenseBody: modalWithheld ? LICENCE_REQUEST_WITHHELD_BODY : LICENSE_BODY_OPEN,
    licenseCta: modalWithheld ? LICENSE_CTA_WITHHELD : LICENSE_CTA_OPEN,
  }
}
