import {
  formatTrackTimestamp,
  previousVersionId,
  presentVersionComments,
  versionDisplayMap,
} from './version-comments'

describe('timed Writer\'s Room comments', () => {
  it('formats track positions without rounding into the next second', () => {
    expect(formatTrackTimestamp(105999)).toBe('1:45')
    expect(formatTrackTimestamp(3_661_000)).toBe('1:01:01')
    expect(formatTrackTimestamp(-1)).toBe('0:00')
  })

  it('derives version labels and the immediate predecessor from stable ordering', () => {
    const rows = [
      { id: 'b', created_at: '2026-01-02T00:00:00Z' },
      { id: 'a', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c', created_at: '2026-01-03T00:00:00Z' },
    ]
    expect(Object.fromEntries(versionDisplayMap(rows))).toEqual({ a: 'v1', b: 'v2', c: 'v3' })
    expect(previousVersionId(rows, 'c')).toBe('b')
    expect(previousVersionId(rows, 'a')).toBeNull()
  })

  it('preserves carry provenance and lets a former author remain visible', () => {
    const comments = presentVersionComments({
      comments: [{
        id: 'comment-2', work_id: 'work-1', version_id: 'v2', parent_comment_id: null,
        author_user_id: 'former-user', body: 'Drop the drums here', timestamp_ms: 105000,
        mentioned_user_ids: [], resolved_at: null, resolved_by_user_id: null,
        carried_from_version_id: 'v1', carried_from_comment_id: 'comment-1',
        created_at: '2026-01-02T00:00:00Z',
      }],
      profiles: new Map(),
      versionDisplays: new Map([['v1', 'v1']]),
      viewerUserId: 'viewer',
      viewerIsOwner: true,
      viewerCanAdminister: false,
    })
    expect(comments[0]).toMatchObject({
      author: { name: 'A former room member' },
      carriedFromVersionDisplay: 'v1',
      canResolve: true,
    })
  })
})
