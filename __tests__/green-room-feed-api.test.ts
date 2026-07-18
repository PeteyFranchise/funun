import { GET } from '@/app/api/green-room/feed/route'
import { createApiClient } from '@/lib/supabase/server'
import {
  buildFeedCursorPredicate,
  buildPlacementWindowPredicate,
  clampFeedLimit,
  encodeFeedCursor,
  filterVisiblePlacementRows,
  insertPlacementCards,
  loadGreenRoomFeed,
  parseFeedCursor,
  type GreenRoomPlacementCard,
  type GreenRoomPostCard,
} from '@/lib/green-room/feed-query'

const { loadGreenRoomFeed: loadGreenRoomFeedActual } = jest.requireActual(
  '@/lib/green-room/feed-query'
) as typeof import('@/lib/green-room/feed-query')

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
    const postId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const cursor = encodeFeedCursor({ publishedAt: '2026-07-15T12:00:00.000Z', id: postId })
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
      cursor: { publishedAt: '2026-07-15T12:00:00.000Z', id: postId },
      limit: 7,
    })
  })
})

describe('Green Room feed query helpers', () => {
  it('round-trips opaque cursors and builds a stable published_at/id predicate', () => {
    const cursor = {
      publishedAt: '2026-07-15T12:00:00.000Z',
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    }

    expect(parseFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor)
    expect(parseFeedCursor('broken')).toBeNull()
    expect(parseFeedCursor(encodeFeedCursor({ ...cursor, id: 'not-a-uuid' }))).toBeNull()
    expect(buildFeedCursorPredicate(cursor)).toBe(
      'published_at.lt.2026-07-15T12:00:00.000Z,and(published_at.eq.2026-07-15T12:00:00.000Z,id.lt.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)'
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

  it('filters active placements whose destination is no longer visible', async () => {
    const rows = [
      {
        id: 'visible-placement',
        placement_kind: 'featured',
        label: 'Featured',
        title: 'Public profile',
        body: null,
        destination_type: 'profile',
        destination_id: 'visible-profile',
        destination_url: null,
      },
      {
        id: 'hidden-placement',
        placement_kind: 'featured',
        label: 'Featured',
        title: 'Private profile',
        body: null,
        destination_type: 'profile',
        destination_id: 'hidden-profile',
        destination_url: null,
      },
    ]
    const supabase = {
      from: jest.fn((_table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn((_field: string, id: string) => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: id === 'visible-profile' ? { id } : null })),
            })),
          })),
        })),
      })),
      rpc: jest.fn(async () => ({ data: true, error: null })),
    }

    await expect(filterVisiblePlacementRows(supabase as never, 'viewer-1', rows as never)).resolves.toEqual([rows[0]])
  })

  it('filters otherwise-public placements when the destination owner is blocked', async () => {
    const rows = [
      {
        id: 'blocked-placement',
        placement_kind: 'featured',
        label: 'Featured',
        title: 'Blocked profile',
        body: null,
        destination_type: 'profile',
        destination_id: 'blocked-profile',
        destination_url: null,
      },
    ]
    const supabase = {
      from: jest.fn((_table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn((_field: string, id: string) => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: { id }, error: null })),
            })),
          })),
        })),
      })),
      rpc: jest.fn(async () => ({ data: false, error: null })),
    }

    await expect(filterVisiblePlacementRows(supabase as never, 'viewer-1', rows as never)).resolves.toEqual([])
  })

  it('drops feed posts whose non-owner author profile is no longer public', async () => {
    const publicAuthorId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const privateAuthorId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const posts = [
      postRow({ id: '11111111-1111-1111-1111-111111111111', author_id: publicAuthorId }),
      postRow({ id: '22222222-2222-2222-2222-222222222222', author_id: privateAuthorId }),
    ]
    const authors = [
      {
        id: publicAuthorId,
        artist_name: 'Public Artist',
        handle: 'public',
        avatar_url: null,
        roles: [],
        industry_roles: [],
        is_public: true,
      },
    ]
    const supabase = feedService({ posts, authors })

    const out = await loadGreenRoomFeedActual(supabase as never, 'viewer-1', { tab: 'for_you', limit: 20 })

    expect(out.cards).toHaveLength(1)
    expect(out.cards[0]).toMatchObject({ kind: 'post', id: '11111111-1111-1111-1111-111111111111' })
  })
})

function postRow(overrides: Record<string, unknown>) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    author_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    post_type: 'general_update',
    body: 'Working on the next release.',
    visibility: 'public',
    linked_object_type: null,
    linked_object_id: null,
    allow_resharing: true,
    published_at: '2026-07-15T12:00:00.000Z',
    created_at: '2026-07-15T12:00:00.000Z',
    ...overrides,
  }
}

function feedService({ posts, authors }: { posts: unknown[]; authors: unknown[] }) {
  const terminal = (rows: unknown[]) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'or', 'in', 'lte']) {
      builder[method] = jest.fn(() => builder)
    }
    builder.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null })
    return builder
  }

  return {
    from: jest.fn((table: string) => {
      if (table === 'green_room_posts') return terminal(posts)
      if (table === 'artist_profiles') return terminal(authors)
      if (table === 'follows') return terminal([])
      if (table === 'connections') return terminal([])
      if (table === 'green_room_comments') return terminal([])
      if (table === 'green_room_reactions') return terminal([])
      if (table === 'green_room_reposts') return terminal([])
      if (table === 'green_room_placements') return terminal([])
      throw new Error(`Unexpected table: ${table}`)
    }),
    rpc: jest.fn(async () => ({ data: true, error: null })),
  }
}
