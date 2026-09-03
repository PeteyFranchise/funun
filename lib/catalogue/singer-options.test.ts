import { buildSingerCandidates, performerIdentityKey } from './singer-options'

describe('buildSingerCandidates', () => {
  it('offers self, room members, and people from My Roster', () => {
    const candidates = buildSingerCandidates({
      viewer: { userId: 'user-1', name: 'Peter Zora' },
      room: [{ userId: 'user-2', collaboratorId: 'collab-room', name: 'Ben Cooke' }],
      roster: [{ collaboratorId: 'collab-roster', name: 'Maya Reyes' }],
    })

    expect(candidates.map(candidate => [candidate.name, candidate.source])).toEqual([
      ['Peter Zora', 'self'],
      ['Ben Cooke', 'room'],
      ['Maya Reyes', 'roster'],
    ])
  })

  it('deduplicates a claimed performer by user id and keeps the room context', () => {
    const candidates = buildSingerCandidates({
      viewer: { userId: 'user-1', name: 'Peter Zora' },
      room: [{ userId: 'user-2', collaboratorId: 'room-copy', name: 'Maya R.' }],
      roster: [{ userId: 'user-2', collaboratorId: 'roster-copy', name: 'Maya Reyes' }],
    })

    expect(candidates).toHaveLength(2)
    expect(candidates[1]).toEqual(expect.objectContaining({ name: 'Maya R.', source: 'room' }))
  })

  it('does not create candidates from blank names', () => {
    const candidates = buildSingerCandidates({
      viewer: { userId: 'user-1', name: 'Peter Zora' },
      room: [{ collaboratorId: 'blank', name: '  ' }],
      roster: [],
    })

    expect(candidates).toHaveLength(1)
  })
})

describe('performerIdentityKey', () => {
  it('uses stable ids before guest names', () => {
    expect(performerIdentityKey({ kind: 'collaborator', userId: 'user-2', name: 'Maya' })).toBe('user:user-2')
    expect(performerIdentityKey({ kind: 'guest', name: 'Gospel Choir' })).toBe('guest:gospel choir')
  })
})
