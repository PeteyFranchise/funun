// ─── 261121-sqi Task 4 — the layer nothing else covers ────────────────────
//
// WHAT THIS LAYER IS FOR. Five seams in lib/deals/ decide a withholding fact
// and hand the component a typed answer. Three components built in the same
// round called the seam and then ignored part of what it returned — once by
// reading `isReadWithheld` a second time directly (DealsQueue.tsx), once by
// returning before the seam's output was ever read (ArtistDealsList.tsx's
// zero-row branch), and once by hardcoding copy the seam already produced
// (CatalogBrowserLight.tsx's open license modal). Every one of those three
// passed every existing test, because every existing test calls the seam
// function directly and none of them execute the component that is supposed
// to consume it. This file is the layer that would have caught all three: it
// reads each consumer's SOURCE TEXT and asserts the name of every security
// relevant output the seam produces still appears there, so that deleting a
// component's consumption of an output — not the seam call, not the flag
// input, the RENDERED CONSUMPTION — fails a test by name.
//
// WHAT THIS LAYER IS NOT. It does not prove the rendered output is correct.
// This repo's jest.config.js sets testEnvironment to 'node' (no jsdom), so a
// component cannot actually be rendered here — that verification is the
// owner's browser UAT. A source-text match also cannot prove the output is
// used in the RIGHT place, only that it is referenced somewhere in the file.
// It proves a narrower thing, but the thing three real defects needed: the
// component does not compute an answer the seam already owns, by silently
// ignoring the seam's version of that answer.
//
// Scanning runs on COMMENT-STRIPPED source (reusing the stripper from
// storage-usage-rpc-caller-lock.test.ts, which has its own test coverage of
// the stripper itself) so a comment that merely NAMES an output cannot
// satisfy the assertion in its place — this repo has been bitten by exactly
// that trap before (see sync-exposure-caller-lock.test.ts's header).
//
// One file per bracketed route is read directly via fs.readFileSync, which
// does not go through the jest CLI's test-path matching, so the bracketed
// `[id]` segment in app/sync/requests/[id]/page.tsx is not the regex trap
// that bites a bracketed TEST path — it only bites a path jest treats as a
// test spec, and this file is read as plain source data, not as a spec.

import { readFileSync } from 'fs'
import path from 'path'
import { stripComments } from './storage-usage-rpc-caller-lock.test'

function readSource(relPath: string): string {
  return stripComments(readFileSync(path.join(process.cwd(), relPath), 'utf8'))
}

const CATALOG_BROWSER = readSource(path.join('components', 'buyer', 'CatalogBrowserLight.tsx'))
const DEALS_QUEUE = readSource(path.join('components', 'admin', 'DealsQueue.tsx'))
const ORG_REQUEST_DASHBOARD = readSource(path.join('components', 'buyer', 'OrgRequestDashboard.tsx'))
const REQUEST_DETAIL_PAGE = readSource(path.join('app', 'sync', 'requests', '[id]', 'page.tsx'))
const REQUEST_NEW_PAGE = readSource(path.join('app', 'sync', 'requests', 'new', 'page.tsx'))
const ARTIST_DEALS_LIST = readSource(path.join('components', 'deals', 'ArtistDealsList.tsx'))
const ARTIST_DEALS_PAGE = readSource(path.join('app', '(artist)', 'deals', 'page.tsx'))

/** Whole-identifier text match — passes for both a destructured name
 * (`const { x } = seam(...)`) and a dot-accessed one (`view.x`), and fails
 * once the identifier is deleted from the file, which is the whole point. */
function consumes(code: string, output: string): boolean {
  return new RegExp(`\\b${output}\\b`).test(code)
}

describe('261121-sqi Task 4 — catalogRowActionsView consumed by CatalogBrowserLight.tsx', () => {
  it.each([
    'showPlayControl',
    'showMiniPlayer',
    'licenseMode',
    'licenseHeading',
    'licenseBody',
    'licenseCta',
    'emptyMode',
  ])('consumes %s', output => {
    expect(consumes(CATALOG_BROWSER, output)).toBe(true)
  })
})

describe('261121-sqi Task 4 — adminDealQueueView consumed by DealsQueue.tsx', () => {
  it.each([
    'visibleRows',
    'showMatchControls',
    'showReadiness',
    'showMismatchNote',
    'matchBadgeText',
    'matchBadgeTone',
  ])('consumes %s', output => {
    expect(consumes(DEALS_QUEUE, output)).toBe(true)
  })

  it('calls isReadWithheld(\'matched_precleared\') exactly once — building the seam input, never re-reading it for the badge', () => {
    // The regression this guards: the badge used to call isReadWithheld a
    // SECOND time, once for its class string and once for its text, instead
    // of reading matchBadgeText/matchBadgeTone off queueView.rowView(row).
    // Counting occurrences catches either of those two reappearing, not just
    // one of them.
    const occurrences = DEALS_QUEUE.match(/isReadWithheld\('matched_precleared'\)/g) ?? []
    expect(occurrences).toHaveLength(1)
  })
})

describe('261121-sqi Task 4 — buyerRequestIdentityView consumed by OrgRequestDashboard.tsx', () => {
  it.each(['displayHeading', 'identityNotice'])('consumes %s', output => {
    expect(consumes(ORG_REQUEST_DASHBOARD, output)).toBe(true)
  })
})

describe('261121-sqi Task 4 — buyerRequestIdentityView consumed by app/sync/requests/[id]/page.tsx', () => {
  it.each(['displayHeading', 'identityNotice', 'showTrackTitles'])('consumes %s', output => {
    expect(consumes(REQUEST_DETAIL_PAGE, output)).toBe(true)
  })
})

describe('261121-sqi Task 4 — requestComposerView consumed by app/sync/requests/new/page.tsx', () => {
  it.each(['showComposer', 'heading', 'body', 'contactHref'])('consumes %s', output => {
    expect(consumes(REQUEST_NEW_PAGE, output)).toBe(true)
  })
})

describe('261121-sqi Task 4 — artistTermsView consumed by ArtistDealsList.tsx', () => {
  it.each(['showTermsLinks', 'emptyStateCopy'])('consumes %s', output => {
    expect(consumes(ARTIST_DEALS_LIST, output)).toBe(true)
  })
})

describe('261121-sqi Task 4 — artistTermsView consumed by app/(artist)/deals/page.tsx', () => {
  it('consumes introCopy', () => {
    expect(consumes(ARTIST_DEALS_PAGE, 'introCopy')).toBe(true)
  })
})
