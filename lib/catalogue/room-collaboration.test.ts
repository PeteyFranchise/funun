import {
  activeLocksByBlock,
  normalizeCollaborationHint,
  normalizeLyricSectionLock,
  sectionLockView,
} from './room-collaboration'

const blockId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const sessionId = '00000000-0000-4000-8000-000000000003'
const now = Date.parse('2026-09-01T12:00:00Z')
const lock = {
  blockId,
  userId,
  sessionId,
  expiresAt: '2026-09-01T12:00:30Z',
}

describe("Writer's Room section collaboration", () => {
  it('accepts an active server lock and rejects expired or malformed capability data', () => {
    expect(normalizeLyricSectionLock(lock, now)).toEqual(lock)
    expect(normalizeLyricSectionLock({ ...lock, expiresAt: '2026-09-01T11:59:59Z' }, now)).toBeNull()
    expect(normalizeLyricSectionLock({ ...lock, sessionId: 'not-a-session' }, now)).toBeNull()
  })

  it('indexes only active leases by lyric block', () => {
    expect(
      activeLocksByBlock(
        [lock, { ...lock, blockId: 'bad', expiresAt: '2026-09-01T12:00:30Z' }],
        now
      )
    ).toEqual({ [blockId]: lock })
  })

  it('distinguishes this tab from another writer and resolves names from the trusted roster', () => {
    const people = [
      { userId, name: 'Maya', avatarUrl: null, isViewer: false },
      { userId: '00000000-0000-4000-8000-000000000004', name: 'Peter', avatarUrl: null, isViewer: true },
    ]
    expect(sectionLockView(lock, userId, sessionId, people, now)).toEqual({
      state: 'mine',
      holderName: 'Maya',
    })
    expect(sectionLockView(lock, people[1]!.userId, '00000000-0000-4000-8000-000000000005', people, now)).toEqual({
      state: 'other',
      holderName: 'Maya',
    })
  })

  it('accepts only bounded invalidation hints, never remote lyric text', () => {
    expect(normalizeCollaborationHint('lyric_saved', { blockId, text: 'untrusted words' })).toEqual({
      kind: 'lyric_saved',
      blockId,
    })
    expect(normalizeCollaborationHint('rights_changed', { blockId })).toBeNull()
    expect(normalizeCollaborationHint('lock_changed', { blockId: 'bad' })).toBeNull()
  })

  it('accepts a comment invalidation id without accepting remote comment text', () => {
    expect(normalizeCollaborationHint('comment_changed', { blockId, body: 'untrusted comment' })).toEqual({
      kind: 'comment_changed',
      blockId,
    })
    expect(normalizeCollaborationHint('track_comment_changed', { versionId: blockId, body: 'untrusted comment' })).toEqual({
      kind: 'track_comment_changed',
      versionId: blockId,
    })
    expect(normalizeCollaborationHint('track_comment_changed', { versionId: 'bad' })).toBeNull()
  })
})
