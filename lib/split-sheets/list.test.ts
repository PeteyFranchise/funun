// T-18-01 coverage: draft-status sheets are returned to the initiator
// only, and the rule is applied in the server merge (not the client).

import { mergeSplitSheetRows, type SplitSheetRow } from './list'

function sheet(overrides: Partial<SplitSheetRow>): SplitSheetRow {
  return {
    id: 'sheet-1',
    song_name: 'Ocean Drive',
    status: 'draft',
    initiator_user_id: 'user-a',
    created_at: '2026-07-01T00:00:00.000Z',
    split_sheet_parties: [],
    ...overrides,
  }
}

describe('mergeSplitSheetRows', () => {
  it('includes all initiated sheets regardless of status', () => {
    const initiated = [sheet({ id: 's1', status: 'draft' })]
    expect(mergeSplitSheetRows(initiated, [], 'user-a')).toHaveLength(1)
  })

  it('de-duplicates a sheet the caller both initiated and appears in party-of', () => {
    const initiated = [sheet({ id: 's1' })]
    const partyOf = [sheet({ id: 's1', status: 'pending_approval' })]
    const merged = mergeSplitSheetRows(initiated, partyOf, 'user-a')
    expect(merged).toHaveLength(1)
  })

  it('drops a draft sheet from party-of when the caller is not its initiator (T-18-01)', () => {
    const partyOf = [sheet({ id: 's2', status: 'draft', initiator_user_id: 'user-b' })]
    expect(mergeSplitSheetRows([], partyOf, 'user-a')).toHaveLength(0)
  })

  it('keeps a non-draft party-of sheet even when the caller is not its initiator', () => {
    const partyOf = [sheet({ id: 's2', status: 'pending_approval', initiator_user_id: 'user-b' })]
    expect(mergeSplitSheetRows([], partyOf, 'user-a')).toHaveLength(1)
  })

  it('never applies the draft-hide rule to a sheet the caller themselves initiated', () => {
    // Defensive branch: a draft party-of row where userId IS the
    // initiator (e.g. the caller re-added themselves) must not be dropped.
    const partyOf = [sheet({ id: 's3', status: 'draft', initiator_user_id: 'user-a' })]
    expect(mergeSplitSheetRows([], partyOf, 'user-a')).toHaveLength(1)
  })
})
