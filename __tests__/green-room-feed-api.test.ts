import { GET } from '@/app/api/green-room/feed/route'
import { createApiClient } from '@/lib/supabase/server'
import {
  buildFeedCursorPredicate,
  buildPlacementWindowPredicate,
  clampFeedLimit,
  encodeFeedCursor,
  insertPlacementCards,
  loadGreenRoomFeed,
  parseFeedCursor,
  type GreenRoomPlacementCard,
  type GreenRoomPostCard,
} from '@/lib/green-room/feed-query'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/green-room/feed-query', () => {
  const actual = jest.requireActual('@/lib/green-room/feed-query')
  return {
    ...actual,
    loadGreenRoomFeed: jest.fn(),
  }
})

function request(url: string) {
  return new Request(url)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/green-room/feed', () => {
  it('requires an authenticated session', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await GET(request('http://test.local/api/green-room/feed'))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(loadGreenRoomFeed).not.toHaveBeenCalled()
  })

  it('rejects unknown tab values before querying', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })

    const res = await GET(request('http://test.local/api/green-room/feed?tab=ads'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid Green Room tab' })
    expect(loadGreenRoomFeed).not.toHaveBeenCalled()
  })

  it('rejects malformed cursors before querying', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })

    const res = await GET(request('http://test.local/api/green-room/feed?cursor=not-a-cursor'))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid feed cursor' })
    expect(loadGreenRoomFeed).not.toHaveBeenCalled()
  })

  it('loads typed cards for a valid tab, cursor, and limit', async () => {
    const cursor = encodeFeedCursor({ publishedAt: '2026-07-15T12:00:00.000Z', id: 'post-1' })
    const supabase = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(loadGreenRoomFeed as jest.Mock).mockResolvedValue({
      cards: [{ kind: 'post', id: 'post-2' }],
      nextCursor: null,
    })

    const res = await GET(request(`http://test.local/api/green-room/feed?tab=following&cursor=${cursor}&limit=7`))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      cards: [{ kind: 'post', id: 'post-2' }],
      nextCursor: null,
    })
    expect(loadGreenRoomFeed).toHaveBeenCalledWith(supabase, 'viewer-1', {
      tab: 'following',
      cursor: { publishedAt: '2026-07-15T12:00:00.000Z', id: 'post-1' },
      limit: 7,
    })
  })
})

describe('Green Room feed query helpers', () => {
  it('round-trips opaque cursors and builds a stable published_at/id predicate', () => {
    const cursor = { publishedAt: '2026-07-15T12:00:00.000Z', id: 'post-1' }

    expect(parseFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor)
    expect(parseFeedCursor('broken')).toBeNull()
    expect(buildFeedCursorPredicate(cursor)).toBe(
      'published_at.lt.2026-07-15T12:00:00.000Z,and(published_at.eq.2026-07-15T12:00:00.000Z,id.lt.post-1)'
    )
  })

  it('builds the active placement window predicate with expired placements excluded', () => {
    expect(buildPlacementWindowPredicate('2026-07-15T12:00:00.000Z')).toBe(
      'ends_at.is.null,ends_at.gt.2026-07-15T12:00:00.000Z'
    )
  })

  it('clamps requested limits to safe bounds', () => {
    expect(clampFeedLimit('7')).toBe(7)
    expect(clampFeedLimit('0')).toBe(1)
    expect(clampFeedLimit('500')).toBe(50)
    expect(clampFeedLimit('nope')).toBe(20)
  })

  it('inserts labeled placement cards without exceeding the requested card limit', () => {
    const post = (id: string): GreenRoomPostCard => ({
      kind: 'post',
      id,
      actor: { id: 'author-1', name: 'Maya Reyes', handle: 'maya', avatarUrl: null, primaryRole: 'Artist' },
      postType: 'general_update',
      body: 'Working on the next release.',
      visibility: 'public',
      linkedObject: null,
      allowResharing: true,
      publishedAt: '2026-07-15T12:00:00.000Z',
      createdAt: '2026-07-15T12:00:00.000Z',
      counts: { comments: 0, reactions: 0, reposts: 0 },
      viewerReaction: null,
      explanationLabel: 'Because you follow this artist',
      score: 10,
    })
    const placement: GreenRoomPlacementCard = {
      kind: 'placement',
      id: 'placement-1',
      placementKind: 'sponsored',
      label: 'Sponsored',
      title: 'Featured opportunity',
      body: null,
      destination: { type: 'opportunity', id: 'opp-1', url: null },
      explanationLabel: 'Sponsored placement',
    }

    expect(insertPlacementCards([post('post-1'), post('post-2'), post('post-3')], [placement], 3)).toEqual([
      post('post-1'),
      post('post-2'),
      placement,
    ])
  })
})
