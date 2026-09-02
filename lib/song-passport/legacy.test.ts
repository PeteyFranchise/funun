import { legacyFactsForWork } from '@/lib/song-passport/legacy'

describe('Song Passport legacy source collection', () => {
  it('preserves composition, person, version, splits and release boundaries', () => {
    const facts = legacyFactsForWork({
      work: { id: 'work-1', title: 'A Song', vocal_state: 'primary', graduated_project_id: 'project-1' },
      members: [{ user_id: 'user-2', collaborator_id: 'collab-2' }],
      collaborators: [{ id: 'collab-2', name: 'Maya', pro: 'ASCAP', ipi: '123' }],
      ownerProfile: { id: 'user-1', artist_name: 'Peter', legal_first_name: 'Peter', legal_last_name: 'Zora' },
      lyricBlocks: [{ id: 'block-1', position: 0, block_type: 'verse', text: 'First line' }],
      versions: [{ id: 'version-1', label: 'Demo', performers: [{ name: 'Peter' }], duration_seconds: 90 }],
      splitSheet: {
        id: 'sheet-1',
        status: 'approved',
        parties: [{ name: 'Peter', user_id: 'user-1', split_percentage: 100 }],
      },
      releaseProject: {
        id: 'project-1',
        title: 'A Song',
        tracks: [{ id: 'track-1', title: 'A Song', track_number: 1, isrc: 'US-AAA-26-00001' }],
      },
    })

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'composition_title', sourceKind: 'work' }),
      expect.objectContaining({ fieldKey: 'legal_name', target: { layer: 'contributor', userId: 'user-1' } }),
      expect.objectContaining({ fieldKey: 'duration_seconds', target: { layer: 'recording_version', workVersionId: 'version-1' } }),
      expect.objectContaining({ fieldKey: 'publishing_shares', sourceKind: 'split_sheet' }),
      expect.objectContaining({ fieldKey: 'isrc', target: { layer: 'release', vaultProjectId: 'project-1', trackId: 'track-1' } }),
    ]))
  })
})
