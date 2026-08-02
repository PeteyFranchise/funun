import { buildNextMoves, type NextMoveSheetInput } from './next-moves'

const VIEWER = 'viewer-1'
const OTHER = 'other-user'

function sheet(overrides: Partial<NextMoveSheetInput> = {}): NextMoveSheetInput {
  return {
    id: 'sheet-1',
    songName: 'Test Song',
    status: 'draft',
    initiatorUserId: VIEWER,
    parties: [],
    ...overrides,
  }
}

describe('buildNextMoves', () => {
  it('returns a { pinned, flexible } shape', () => {
    const result = buildNextMoves({ viewerUserId: VIEWER, sheets: [] })
    expect(result).toEqual({ pinned: [], flexible: [] })
  })

  it('lands review/approve sheets (pending_approval, approved) in pinned', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [
        sheet({ id: 'a', status: 'pending_approval', initiatorUserId: VIEWER }),
        sheet({ id: 'b', status: 'approved', initiatorUserId: VIEWER }),
      ],
    })
    expect(result.pinned).toHaveLength(2)
    expect(result.pinned.every(r => r.kind === 'review_approve')).toBe(true)
    expect(result.pinned.map(r => r.sheetId)).toEqual(['a', 'b'])
    expect(result.flexible).toHaveLength(0)
  })

  it('lands a countered sheet in pinned as respond_to_counter', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'c', status: 'countered', initiatorUserId: VIEWER })],
    })
    expect(result.pinned).toHaveLength(1)
    expect(result.pinned[0].kind).toBe('respond_to_counter')
    expect(result.pinned[0].sheetId).toBe('c')
  })

  it('lands an esign_pending sheet in pinned as sign_document', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'd', status: 'esign_pending', initiatorUserId: VIEWER })],
    })
    expect(result.pinned).toHaveLength(1)
    expect(result.pinned[0].kind).toBe('sign_document')
    expect(result.pinned[0].sheetId).toBe('d')
  })

  it('cross-account: a sheet initiated by someone else, where the viewer is a named party, still lands in pinned', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [
        sheet({
          id: 'shared-1',
          status: 'pending_approval',
          initiatorUserId: OTHER,
          parties: [{ userId: VIEWER }],
        }),
      ],
    })
    expect(result.pinned).toHaveLength(1)
    expect(result.pinned[0].sheetId).toBe('shared-1')
  })

  it('lands a draft the viewer initiated in flexible as complete_draft', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'draft-mine', status: 'draft', initiatorUserId: VIEWER })],
    })
    expect(result.flexible).toHaveLength(1)
    expect(result.flexible[0].kind).toBe('complete_draft')
    expect(result.flexible[0].sheetId).toBe('draft-mine')
    expect(result.pinned).toHaveLength(0)
  })

  it('produces no row for a draft the viewer did not initiate (P18-11)', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'draft-other', status: 'draft', initiatorUserId: OTHER, parties: [] })],
    })
    expect(result.pinned).toHaveLength(0)
    expect(result.flexible).toHaveLength(0)
  })

  it('degrades an unrecognized status to no row rather than throwing', () => {
    expect(() =>
      buildNextMoves({
        viewerUserId: VIEWER,
        sheets: [sheet({ id: 'weird', status: 'some_future_status', initiatorUserId: VIEWER })],
      })
    ).not.toThrow()

    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'weird', status: 'some_future_status', initiatorUserId: VIEWER })],
    })
    expect(result.pinned).toHaveLength(0)
    expect(result.flexible).toHaveLength(0)
  })

  it('produces no row for an executed (settled) sheet', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [sheet({ id: 'done', status: 'executed', initiatorUserId: VIEWER })],
    })
    expect(result.pinned).toHaveLength(0)
    expect(result.flexible).toHaveLength(0)
  })

  it('excludes a sheet the viewer is neither initiator nor a named party on', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [
        sheet({
          id: 'unreachable',
          status: 'pending_approval',
          initiatorUserId: OTHER,
          parties: [{ userId: 'yet-another-user' }],
        }),
      ],
    })
    expect(result.pinned).toHaveLength(0)
  })

  it('pinned tier only ever contains money/signature kinds — never a complete_draft row', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [
        sheet({ id: 'draft-mine', status: 'draft', initiatorUserId: VIEWER }),
        sheet({ id: 'a', status: 'pending_approval', initiatorUserId: VIEWER }),
        sheet({ id: 'c', status: 'countered', initiatorUserId: VIEWER }),
        sheet({ id: 'd', status: 'esign_pending', initiatorUserId: VIEWER }),
      ],
    })
    const moneyKinds: string[] = ['review_approve', 'respond_to_counter', 'sign_document']
    expect(result.pinned.every(r => moneyKinds.includes(r.kind))).toBe(true)
    expect(result.flexible.every(r => r.kind === 'complete_draft')).toBe(true)
  })

  it('every row carries a stable href and a human label', () => {
    const result = buildNextMoves({
      viewerUserId: VIEWER,
      sheets: [
        sheet({ id: 'a', status: 'pending_approval', initiatorUserId: VIEWER, songName: 'Midnight Drive' }),
        sheet({ id: 'draft-mine', status: 'draft', initiatorUserId: VIEWER, songName: 'Sunrise' }),
      ],
    })
    const allRows = [...result.pinned, ...result.flexible]
    expect(allRows).toHaveLength(2)
    for (const row of allRows) {
      expect(row.href).toBe(`/split-sheets/${row.sheetId}`)
      expect(typeof row.label).toBe('string')
      expect(row.label.length).toBeGreaterThan(0)
    }
  })
})
