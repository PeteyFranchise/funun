import {
  buildAttentionSections,
  derivePartyProgressState,
  resolveViewerContext,
  type AttentionSheetInput,
  type AttentionDocumentInput,
  type AttentionProjectInput,
} from '@/lib/contracts/locker-attention'

function party(overrides: Partial<AttentionSheetInput['parties'][number]> = {}) {
  return {
    userId: null,
    name: 'Someone',
    approvalStatus: 'pending',
    firstViewedAt: null,
    splitPercentage: 0,
    ...overrides,
  }
}

function sheet(overrides: Partial<AttentionSheetInput> = {}): AttentionSheetInput {
  return {
    id: 'sheet-1',
    songName: 'Midnight Drive',
    status: 'pending_approval',
    initiatorUserId: 'user-1',
    vaultProjectId: null,
    trackId: null,
    parties: [],
    ...overrides,
  }
}

describe('derivePartyProgressState — the 3-state per-party label', () => {
  it('approved -> signed', () => {
    expect(derivePartyProgressState('approved', null)).toBe('signed')
    expect(derivePartyProgressState('approved', '2026-07-01T00:00:00.000Z')).toBe('signed')
  })

  it('pending + first_viewed_at set -> opened, hasn\'t signed', () => {
    expect(derivePartyProgressState('pending', '2026-07-01T00:00:00.000Z')).toBe('opened')
  })

  it('pending + first_viewed_at null -> invited, hasn\'t opened yet', () => {
    expect(derivePartyProgressState('pending', null)).toBe('invited')
  })
})

describe('resolveViewerContext — P18-11 own-context resolution', () => {
  const parties = [
    party({ userId: 'viewer-a', splitPercentage: 30, approvalStatus: 'approved', firstViewedAt: '2026-07-01T00:00:00.000Z' }),
    party({ userId: 'viewer-b', splitPercentage: 45, approvalStatus: 'pending', firstViewedAt: null }),
  ]

  it('two different viewers of the same sheet see two different shares', () => {
    const a = resolveViewerContext(parties, 'viewer-a')
    const b = resolveViewerContext(parties, 'viewer-b')
    expect(a.sharePercentage).toBe(30)
    expect(a.state).toBe('signed')
    expect(b.sharePercentage).toBe(45)
    expect(b.state).toBe('invited')
    expect(a.sharePercentage).not.toBe(b.sharePercentage)
  })

  it('returns a null share when the viewer is not a named party (initiator-only)', () => {
    const result = resolveViewerContext(parties, 'initiator-only-user')
    expect(result.sharePercentage).toBeNull()
    expect(result.state).toBeNull()
  })
})

describe('buildAttentionSections — section ordering', () => {
  it('returns the four sections in the fixed P18-10 order', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    const keys = Object.keys(result)
    const order = ['awaitingSignature', 'draftsInProgress', 'unattachedExecuted', 'songsWithNoSheet']
    expect(keys.slice(0, 4)).toEqual(order)
  })
})

describe('buildAttentionSections — drafts (P18-11)', () => {
  it('includes a draft in draftsInProgress when the viewer is the initiator', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ status: 'draft', initiatorUserId: 'user-1' })],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.draftsInProgress).toEqual([{ sheetId: 'sheet-1', songName: 'Midnight Drive' }])
  })

  it('excludes a draft from every section AND the archive for a non-initiator viewer', () => {
    const result = buildAttentionSections({
      viewerUserId: 'someone-else',
      sheets: [sheet({ status: 'draft', initiatorUserId: 'user-1' })],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.draftsInProgress).toEqual([])
    expect(result.awaitingSignature).toEqual([])
    expect(result.unattachedExecuted).toEqual([])
    expect(result.settledArchiveSheetIds).toEqual([])
  })
})

describe('buildAttentionSections — awaiting signature, per-party progress', () => {
  it('reports signed/total counts on a partially-signed sheet', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [
        sheet({
          status: 'pending_approval',
          parties: [
            party({ userId: 'user-1', name: 'You', approvalStatus: 'approved', firstViewedAt: '2026-07-01T00:00:00.000Z', splitPercentage: 40 }),
            party({ userId: 'user-2', name: 'Jamie', approvalStatus: 'approved', firstViewedAt: '2026-07-01T00:00:00.000Z', splitPercentage: 30 }),
            party({ userId: 'user-3', name: 'Alex', approvalStatus: 'pending', firstViewedAt: null, splitPercentage: 30 }),
          ],
        }),
      ],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })

    expect(result.awaitingSignature).toHaveLength(1)
    const row = result.awaitingSignature[0]
    expect(row.signedCount).toBe(2)
    expect(row.totalCount).toBe(3)
    expect(row.parties.map(p => ({ name: p.name, state: p.state }))).toEqual([
      { name: 'You', state: 'signed' },
      { name: 'Jamie', state: 'signed' },
      { name: 'Alex', state: 'invited' },
    ])
    // Viewer context: the viewer's own share/state, not anyone else's.
    expect(row.viewerSharePercentage).toBe(40)
    expect(row.viewerState).toBe('signed')
  })

  it.each(['pending_approval', 'countered', 'approved', 'esign_pending'])(
    'buckets a %s sheet into awaiting signature',
    status => {
      const result = buildAttentionSections({
        viewerUserId: 'user-1',
        sheets: [sheet({ status, parties: [party({ userId: 'user-1' })] })],
        documents: [],
        projects: [],
        hiddenDocumentIds: [],
      })
      expect(result.awaitingSignature).toHaveLength(1)
    }
  )
})

describe('buildAttentionSections — unattached executed', () => {
  it('buckets an executed sheet with no project into unattachedExecuted', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ status: 'executed', vaultProjectId: null })],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.unattachedExecuted).toEqual([{ sheetId: 'sheet-1', songName: 'Midnight Drive' }])
    expect(result.settledArchiveSheetIds).toEqual([])
  })

  it('buckets an executed, attached sheet into the settled archive instead', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ status: 'executed', vaultProjectId: 'proj-1' })],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.unattachedExecuted).toEqual([])
    expect(result.settledArchiveSheetIds).toEqual(['sheet-1'])
  })
})

describe('buildAttentionSections — an unrecognized status degrades to the archive', () => {
  it('does not throw and lands the sheet in settledArchiveSheetIds', () => {
    expect(() =>
      buildAttentionSections({
        viewerUserId: 'user-1',
        sheets: [sheet({ status: 'some_future_status' })],
        documents: [],
        projects: [],
        hiddenDocumentIds: [],
      })
    ).not.toThrow()

    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ status: 'some_future_status' })],
      documents: [],
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.settledArchiveSheetIds).toEqual(['sheet-1'])
  })
})

describe('buildAttentionSections — songs with no sheet', () => {
  const projects: AttentionProjectInput[] = [
    {
      id: 'proj-1',
      title: 'Nightshift EP',
      tracks: [
        { id: 'track-1', title: 'Nightshift' },
        { id: 'track-2', title: 'Daybreak' },
      ],
    },
  ]

  it('flags a track with no covering sheet at all', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [],
      documents: [],
      projects,
      hiddenDocumentIds: [],
    })
    expect(result.songsWithNoSheet).toEqual([
      { projectId: 'proj-1', projectTitle: 'Nightshift EP', trackId: 'track-1', trackTitle: 'Nightshift' },
      { projectId: 'proj-1', projectTitle: 'Nightshift EP', trackId: 'track-2', trackTitle: 'Daybreak' },
    ])
  })

  it('does not flag a track covered by a track-specific sheet', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ id: 'sheet-1', status: 'draft', initiatorUserId: 'user-1', trackId: 'track-1' })],
      documents: [],
      projects,
      hiddenDocumentIds: [],
    })
    expect(result.songsWithNoSheet.map(r => r.trackId)).toEqual(['track-2'])
  })

  it('a whole-release sheet (null track_id, matching project) covers every track in that project', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [sheet({ id: 'sheet-1', status: 'draft', initiatorUserId: 'user-1', vaultProjectId: 'proj-1', trackId: null })],
      documents: [],
      projects,
      hiddenDocumentIds: [],
    })
    expect(result.songsWithNoSheet).toEqual([])
  })

  // WR-01: a sheet originated on a DIFFERENT project (e.g. a Single) but
  // attached to this project's track via split_sheet_attachments (the
  // migration-067 join table, e.g. the same song also on an EP) must count
  // as covered — not just the sheet's own origin trackId/vaultProjectId.
  it('does not flag a track covered ONLY via split_sheet_attachments (second-release attach)', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [
        sheet({
          id: 'sheet-1',
          status: 'executed',
          initiatorUserId: 'user-1',
          vaultProjectId: 'other-proj', // originated elsewhere (the Single)
          trackId: 'other-track',
          attachments: [{ vaultProjectId: 'proj-1', trackId: 'track-1' }],
        }),
      ],
      documents: [],
      projects,
      hiddenDocumentIds: [],
    })
    expect(result.songsWithNoSheet.map(r => r.trackId)).toEqual(['track-2'])
  })

  it('a whole-release attachment (null track_id in split_sheet_attachments) covers every track in that project', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [
        sheet({
          id: 'sheet-1',
          status: 'executed',
          initiatorUserId: 'user-1',
          vaultProjectId: 'other-proj',
          trackId: null,
          attachments: [{ vaultProjectId: 'proj-1', trackId: null }],
        }),
      ],
      documents: [],
      projects,
      hiddenDocumentIds: [],
    })
    expect(result.songsWithNoSheet).toEqual([])
  })
})

describe('buildAttentionSections — hidden documents (per-viewer only)', () => {
  const documents: AttentionDocumentInput[] = [
    { id: 'doc-1', status: 'signed' },
    { id: 'doc-2', status: 'verified' },
  ]

  it('omits a hidden document for the viewer who hid it', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-1',
      sheets: [],
      documents,
      projects: [],
      hiddenDocumentIds: ['doc-1'],
    })
    expect(result.settledArchiveDocumentIds).toEqual(['doc-2'])
  })

  it('the SAME document remains visible for a different viewer whose input did not hide it', () => {
    const result = buildAttentionSections({
      viewerUserId: 'user-2',
      sheets: [],
      documents,
      projects: [],
      hiddenDocumentIds: [],
    })
    expect(result.settledArchiveDocumentIds).toEqual(['doc-1', 'doc-2'])
  })
})
