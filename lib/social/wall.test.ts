import { loadWall } from '@/lib/social/wall'

function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) {
    builder[method] = jest.fn(() => builder)
  }
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

function wallClient(author: {
  artist_name: string | null
  handle: string | null
  avatar_url?: string | null
  roles?: unknown
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'wall_posts') {
        return tableBuilder([
          {
            id: 'post-1',
            body: 'Our first Funūn message, ever!',
            created_at: '2026-09-04T09:00:00Z',
            author_id: 'peter-id',
          },
        ])
      }
      if (table === 'user_profiles') {
        return tableBuilder([
          {
            id: 'peter-id',
            avatar_url: null,
            roles: [],
            ...author,
          },
        ])
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('loadWall author identity', () => {
  it('shows the artist name and @handle when both exist', async () => {
    const posts = await loadWall(
      wallClient({ artist_name: 'Peter Zora', handle: 'peterzora' }) as never,
      'shane-id'
    )

    expect(posts[0]).toMatchObject({
      authorName: 'Peter Zora',
      authorHandle: 'peterzora',
    })
  })

  it('uses @handle as the primary identity without duplicating it when no artist name exists', async () => {
    const posts = await loadWall(
      wallClient({ artist_name: null, handle: 'peterzora' }) as never,
      'shane-id'
    )

    expect(posts[0]).toMatchObject({
      authorName: '@peterzora',
      authorHandle: 'peterzora',
    })
  })

  it('keeps a safe fallback for historical posts with no remaining profile identity', async () => {
    const posts = await loadWall(
      wallClient({ artist_name: null, handle: null }) as never,
      'shane-id'
    )

    expect(posts[0]).toMatchObject({
      authorName: 'Member',
      authorHandle: null,
    })
  })
})
