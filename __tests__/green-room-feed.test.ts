import {
  canRepost,
  canViewerSeePost,
  explainFeedCard,
  isGreenRoomPostType,
  isGreenRoomReaction,
  isGreenRoomTab,
  isGreenRoomVisibility,
  matchesCustomAudience,
  normalizeCustomAudience,
  scoreFeedCard,
  summarizeAudience,
} from '@/lib/green-room/feed'

// ─── Value Guards ────────────────────────────────────────────────────────

describe('Green Room feed value guards', () => {
  it('accepts planned Phase 12 values and rejects unknown values', () => {
    expect(isGreenRoomPostType('collab_request')).toBe(true)
    expect(isGreenRoomPostType('photo_dump')).toBe(false)
    expect(isGreenRoomVisibility('custom')).toBe(true)
    expect(isGreenRoomVisibility('friends')).toBe(false)
    expect(isGreenRoomReaction('congrats')).toBe(true)
    expect(isGreenRoomReaction('angry')).toBe(false)
    expect(isGreenRoomTab('opportunities')).toBe(true)
    expect(isGreenRoomTab('ads')).toBe(false)
  })
})

// ─── Custom Audience ─────────────────────────────────────────────────────

describe('normalizeCustomAudience', () => {
  it('normalizes relationship, role, genre, location, and people targets', () => {
    const result = normalizeCustomAudience({
      relationships: ['followers', 'connections', 'followers'],
      roles: ['  Artist  ', 'Producer'],
      genres: ['R&B'],
      locations: [' Detroit '],
      people: ['user-1'],
    })

    expect(result).toEqual({
      ok: true,
      audience: {
        relationships: ['followers', 'connections'],
        roles: ['Artist', 'Producer'],
        genres: ['R&B'],
        locations: ['Detroit'],
        people: ['user-1'],
      },
    })
  })

  it('rejects empty and unknown custom audience rules', () => {
    expect(normalizeCustomAudience({ roles: [] })).toEqual({
      ok: false,
      error: 'Custom audience must include at least one target',
    })

    expect(normalizeCustomAudience({ relationships: ['friends'] })).toEqual({
      ok: false,
      error: 'Unknown audience relationship: friends',
    })
  })

  it('caps custom audience complexity before persistence exists', () => {
    const result = normalizeCustomAudience({
      people: Array.from({ length: 51 }, (_, index) => `user-${index}`),
    })

    expect(result).toEqual({
      ok: false,
      error: 'Audience list exceeds 50 items',
    })
  })

  it('summarizes audiences for review UI labels', () => {
    const result = normalizeCustomAudience({
      relationships: ['followers'],
      roles: ['A&R', 'Manager'],
      people: ['user-1'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(summarizeAudience(result.audience)).toBe('followers + 2 roles + 1 person')
    }
  })
})

describe('matchesCustomAudience', () => {
  it('matches explicit people, roles, genres, locations, and relationship groups', () => {
    const result = normalizeCustomAudience({
      relationships: ['connections'],
      roles: ['manager'],
      genres: ['afrobeats'],
      locations: ['Detroit'],
      people: ['specific-user'],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(matchesCustomAudience({
      audience: result.audience,
      viewer: { id: 'specific-user' },
    })).toBe(true)

    expect(matchesCustomAudience({
      audience: result.audience,
      viewer: { id: 'viewer-1', roles: ['Manager'] },
    })).toBe(true)

    expect(matchesCustomAudience({
      audience: result.audience,
      viewer: { id: 'viewer-2', genres: ['Afrobeats'] },
    })).toBe(true)

    expect(matchesCustomAudience({
      audience: result.audience,
      viewer: { id: 'viewer-3', location: 'detroit' },
    })).toBe(true)

    expect(matchesCustomAudience({
      audience: result.audience,
      viewer: { id: 'viewer-4' },
      relationship: { connectedToAuthor: true },
    })).toBe(true)
  })
})

// ─── Visibility & Reposts ────────────────────────────────────────────────

describe('canViewerSeePost', () => {
  it('blocks visibility in both directions before any other rule', () => {
    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'public',
      relationship: { blockedEitherDirection: true },
    })).toBe(false)
  })

  it('keeps draft posts owner-only', () => {
    expect(canViewerSeePost({
      viewerId: 'author',
      authorId: 'author',
      visibility: 'draft',
    })).toBe(true)

    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'draft',
    })).toBe(false)
  })

  it('enforces followers, connections, and anonymous public visibility', () => {
    expect(canViewerSeePost({
      viewerId: null,
      authorId: 'author',
      visibility: 'public',
    })).toBe(true)

    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'followers',
      relationship: { followsAuthor: true },
    })).toBe(true)

    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'connections',
      relationship: { followsAuthor: true },
    })).toBe(false)
  })

  it('requires a matching custom audience for custom posts', () => {
    const result = normalizeCustomAudience({ roles: ['artist'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'custom',
      audience: result.audience,
      viewer: { roles: ['Artist'] },
    })).toBe(true)

    expect(canViewerSeePost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'custom',
      audience: result.audience,
      viewer: { roles: ['Manager'] },
    })).toBe(false)
  })
})

describe('canRepost', () => {
  it('allows resharing visible public, follower, or connection posts', () => {
    expect(canRepost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'followers',
      allowResharing: true,
      originalAvailable: true,
      relationship: { followsAuthor: true },
    })).toEqual({ ok: true })
  })

  it('rejects reposts when resharing is disabled, original is gone, or scope is private/custom', () => {
    expect(canRepost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'public',
      allowResharing: false,
      originalAvailable: true,
    })).toEqual({ ok: false, reason: 'Resharing is disabled' })

    expect(canRepost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'public',
      allowResharing: true,
      originalAvailable: false,
    })).toEqual({ ok: false, reason: 'Original post is unavailable' })

    expect(canRepost({
      viewerId: 'viewer',
      authorId: 'author',
      visibility: 'custom',
      allowResharing: true,
      originalAvailable: true,
    })).toEqual({ ok: false, reason: 'This post cannot be reshared' })
  })
})

// ─── Ranking Labels ──────────────────────────────────────────────────────

describe('Green Room ranking helpers', () => {
  it('scores closer network and relevant cards above older outside-network cards', () => {
    const now = '2026-07-15T12:00:00.000Z'
    const closeScore = scoreFeedCard({
      relationship: 'connected',
      postType: 'collab_request',
      createdAt: '2026-07-15T11:00:00.000Z',
      now,
      sameGenre: true,
      roleRelevant: true,
      engagementCount: 3,
    })

    const distantScore = scoreFeedCard({
      relationship: 'outside_network',
      postType: 'general_update',
      createdAt: '2026-07-08T12:00:00.000Z',
      now,
    })

    expect(closeScore).toBeGreaterThan(distantScore)
  })

  it('returns stable explanation labels, with placements clearly labeled first', () => {
    expect(explainFeedCard({
      relationship: 'outside_network',
      postType: 'general_update',
      createdAt: '2026-07-15T12:00:00.000Z',
      placementKind: 'sponsored',
    })).toBe('Sponsored placement')

    expect(explainFeedCard({
      relationship: 'following',
      postType: 'general_update',
      createdAt: '2026-07-15T12:00:00.000Z',
    })).toBe('Because you follow this artist')

    expect(explainFeedCard({
      relationship: 'outside_network',
      postType: 'opportunity_need',
      createdAt: '2026-07-15T12:00:00.000Z',
    })).toBe('Opportunity you may fit')
  })
})

