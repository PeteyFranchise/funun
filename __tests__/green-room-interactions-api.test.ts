import {
  DELETE as DELETE_COMMENT,
  POST as POST_COMMENT,
} from '@/app/api/green-room/posts/[postId]/comments/route'
import {
  DELETE as DELETE_REACTION,
  POST as POST_REACTION,
} from '@/app/api/green-room/posts/[postId]/reactions/route'
import { createApiClient } from '@/lib/supabase/server'
import { GREEN_ROOM_REACTION_LABELS } from '@/lib/green-room/feed'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/green-room/posts/post-1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ postId: 'post-1' }) }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('Green Room comments API', () => {
  it('requires auth before inserting a comment', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await POST_COMMENT(jsonRequest({ body: 'Hello' }), context)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects empty and nested comments', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient())

    const empty = await POST_COMMENT(jsonRequest({ body: '   ' }), context)
    expect(empty.status).toBe(400)
    await expect(empty.json()).resolves.toEqual({ error: 'Comment is empty' })

    const nested = await POST_COMMENT(jsonRequest({ body: 'Hi', parentId: 'comment-1' }), context)
    expect(nested.status).toBe(400)
    await expect(nested.json()).resolves.toEqual({ error: 'Nested comments are not supported yet' })
  })

  it('inserts a visible-post-scoped comment through RLS-backed table policies', async () => {
    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: { id: 'comment-1', post_id: 'post-1', author_id: 'user-1', body: 'Nice' },
          error: null,
        })),
      })),
    }))
    const client = authClient({
      from: jest.fn((table: string) => {
        expect(table).toBe('green_room_comments')
        return { insert }
      }),
    })
    ;(createApiClient as jest.Mock).mockResolvedValue(client)

    const res = await POST_COMMENT(jsonRequest({ body: '  Nice  ' }), context)

    expect(res.status).toBe(201)
    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', body: 'Nice' })
  })

  it('deletes by comment id and post id so post-owner moderation stays scoped', async () => {
    const query = deleteChain()
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient({
      from: jest.fn(() => query),
    }))

    const res = await DELETE_COMMENT(jsonRequest({ commentId: 'comment-1' }), context)

    expect(res.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('id', 'comment-1')
    expect(query.eq).toHaveBeenCalledWith('post_id', 'post-1')
  })
})

describe('Green Room reactions API', () => {
  it('uses the planned reaction label set', () => {
    expect(GREEN_ROOM_REACTION_LABELS).toEqual({
      like: 'Like',
      love: 'Love',
      fire: 'Fire',
      congrats: 'Congrats',
      inspired: 'Inspired',
      helpful: 'Helpful',
      interested: 'Interested',
    })
  })

  it('rejects invalid reaction types', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient())

    const res = await POST_REACTION(jsonRequest({ reactionType: 'angry' }), context)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'A valid reaction type is required' })
  })

  it('replaces the viewer reaction with a single selected type', async () => {
    const deleteQuery = deleteChain()
    const insert = jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: { post_id: 'post-1', user_id: 'user-1', reaction_type: 'fire' },
          error: null,
        })),
      })),
    }))
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient({
      from: jest.fn((table: string) => {
        expect(table).toBe('green_room_reactions')
        return { ...deleteQuery, insert }
      }),
    }))

    const res = await POST_REACTION(jsonRequest({ reactionType: 'fire' }), context)

    expect(res.status).toBe(201)
    expect(deleteQuery.eq).toHaveBeenCalledWith('post_id', 'post-1')
    expect(deleteQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1', reaction_type: 'fire' })
  })

  it('removes only the viewer reaction for the post', async () => {
    const query = deleteChain()
    ;(createApiClient as jest.Mock).mockResolvedValue(authClient({
      from: jest.fn(() => query),
    }))

    const res = await DELETE_REACTION(jsonRequest({}), context)

    expect(res.status).toBe(200)
    expect(query.eq).toHaveBeenCalledWith('post_id', 'post-1')
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    ...overrides,
  }
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
