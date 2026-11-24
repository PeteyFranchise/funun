// ─── 261121-505 Task 2 — the pure seam, both directions asserted ──────────
//
// Every behaviour below is asserted withheld AND open, per the house pattern
// in lib/deals/admin-deal-queue-view.test.ts: a withheld expectation with no
// open-path control proves nothing, because deleting the withholding entirely
// would leave the withheld assertion's sibling untested and the regression
// undetected.
//
// buyerRequestIdentityView takes `withheld` as an explicit boolean input
// rather than reading isReadWithheld internally, so no
// jest.isolateModulesAsync module surgery is needed here — the caller (this
// test) picks the state directly.

import {
  buyerRequestIdentityView,
  REQUEST_IDENTITY_WITHHELD_NOTICE,
} from '@/lib/deals/request-identity-view'
import { isReadWithheld, BEING_CONFIRMED } from '@/lib/deals/buyer-song-unit-read-withholding'

describe('261121-505 Task 2 — displayHeading', () => {
  it('withheld: never the project title', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: true })
    expect(view.displayHeading).toBe(BEING_CONFIRMED)
    expect(view.displayHeading).not.toBe('An EP')
  })

  it('NEGATIVE CONTROL: open: the project title', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: false })
    expect(view.displayHeading).toBe('An EP')
  })

  it('open: falls back to "Unknown project" when no title is available', () => {
    const view = buyerRequestIdentityView({ projectTitle: null, withheld: false })
    expect(view.displayHeading).toBe('Unknown project')
  })
})

describe('261121-505 Task 2 — identityNotice', () => {
  it('withheld: present', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: true })
    expect(view.identityNotice).toBe(REQUEST_IDENTITY_WITHHELD_NOTICE)
  })

  it('NEGATIVE CONTROL: open: absent', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: false })
    expect(view.identityNotice).toBeNull()
  })
})

describe('261121-505 Task 2 — showTrackTitles', () => {
  it('withheld: false', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: true })
    expect(view.showTrackTitles).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = buyerRequestIdentityView({ projectTitle: 'An EP', withheld: false })
    expect(view.showTrackTitles).toBe(true)
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
// exactly the way OrgRequestDashboard.tsx and app/sync/requests/[id]/page.tsx
// wire it into the seam, so a mutation to the real flag source (removing a
// surface from WITHHELD_READ_SURFACES, or flipping
// BUYER_SONG_UNIT_READS_WITHHELD) flips these specific named assertions, not
// just the inventory list.
describe('261121-505 — the real isReadWithheld wiring (no mocking), as the components call it', () => {
  it('buyer_request_identity is withheld in production: the project title is not the subject, and track titles are hidden', () => {
    const view = buyerRequestIdentityView({
      projectTitle: 'An EP',
      withheld: isReadWithheld('buyer_request_identity'),
    })
    expect(view.displayHeading).not.toBe('An EP')
    expect(view.showTrackTitles).toBe(false)
    expect(view.identityNotice).toBe(REQUEST_IDENTITY_WITHHELD_NOTICE)
  })
})
