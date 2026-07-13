// Tests for the Phase-10 notification-type catalog + per-type payload
// builders (lib/social/notifications.ts). Pure unit tests — no Supabase
// client involved, no mocking needed; these are plain function-in,
// object-out assertions.
//
// RED (Task 1): lib/social/notifications.ts does not exist yet — this
// file MUST fail on module resolution. Task 2 makes it GREEN.

import {
  NOTIFICATION_TYPES,
  buildNewFollowerNotification,
  buildConnectionRequestNotification,
  buildConnectionAcceptedNotification,
  buildWallPostNotification,
  buildEndorsementNotification,
  buildReleaseCommentNotification,
  buildMarkAllReadFilter,
} from '@/lib/social/notifications'

// ─── NOTIFICATION_TYPES catalog ─────────────────────────────────────────

describe('NOTIFICATION_TYPES catalog', () => {
  const PHASE_OWNED = [
    'new_follower',
    'connection_request',
    'connection_accepted',
    'wall_post',
    'endorsement',
    'release_comment',
  ]
  const PRE_EXISTING = ['antenna_match', 'application_received']

  it('has an entry for every phase-owned type plus the two pre-existing types', () => {
    for (const type of [...PHASE_OWNED, ...PRE_EXISTING]) {
      expect(NOTIFICATION_TYPES).toHaveProperty(type)
      expect(typeof (NOTIFICATION_TYPES as Record<string, { icon: string }>)[type].icon).toBe('string')
    }
  })

  it('marks connection_request as the only phase-owned entry with a truthy inlineAction', () => {
    for (const type of PHASE_OWNED) {
      const entry = (NOTIFICATION_TYPES as Record<string, { inlineAction: string | null }>)[type]
      if (type === 'connection_request') {
        expect(entry.inlineAction).toBeTruthy()
      } else {
        expect(entry.inlineAction).toBeFalsy()
      }
    }
  })
})

// ─── buildNewFollowerNotification ───────────────────────────────────────

describe('new_follower', () => {
  it('builds the correct title, link, and actor passthrough', () => {
    const result = buildNewFollowerNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: 'https://example.com/avatar.png',
      actorHandle: 'jordanray',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'new_follower',
        title: 'Jordan Ray started following you',
        link: '/u/jordanray',
        actorId: 'user-2',
        actorName: 'Jordan Ray',
        actorAvatarUrl: 'https://example.com/avatar.png',
      })
    )
  })
})

// ─── buildConnectionRequestNotification ─────────────────────────────────

describe('connection_request', () => {
  it('builds the correct title, body (note), link, actor passthrough, and data.connectionId', () => {
    const result = buildConnectionRequestNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      actorHandle: 'jordanray',
      note: 'Loved your last single!',
      connectionId: 'conn-123',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'connection_request',
        title: 'Jordan Ray sent you a connection request',
        body: 'Loved your last single!',
        link: '/u/jordanray',
        actorId: 'user-2',
        actorName: 'Jordan Ray',
        actorAvatarUrl: null,
        data: expect.objectContaining({ connectionId: 'conn-123' }),
      })
    )
  })

  it('sets body to null when no note was provided', () => {
    const result = buildConnectionRequestNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      actorHandle: 'jordanray',
      note: null,
      connectionId: 'conn-123',
    })

    expect(result.body).toBeNull()
  })
})

// ─── buildConnectionAcceptedNotification ────────────────────────────────

describe('connection_accepted', () => {
  it('builds the correct title and link', () => {
    const result = buildConnectionAcceptedNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      actorHandle: 'jordanray',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'connection_accepted',
        title: 'Jordan Ray accepted your connection request',
        link: '/u/jordanray',
      })
    )
  })
})

// ─── buildWallPostNotification ──────────────────────────────────────────

describe('wall_post', () => {
  it('builds the correct title and #wall deep link', () => {
    const result = buildWallPostNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      ownHandle: 'me-handle',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'wall_post',
        title: 'Jordan Ray posted on your wall',
        link: '/u/me-handle#wall',
      })
    )
  })
})

// ─── buildEndorsementNotification ───────────────────────────────────────

describe('endorsement', () => {
  it('builds the correct title and #endorsements deep link', () => {
    const result = buildEndorsementNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      ownHandle: 'me-handle',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'endorsement',
        title: 'Jordan Ray endorsed you',
        link: '/u/me-handle#endorsements',
      })
    )
  })
})

// ─── buildReleaseCommentNotification ────────────────────────────────────

describe('release_comment', () => {
  it('builds the correct title (quoting the track title) and #comments deep link', () => {
    const result = buildReleaseCommentNotification({
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Jordan Ray',
      actorAvatarUrl: null,
      projectId: 'proj-9',
      trackTitle: 'Midnight Drive',
    })

    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        type: 'release_comment',
        title: 'Jordan Ray commented on "Midnight Drive"',
        link: '/r/proj-9#comments',
      })
    )
  })
})

// ─── buildMarkAllReadFilter ──────────────────────────────────────────────

describe('buildMarkAllReadFilter', () => {
  it('scopes to the given userId and read=false only', () => {
    expect(buildMarkAllReadFilter('user-1')).toEqual({ user_id: 'user-1', read: false })
  })
})
