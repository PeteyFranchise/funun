import { POST } from '@/app/api/green-room/posts/route'
import { createApiClient } from '@/lib/supabase/server'
import {
  createGreenRoomPost,
  validateGreenRoomPostInput,
} from '@/lib/green-room/post-write'

const { createGreenRoomPost: createGreenRoomPostActual } = jest.requireActual(
  '@/lib/green-room/post-write'
) as typeof import('@/lib/green-room/post-write')

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/green-room/post-write', () => {
  const actual = jest.requireActual('@/lib/green-room/post-write')
  return {
    ...actual,
    createGreenRoomPost: jest.fn(),
  }
})

function jsonRequest(body: unknown) {
  return new Request('http://test.local/api/green-room/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('validateGreenRoomPostInput', () => {
  it('rejects unknown fields and malformed enum values', () => {
    expect(validateGreenRoomPostInput({ postType: 'general_update', body: 'Hello', surprise: true })).toEqual({
      ok: false,
      error: 'Unknown field: surprise',
      status: 400,
    })

    expect(validateGreenRoomPostInput({ postType: 'photo_dump', body: 'Hello' })).toEqual({
      ok: false,
      error: 'A valid post type is required',
      status: 400,
    })
  })

  it('rejects empty published posts and visibility spoofing', () => {
    expect(validateGreenRoomPostInput({ postType: 'general_update', body: '   ', status: 'published' })).toEqual({
      ok: false,
      error: 'Post body is required',
      status: 400,
    })

    expect(validateGreenRoomPostInput({
      postType: 'general_update',
      body: 'Hello',
      status: 'published',
      visibility: 'draft',
    })).toEqual({
      ok: false,
      error: 'Published posts cannot use draft visibility',
      status: 400,
    })
  })

  it('requires valid custom audiences only for custom visibility', () => {
    expect(validateGreenRoomPostInput({
      postType: 'general_update',
      body: 'Hello',
      visibility: 'custom',
      audience: { relationships: ['friends'] },
    })).toEqual({
      ok: false,
      error: 'Unknown audience relationship: friends',
      status: 400,
    })

    expect(validateGreenRoomPostInput({
      postType: 'general_update',
      body: 'Hello',
      visibility: 'public',
      audience: { roles: ['Attorney'] },
    })).toEqual({
      ok: false,
      error: 'Audience is only allowed for custom visibility',
      status: 400,
    })
  })

  it('normalizes a valid draft as owner-only draft visibility', () => {
    expect(validateGreenRoomPostInput({
      postType: 'question',
      body: '  Should I drop this mix? ',
      status: 'draft',
      visibility: 'draft',
      allowResharing: false,
    })).toEqual({
      ok: true,
      input: {
        postType: 'question',
        body: 'Should I drop this mix?',
        visibility: 'draft',
        status: 'draft',
        linkedObject: null,
        allowResharing: false,
        audience: null,
      },
    })
  })
})

describe('POST /api/green-room/posts', () => {
  it('requires authentication', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await POST(jsonRequest({ postType: 'general_update', body: 'Hello' }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(createGreenRoomPost).not.toHaveBeenCalled()
  })

  it('delegates authenticated writes to the post service', async () => {
    const supabase = {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    }
    ;(createApiClient as jest.Mock).mockResolvedValue(supabase)
    ;(createGreenRoomPost as jest.Mock).mockResolvedValue({
      ok: true,
      post: {
        id: 'post-1',
        authorId: 'user-1',
        postType: 'general_update',
        body: 'Hello',
        visibility: 'public',
        status: 'published',
        linkedObject: null,
        allowResharing: true,
        publishedAt: '2026-07-15T12:00:00.000Z',
        createdAt: '2026-07-15T12:00:00.000Z',
      },
    })

    const body = { postType: 'general_update', body: 'Hello' }
    const res = await POST(jsonRequest(body))

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({
      data: {
        id: 'post-1',
        authorId: 'user-1',
        postType: 'general_update',
        body: 'Hello',
        visibility: 'public',
        status: 'published',
        linkedObject: null,
        allowResharing: true,
        publishedAt: '2026-07-15T12:00:00.000Z',
        createdAt: '2026-07-15T12:00:00.000Z',
      },
    })
    expect(createGreenRoomPost).toHaveBeenCalledWith(supabase, 'user-1', body)
  })

  it('maps post-service validation failures to HTTP responses', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    })
    ;(createGreenRoomPost as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'Linked project must be public before publishing',
      status: 400,
    })

    const res = await POST(jsonRequest({
      postType: 'release_announcement',
      body: 'New record soon',
      linkedObject: { type: 'project', id: 'private-project' },
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Linked project must be public before publishing' })
  })
})

describe('createGreenRoomPost linked object publishing checks', () => {
  it('rejects a private linked project before inserting the post', async () => {
    const projectQuery = chain({ data: { id: 'project-1', user_id: 'user-1', is_public: false }, error: null })
    const from = jest.fn((table: string) => {
      if (table === 'vault_projects') return projectQuery
      if (table === 'green_room_posts') throw new Error('Post insert should not run')
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createGreenRoomPostActual({ from } as never, 'user-1', {
      postType: 'release_announcement',
      body: 'Announcing this soon',
      linkedObject: { type: 'project', id: 'project-1' },
    })

    expect(result).toEqual({
      ok: false,
      error: 'Linked project must be public before publishing',
      status: 400,
    })
  })

  it('allows draft posts to reference an unverified linked object without publishing it', async () => {
    const inserted = {
      id: 'post-1',
      author_id: 'user-1',
      post_type: 'release_announcement',
      body: 'Draft announcement',
      visibility: 'draft',
      status: 'draft',
      linked_object_type: 'project',
      linked_object_id: 'private-project',
      allow_resharing: true,
      published_at: null,
      created_at: '2026-07-15T12:00:00.000Z',
    }
    const insertQuery = {
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({ data: inserted, error: null })),
        })),
      })),
    }
    const from = jest.fn((table: string) => {
      if (table === 'green_room_posts') return insertQuery
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createGreenRoomPostActual({ from } as never, 'user-1', {
      postType: 'release_announcement',
      body: 'Draft announcement',
      status: 'draft',
      visibility: 'draft',
      linkedObject: { type: 'project', id: 'private-project' },
    })

    expect(result).toEqual({
      ok: true,
      post: {
        id: 'post-1',
        authorId: 'user-1',
        postType: 'release_announcement',
        body: 'Draft announcement',
        visibility: 'draft',
        status: 'draft',
        linkedObject: { type: 'project', id: 'private-project' },
        allowResharing: true,
        publishedAt: null,
        createdAt: '2026-07-15T12:00:00.000Z',
      },
    })
    expect(from).not.toHaveBeenCalledWith('vault_projects')
  })
})

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
