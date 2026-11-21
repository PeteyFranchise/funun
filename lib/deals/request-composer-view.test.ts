// ─── 261121-505 Task 3 — the pure seam, both directions asserted ──────────
//
// Every behaviour below is asserted withheld AND open, per the house pattern
// in lib/deals/admin-deal-queue-view.test.ts: a withheld expectation with no
// open-path control proves nothing, because deleting the withholding entirely
// would leave the withheld assertion's sibling untested and the regression
// undetected.
//
// requestComposerView takes `withheld` as an explicit boolean input rather
// than reading isReadWithheld internally, so no jest.isolateModulesAsync
// module surgery is needed here — the caller (this test) picks the state
// directly.

import { requestComposerView } from '@/lib/deals/request-composer-view'
import {
  isReadWithheld,
  LICENCE_REQUEST_WITHHELD_HEADING,
  LICENCE_REQUEST_WITHHELD_BODY,
} from '@/lib/deals/buyer-song-unit-read-withholding'

describe('261121-505 Task 3 — showComposer', () => {
  it('withheld: false', () => {
    const view = requestComposerView({ withheld: true })
    expect(view.showComposer).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = requestComposerView({ withheld: false })
    expect(view.showComposer).toBe(true)
  })
})

describe('261121-505 Task 3 — withheld copy and contact action', () => {
  it('withheld: the shared withheld constants and a contact mailto href', () => {
    const view = requestComposerView({ withheld: true })
    expect(view.heading).toBe(LICENCE_REQUEST_WITHHELD_HEADING)
    expect(view.body).toBe(LICENCE_REQUEST_WITHHELD_BODY)
    expect(view.contactHref).toMatch(/^mailto:/)
  })

  it('NEGATIVE CONTROL: open: no withheld copy, no contact action', () => {
    const view = requestComposerView({ withheld: false })
    expect(view.heading).toBeNull()
    expect(view.body).toBeNull()
    expect(view.contactHref).toBeNull()
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
// exactly the way app/sync/requests/new/page.tsx wires it into the seam, so
// a mutation to the real flag source (removing a surface from
// WITHHELD_READ_SURFACES, or flipping BUYER_SONG_UNIT_READS_WITHHELD) flips
// this specific named assertion, not just the inventory list.
describe('261121-505 — the real isReadWithheld wiring (no mocking), as the page calls it', () => {
  it('request_composer is withheld in production: the composer stays hidden behind the withheld copy', () => {
    const view = requestComposerView({ withheld: isReadWithheld('request_composer') })
    expect(view.showComposer).toBe(false)
    expect(view.heading).toBe(LICENCE_REQUEST_WITHHELD_HEADING)
  })
})
