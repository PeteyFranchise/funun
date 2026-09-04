import { renderToStaticMarkup } from 'react-dom/server'
import { Wall, type WallState } from './Wall'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

function renderPosts(posts: WallState['posts']) {
  return renderToStaticMarkup(
    <Wall
      wall={{
        profileUserId: 'shane-id',
        ownerName: 'Shane Maux',
        posts,
        canPost: true,
        viewerInitials: 'PZ',
      }}
    />
  )
}

describe('Wall author identity', () => {
  it('renders a named author with a linked @handle', () => {
    const markup = renderPosts([
      {
        id: 'post-1',
        body: 'Our first Funūn message, ever!',
        createdAt: new Date().toISOString(),
        authorName: 'Peter Zora',
        authorHandle: 'peterzora',
        authorAvatarUrl: null,
        authorRole: 'Producer',
      },
    ])

    expect(markup).toContain('href="/u/peterzora"')
    expect(markup).toContain('Peter Zora')
    expect(markup).toContain('@peterzora')
  })

  it('shows a handle-only identity once and still links it to the profile', () => {
    const markup = renderPosts([
      {
        id: 'post-1',
        body: 'Hello!',
        createdAt: new Date().toISOString(),
        authorName: '@peterzora',
        authorHandle: 'peterzora',
        authorAvatarUrl: null,
        authorRole: null,
      },
    ])

    expect(markup).toContain('href="/u/peterzora"')
    expect(markup.match(/@peterzora/g)).toHaveLength(1)
  })
})
