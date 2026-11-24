// ─── 261121-452 Task 1 — the pure seam, both directions asserted ───────────
//
// Every behaviour below is asserted withheld AND open, per the house pattern
// in __tests__/buyer-song-unit-withheld.test.ts (usage_cleared_filter,
// selects_ai_draft): a withheld expectation with no open-path control proves
// nothing, because deleting the withholding entirely would leave the withheld
// assertion's sibling untested and the regression undetected.
//
// adminDealQueueView takes matchedPreclearedWithheld / readinessWithheld as
// explicit boolean inputs rather than reading isReadWithheld internally, so
// no jest.isolateModulesAsync module surgery is needed here — the caller
// (this test) picks the state directly.

import { adminDealQueueView, type AdminDealRow } from '@/lib/deals/admin-deal-queue-view'
import { isReadWithheld } from '@/lib/deals/buyer-song-unit-read-withholding'
import type { LicenseRequestAdmin } from '@/lib/deals/schema'

function makeRequest(overrides: Partial<LicenseRequestAdmin>): LicenseRequestAdmin {
  return {
    id: 'req-1',
    buyer_org_id: 'org-1',
    created_by: 'buyer-user-1',
    vault_project_id: 'proj-1',
    usage_types: [],
    territories: [],
    term_months: null,
    exclusivity: false,
    budget_cents: null,
    need_by: null,
    buyer_notes: null,
    stage: 'submitted',
    matched_precleared: false,
    gross_fee_cents: null,
    contract_document_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    owner_id: null,
    admin_notes: null,
    commission_pct: null,
    artist_net_cents: null,
    ...overrides,
  }
}

function makeRow(overrides: Partial<LicenseRequestAdmin>, rowOverrides: Partial<AdminDealRow> = {}): AdminDealRow {
  return {
    request: makeRequest(overrides),
    buyerOrgName: 'Acme Sync',
    projectTitle: 'An EP',
    projectReadinessScore: 80,
    submitterName: 'Jamie Buyer',
    ownerName: null,
    ...rowOverrides,
  }
}

// row A: matched, no admin notes, assigned, in_negotiation
const ROW_MATCHED = makeRow({
  id: 'req-matched',
  matched_precleared: true,
  admin_notes: null,
  owner_id: 'staff-1',
  stage: 'in_negotiation',
})

// row B: unmatched, with admin notes, unassigned, submitted
const ROW_UNMATCHED_WITH_NOTE = makeRow({
  id: 'req-unmatched-note',
  matched_precleared: false,
  admin_notes: 'Chased the terms, still waiting',
  owner_id: null,
  stage: 'submitted',
})

const ROWS = [ROW_MATCHED, ROW_UNMATCHED_WITH_NOTE]

describe('261121-452 Task 1 — showMatchControls', () => {
  it('withheld: false', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'unmatched',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    expect(view.showMatchControls).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'unmatched',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.showMatchControls).toBe(true)
  })
})

describe('261121-452 Task 1 — visibleRows ignores matchFilter while withheld, honors it when open', () => {
  it('withheld: identical rows for unmatched, matched, and all', () => {
    const base = {
      rows: ROWS,
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    } as const
    const unmatched = adminDealQueueView({ ...base, matchFilter: 'unmatched' }).visibleRows
    const matched = adminDealQueueView({ ...base, matchFilter: 'matched' }).visibleRows
    const all = adminDealQueueView({ ...base, matchFilter: 'all' }).visibleRows
    expect(unmatched).toEqual(ROWS)
    expect(matched).toEqual(ROWS)
    expect(all).toEqual(ROWS)
  })

  it('NEGATIVE CONTROL: open: unmatched and matched filters produce DIFFERENT row sets', () => {
    const base = {
      rows: ROWS,
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    } as const
    const unmatched = adminDealQueueView({ ...base, matchFilter: 'unmatched' }).visibleRows
    const matched = adminDealQueueView({ ...base, matchFilter: 'matched' }).visibleRows
    expect(unmatched).toEqual([ROW_UNMATCHED_WITH_NOTE])
    expect(matched).toEqual([ROW_MATCHED])
    // The difference IS the behaviour the finding said was missing: picking a
    // different chip used to leave queue membership unchanged.
    expect(unmatched).not.toEqual(matched)
  })
})

describe('261121-452 Task 1 — showMismatchNote', () => {
  it('withheld: false even for an unmatched row with admin notes', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    const rv = view.rowView(ROW_UNMATCHED_WITH_NOTE)
    expect(rv.showMismatchNote).toBe(false)
    expect(rv.mismatchNote).toBeNull()
  })

  it('NEGATIVE CONTROL: open: true for an unmatched row with admin notes', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    const rv = view.rowView(ROW_UNMATCHED_WITH_NOTE)
    expect(rv.showMismatchNote).toBe(true)
    expect(rv.mismatchNote).toBe('Chased the terms, still waiting')
  })

  it('a matched row never shows a mismatch note, withheld or open', () => {
    const withheld = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    }).rowView(ROW_MATCHED)
    const open = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    }).rowView(ROW_MATCHED)
    expect(withheld.showMismatchNote).toBe(false)
    expect(open.showMismatchNote).toBe(false)
  })
})

describe('261121-452 Task 1 — showReadiness', () => {
  it('withheld: false', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: true,
    })
    expect(view.showReadiness).toBe(false)
  })

  it('NEGATIVE CONTROL: open: true', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.showReadiness).toBe(true)
  })
})

describe('261121-452 Task 1 — matchBadgeText', () => {
  it('withheld: the neutral string regardless of matched_precleared', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    expect(view.rowView(ROW_MATCHED).matchBadgeText).toBe('Terms match being confirmed')
    expect(view.rowView(ROW_UNMATCHED_WITH_NOTE).matchBadgeText).toBe('Terms match being confirmed')
  })

  it('NEGATIVE CONTROL: open: Pre-cleared match / Needs negotiation', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.rowView(ROW_MATCHED).matchBadgeText).toBe('Pre-cleared match')
    expect(view.rowView(ROW_UNMATCHED_WITH_NOTE).matchBadgeText).toBe('Needs negotiation')
  })
})

describe('261121-sqi Task 2 — matchBadgeTone', () => {
  it('withheld: "withheld" regardless of matched_precleared', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    expect(view.rowView(ROW_MATCHED).matchBadgeTone).toBe('withheld')
    expect(view.rowView(ROW_UNMATCHED_WITH_NOTE).matchBadgeTone).toBe('withheld')
  })

  it('NEGATIVE CONTROL: open: "matched" / "unmatched"', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.rowView(ROW_MATCHED).matchBadgeTone).toBe('matched')
    expect(view.rowView(ROW_UNMATCHED_WITH_NOTE).matchBadgeTone).toBe('unmatched')
  })
})

describe('261121-452 Task 1 — stage and unassigned filters keep working in BOTH states', () => {
  it('withheld: stage filter still narrows the queue', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: 'submitted',
      unassignedOnly: false,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    expect(view.visibleRows).toEqual([ROW_UNMATCHED_WITH_NOTE])
  })

  it('open: stage filter still narrows the queue', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: 'submitted',
      unassignedOnly: false,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.visibleRows).toEqual([ROW_UNMATCHED_WITH_NOTE])
  })

  it('withheld: unassigned-only toggle still narrows the queue', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: true,
      matchedPreclearedWithheld: true,
      readinessWithheld: false,
    })
    expect(view.visibleRows).toEqual([ROW_UNMATCHED_WITH_NOTE])
  })

  it('open: unassigned-only toggle still narrows the queue', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: true,
      matchedPreclearedWithheld: false,
      readinessWithheld: false,
    })
    expect(view.visibleRows).toEqual([ROW_UNMATCHED_WITH_NOTE])
  })
})

// ─── Real-wiring coverage (261121-452 verification requirement) ───────────
//
// Every case above passes `matchedPreclearedWithheld`/`readinessWithheld` as
// literal booleans, by design (the plan requires the seam take explicit
// inputs rather than read `isReadWithheld` itself). That design choice means
// NONE of the cases above can ever observe a change to the real withholding
// source — mutating lib/deals/buyer-song-unit-read-withholding.ts would not
// fail a single assertion above, only the unrelated blanket inventory
// assertion in __tests__/buyer-song-unit-withheld.test.ts.
//
// This block closes that gap: it calls the REAL, unmocked `isReadWithheld`
// exactly the way components/admin/DealsQueue.tsx wires it into the seam, so
// a mutation to the real flag source (removing a surface from
// WITHHELD_READ_SURFACES, or flipping BUYER_SONG_UNIT_READS_WITHHELD) flips
// these specific named assertions, not just the inventory list.
describe('261121-452 — the real isReadWithheld wiring (no mocking), as the component calls it', () => {
  it('matched_precleared is withheld in production: match controls stay hidden and the filter is inert', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'unmatched',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: isReadWithheld('matched_precleared'),
      readinessWithheld: isReadWithheld('project_readiness_figure'),
    })
    expect(view.showMatchControls).toBe(false)
    expect(view.visibleRows).toEqual(ROWS)
  })

  it('project_readiness_figure is withheld in production: the readiness figure stays hidden', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: isReadWithheld('matched_precleared'),
      readinessWithheld: isReadWithheld('project_readiness_figure'),
    })
    expect(view.showReadiness).toBe(false)
  })

  it('matched_precleared is withheld in production: the badge tone is "withheld", never "matched" or "unmatched"', () => {
    const view = adminDealQueueView({
      rows: ROWS,
      matchFilter: 'all',
      stageFilter: null,
      unassignedOnly: false,
      matchedPreclearedWithheld: isReadWithheld('matched_precleared'),
      readinessWithheld: isReadWithheld('project_readiness_figure'),
    })
    expect(view.rowView(ROW_MATCHED).matchBadgeTone).toBe('withheld')
    expect(view.rowView(ROW_UNMATCHED_WITH_NOTE).matchBadgeTone).toBe('withheld')
  })
})
