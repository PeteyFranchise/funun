import {
  DELETE,
  POST,
} from '@/app/api/green-room/posts/[postId]/reposts/route'
import { createApiClient } from '@/lib/supabase/server'
import {
  createGreenRoomRepost,
  normalizeRepostQuote,
} from '@/lib/green-room/repost'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/green-room/repost', () => {
  const actual = jest.requireActual('@/lib/green-room/repost')
  return {
    ...actual,
    createGreenRoomRepost: jest.fn(),
  }
})

const { createGreenRoomRepost: createGreenRoomRepostActual } = jest.requireActual(
  '@/lib/green-room/repost'
) as typeof import('@/lib/green-room/repost')

const context = { params: Promise.resolve({ postId: 'post-1' }) }

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/green-room/posts/post-1/reposts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('normalizeRepostQuote', () => {
  it('normalizes empty quote text and rejects overlong quotes', () => {
    expect(normalizeRepostQuote('  ')).toBeNull()
    expect(normalizeRepostQuote('  Signal boost  ')).toBe('Signal boost')
    expect(() => normalizeRepostQuote('x'.repeat(1001))).toThrow(/1000/)
  })
})

describe('POST /api/green-room/posts/[postId]/reposts', () => {
  it('requires auth', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await POST(jsonRequest({}), context)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(createGreenRoomRepost).not.toHaveBeenCalled()
  })

  it('delegates visible repost creation to the repost service', async () => {
    const supabase = authClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createGreenRoomRepost as jest.Mock).mockResolvedValue({
      ok: true,
      repost: {
        id: 'repost-1',
        originalPostId: 'post-1',
        authorId: 'user-1',
        quoteBody: 'Signal boost',
        createdAt: '2026-07-15T12:00:00.000Z',
      },
    })

    const res = await POST(jsonRequest({ quoteBody: 'Signal boost' }), context)

    expect(res.status).toBe(201)
    expect(createGreenRoomRepost).toHaveBeenCalledWith(supabase, 'user-1', 'post-1', 'Signal boost')
  })
})

describe('createGreenRoomRepost', () => {
  it('rejects custom visibility reposts before insert', async () => {
    const postQuery = chain({
      data: {
        id: 'post-1',
        author_id: 'author-1',
        visibility: 'custom',
        allow_resharing: true,
        status: 'published',
        moderation_status: 'visible',
        deleted_at: null,
      },
      error: null,
    })
    const from = jest.fn((table: string) => {
      if (table === 'green_room_posts') return postQuery
      if (table === 'green_room_reposts') throw new Error('Repost insert should not run')
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createGreenRoomRepostActual({ from } as never, 'user-1', 'post-1', null)

    expect(result).toEqual({
      ok: false,
      error: 'This post cannot be reshared',
      status: 400,
    })
  })

  it('rejects disabled resharing before insert', async () => {
    const postQuery = chain({
      data: {
        id: 'post-1',
        author_id: 'author-1',
        visibility: 'public',
        allow_resharing: false,
        status: 'published',
        moderation_status: 'visible',
        deleted_at: null,
      },
      error: null,
    })
    const from = jest.fn((table: string) => {
      if (table === 'green_room_posts') return postQuery
      if (table === 'green_room_reposts') throw new Error('Repost insert should not run')
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createGreenRoomRepostActual({ from } as never, 'user-1', 'post-1', null)

    expect(result).toEqual({
      ok: false,
      error: 'Resharing is disabled',
      status: 400,
    })
  })

  it('allows RLS-visible follower and connection posts to be reshared', async () => {
    for (const visibility of ['followers', 'connections']) {
      const postQuery = chain({
        data: {
          id: 'post-1',
          author_id: 'author-1',
          visibility,
          allow_resharing: true,
          status: 'published',
          moderation_status: 'visible',
          deleted_at: null,
        },
        error: null,
      })
      const repostQuery = insertChain({
        data: {
          id: `repost-${visibility}`,
          original_post_id: 'post-1',
          author_id: 'user-1',
          quote_body: null,
          created_at: '2026-07-15T12:00:00.000Z',
        },
        error: null,
      })
      const from = jest.fn((table: string) => {
        if (table === 'green_room_posts') return postQuery
        if (table === 'green_room_reposts') return repostQuery
        throw new Error(`Unexpected table: ${table}`)
      })

      const result = await createGreenRoomRepostActual({ from } as never, 'user-1', 'post-1', null)

      expect(result.ok).toBe(true)
      expect(repostQuery.insert).toHaveBeenCalledWith({
        original_post_id: 'post-1',
        author_id: 'user-1',
        quote_body: null,
      })
    }
  })
})

describe('DELETE /api/green-room/posts/[postId]/reposts', () => {
  it('deletes the caller repost for the original by default', async () => {
    const query = deleteChain()
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient({
      from: jest.fn(() => query),
    }))

    const res = await DELETE(jsonRequest({}), context)

    expect(res.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('original_post_id', 'post-1')
    expect(query.eq).toHaveBeenCalledWith('author_id', 'user-1')
  })

  it('allows scoped repost id removal for owner moderation via RLS', async () => {
    const query = deleteChain()
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient({
      from: jest.fn(() => query),
    }))

    const res = await DELETE(jsonRequest({ repostId: 'repost-1' }), context)

    expect(res.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('original_post_id', 'post-1')
    expect(query.eq).toHaveBeenCalledWith('id', 'repost-1')
  })
})

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    ...overrides,
  }
}

function chain(response: { data: unknown; error: unknown }) {
  const query: {
    select: jest.Mock
    eq: jest.Mock
    maybeSingle: jest.Mock
  } = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue(response)
  return query
}

function deleteChain() {
  const query: { delete: jest.Mock; eq: jest.Mock } = {
    delete: jest.fn(),
    eq: jest.fn(),
  }
  query.delete.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

function insertChain(response: { data: unknown; error: unknown }) {
  const query: {
    insert: jest.Mock
    select: jest.Mock
    single: jest.Mock
  } = {
    insert: jest.fn(),
    select: jest.fn(),
    single: jest.fn(),
  }
  query.insert.mockReturnValue(query)
  query.select.mockReturnValue(query)
  query.single.mockResolvedValue(response)
  return query
}
