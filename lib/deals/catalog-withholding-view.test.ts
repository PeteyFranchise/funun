// ─── 261121-505 Task 1 — the pure seam, both directions asserted ──────────
//
// Every behaviour below is asserted withheld AND open, per the house pattern
// in lib/deals/admin-deal-queue-view.test.ts: a withheld expectation with no
// open-path control proves nothing, because deleting the withholding entirely
// would leave the withheld assertion's sibling untested and the regression
// undetected.
//
// catalogRowActionsView takes playbackWithheld / modalWithheld as explicit
// boolean inputs rather than reading isReadWithheld internally, so no
// jest.isolateModulesAsync module surgery is needed here — the caller (this
// test) picks the state directly.

import {
  catalogRowActionsView,
  LICENSE_CTA_WITHHELD,
} from '@/lib/deals/catalog-withholding-view'
import {
  isReadWithheld,
  LICENCE_REQUEST_WITHHELD_HEADING,
  LICENCE_REQUEST_WITHHELD_BODY,
} from '@/lib/deals/buyer-song-unit-read-withholding'

describe('261121-505 Task 1 — showPlayControl', () => {
  it('withheld: false', () => {
    const view = catalogRowActionsView({ playbackWithheld: true, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.showPlayControl).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.showPlayControl).toBe(true)
  })
})

describe('261121-505 Task 1 — showMiniPlayer', () => {
  it('withheld: false even when a row is the current playback target', () => {
    const view = catalogRowActionsView({ playbackWithheld: true, modalWithheld: false, hasRow: true, catalogueWithheld: false, hasRows: true })
    expect(view.showMiniPlayer).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true when a row is the current playback target', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: true, catalogueWithheld: false, hasRows: true })
    expect(view.showMiniPlayer).toBe(true)
  })

  it('no row means no mini player in either state', () => {
    const withheld = catalogRowActionsView({ playbackWithheld: true, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    const open = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(withheld.showMiniPlayer).toBe(false)
    expect(open.showMiniPlayer).toBe(false)
  })
})

describe('261121-505 Task 1 — licenseMode', () => {
  it('withheld: "withheld"', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: true, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseMode).toBe('withheld')
  })

  it('NEGATIVE CONTROL: open: "open"', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseMode).toBe('open')
  })
})

describe('261121-505 Task 1 — licenseHeading / licenseBody carry the withheld copy', () => {
  it('withheld: the shared withheld constants, not a project-shaped substitute', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: true, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseHeading).toBe(LICENCE_REQUEST_WITHHELD_HEADING)
    expect(view.licenseBody).toBe(LICENCE_REQUEST_WITHHELD_BODY)
  })

  it('NEGATIVE CONTROL: open: different copy entirely', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseHeading).not.toBe(LICENCE_REQUEST_WITHHELD_HEADING)
    expect(view.licenseBody).not.toBe(LICENCE_REQUEST_WITHHELD_BODY)
  })
})

describe('261121-505 Task 1 — licenseCta never claims a song identity', () => {
  it('withheld: the fixed replacement string, and it does not say "this song"', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: true, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseCta).toBe(LICENSE_CTA_WITHHELD)
    expect(view.licenseCta).not.toMatch(/this song/i)
  })

  it('NEGATIVE CONTROL: open: a different CTA, also not claiming a song', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseCta).not.toBe(LICENSE_CTA_WITHHELD)
    expect(view.licenseCta).not.toMatch(/this song/i)
  })
})

// ─── Real-wiring coverage (261121-505 verification requirement) ───────────
//
// Every case above passes `playbackWithheld`/`modalWithheld` as literal
// booleans, by design (the plan requires the seam take explicit inputs
// rather than read `isReadWithheld` itself). That means NONE of the cases
// above can ever observe a change to the real withholding source — mutating
// lib/deals/buyer-song-unit-read-withholding.ts would not fail a single
// assertion above, only the unrelated blanket inventory assertion in
// __tests__/buyer-song-unit-withheld.test.ts.
//
// This block closes that gap: it calls the REAL, unmocked `isReadWithheld`
// exactly the way components/buyer/CatalogBrowserLight.tsx wires it into the
// seam, so a mutation to the real flag source (removing a surface from
// WITHHELD_READ_SURFACES, or flipping BUYER_SONG_UNIT_READS_WITHHELD) flips
// these specific named assertions, not just the inventory list.
describe('261121-505 — the real isReadWithheld wiring (no mocking), as the component calls it', () => {
  it('simulated_playback is withheld in production: play control and mini player stay hidden', () => {
    const view = catalogRowActionsView({
      playbackWithheld: isReadWithheld('simulated_playback'),
      modalWithheld: isReadWithheld('license_request_modal'),
      hasRow: true,
      catalogueWithheld: false,
      hasRows: true,
    })
    expect(view.showPlayControl).toBe(false)
    expect(view.showMiniPlayer).toBe(false)
  })

  it('license_request_modal is withheld in production: the withheld copy renders, with no song claim', () => {
    const view = catalogRowActionsView({
      playbackWithheld: isReadWithheld('simulated_playback'),
      modalWithheld: isReadWithheld('license_request_modal'),
      hasRow: false,
      catalogueWithheld: false,
      hasRows: true,
    })
    expect(view.licenseMode).toBe('withheld')
    expect(view.licenseCta).not.toMatch(/this song/i)
  })
})

// ─── 261121-sqi Task 3 — the open body carries the full live sentence ────
//
// LICENSE_BODY_OPEN was previously truncated against what
// CatalogBrowserLight.tsx actually rendered in its open branch, which had a
// second sentence this seam's constant dropped. These pin the full meaning
// (both the "moves fast" clause and the "under their floor" clause) stayed,
// and that no en dash, em dash, or double hyphen made it into the string per
// the house no-dashes copy rule.
describe('261121-sqi Task 3 — licenseBody carries the full open sentence, no dashes', () => {
  it('open: keeps both clauses of the live copy', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseBody).toMatch(/pre-cleared terms this moves fast/i)
    expect(view.licenseBody).toMatch(/under their floor/i)
  })

  it('open: no en dash, em dash, or double hyphen in any user-facing output', () => {
    const view = catalogRowActionsView({ playbackWithheld: false, modalWithheld: false, hasRow: false, catalogueWithheld: false, hasRows: true })
    expect(view.licenseHeading).not.toMatch(/[–—]|--/)
    expect(view.licenseBody).not.toMatch(/[–—]|--/)
    expect(view.licenseCta).not.toMatch(/[–—]|--/)
  })
})

// ─── 261121-qt2 Task 2 — emptyMode, the signal CHOSEN not computed ────────
//
// catalogueWithheld here is always a literal boolean, by design: the real
// signal comes from lib/deals/catalog-query.ts's loadCatalogPage (see that
// module's own test file and its mutation check), never from this seam.
// These three cases pin which of CatalogBrowserLight.tsx's two existing
// empty-state copy blocks (plus the rows branch) gets chosen from it.
describe('261121-qt2 Task 2 — emptyMode', () => {
  it('withheld: catalogueWithheld true and no rows -> "withheld"', () => {
    const view = catalogRowActionsView({
      playbackWithheld: false,
      modalWithheld: false,
      hasRow: false,
      catalogueWithheld: true,
      hasRows: false,
    })
    expect(view.emptyMode).toBe('withheld')
  })

  it('genuinely empty: catalogueWithheld false and no rows -> "empty"', () => {
    const view = catalogRowActionsView({
      playbackWithheld: false,
      modalWithheld: false,
      hasRow: false,
      catalogueWithheld: false,
      hasRows: false,
    })
    expect(view.emptyMode).toBe('empty')
  })

  it('rows present -> "rows", even if catalogueWithheld were somehow still true', () => {
    // Defensive: hasRows must win over a stale/inconsistent catalogueWithheld
    // input. A caller with real rows to show should show them.
    const view = catalogRowActionsView({
      playbackWithheld: false,
      modalWithheld: false,
      hasRow: false,
      catalogueWithheld: true,
      hasRows: true,
    })
    expect(view.emptyMode).toBe('rows')
  })
})
