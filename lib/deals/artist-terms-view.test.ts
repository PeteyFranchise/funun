// ─── 261121-505 Task 3 — the pure seam, both directions asserted ──────────
//
// Every behaviour below is asserted withheld AND open, per the house pattern
// in lib/deals/admin-deal-queue-view.test.ts: a withheld expectation with no
// open-path control proves nothing, because deleting the withholding entirely
// would leave the withheld assertion's sibling untested and the regression
// undetected.
//
// artistTermsView takes `withheld` as an explicit boolean input rather than
// reading isReadWithheld internally, so no jest.isolateModulesAsync module
// surgery is needed here — the caller (this test) picks the state directly.

import { artistTermsView } from '@/lib/deals/artist-terms-view'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'

describe('261121-505 Task 3 — showTermsLinks', () => {
  it('withheld: false', () => {
    const view = artistTermsView({ withheld: true })
    expect(view.showTermsLinks).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = artistTermsView({ withheld: false })
    expect(view.showTermsLinks).toBe(true)
  })
})

describe('261121-505 Task 3 — introCopy promises nothing while withheld', () => {
  it('withheld and open copy differ', () => {
    const withheld = artistTermsView({ withheld: true })
    const open = artistTermsView({ withheld: false })
    expect(withheld.introCopy).not.toBe(open.introCopy)
  })

  it('withheld copy makes no timing promise and no good/bad implication', () => {
    const view = artistTermsView({ withheld: true })
    expect(view.introCopy).not.toMatch(
      /we will let you know|soon|shortly|coming back|opens back up|for now|right now|at the moment|currently|temporarily/i,
    )
  })
})

describe('261121-sqi Task 1 — emptyStateCopy routes the zero-row sentence through the seam', () => {
  it('withheld: does not instruct the project-level Rights page', () => {
    const view = artistTermsView({ withheld: true })
    expect(view.emptyStateCopy).not.toMatch(/rights page/i)
  })

  it('NEGATIVE CONTROL: open: keeps the existing Rights page instruction', () => {
    const view = artistTermsView({ withheld: false })
    expect(view.emptyStateCopy).toMatch(/rights page/i)
  })

  it('withheld empty-state copy makes no timing promise either', () => {
    const view = artistTermsView({ withheld: true })
    expect(view.emptyStateCopy).not.toMatch(
      /we will let you know|soon|shortly|coming back|opens back up|for now|right now|at the moment|currently|temporarily/i,
    )
  })

  it('withheld and open empty-state copy differ', () => {
    const withheld = artistTermsView({ withheld: true })
    const open = artistTermsView({ withheld: false })
    expect(withheld.emptyStateCopy).not.toBe(open.emptyStateCopy)
  })
})

// ─── Real-wiring coverage (261121-505 verification requirement) ───────────
//
// Every case above passes `withheld` as a literal boolean, by design (the
// plan requires the seam take an explicit input rather than read
// isReadWithheld itself). That means NONE of the cases above can ever
// observe a change to the real withholding source — mutating
// lib/deals/buyer-song-unit-read-withholding.ts would not fail a single
// assertion above, only the unrelated blanket inventory assertion in
// __tests__/buyer-song-unit-withheld.test.ts.
//
// This block closes that gap: it calls the REAL, unmocked `isReadWithheld`
// exactly the way ArtistDealsList.tsx and app/(artist)/deals/page.tsx wire
// it into the seam, so a mutation to the real flag source (removing a
// surface from WITHHELD_READ_SURFACES, or flipping
// BUYER_SONG_UNIT_READS_WITHHELD) flips this specific named assertion, not
// just the inventory list.
describe('261121-505 — the real isReadWithheld wiring (no mocking), as the components call it', () => {
  it('artist_project_terms_links is withheld in production: the per-row terms link stays hidden', () => {
    const view = artistTermsView({ withheld: isReadWithheld('artist_project_terms_links') })
    expect(view.showTermsLinks).toBe(false)
  })

  it('artist_project_terms_links is withheld in production: the empty-state copy stays off the Rights page', () => {
    const view = artistTermsView({ withheld: isReadWithheld('artist_project_terms_links') })
    expect(view.emptyStateCopy).not.toMatch(/rights page/i)
  })
})
