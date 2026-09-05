import { renderToStaticMarkup } from 'react-dom/server'
import { LyricCommentsPanel } from './LyricCommentsPanel'

const noop = () => {}
const asyncTrue = async () => true

describe('LyricCommentsPanel', () => {
  it('renders a private section thread, reply affordance, resolved control and participant mentions', () => {
    const participant = { userId: 'u-1', name: 'Maya Reyes', handle: 'maya-reyes', avatarUrl: null }
    const markup = renderToStaticMarkup(
      <LyricCommentsPanel
        workId="11111111-1111-4111-8111-111111111111"
        label="Verse 1"
        comments={[{
          id: 'c-1',
          blockId: 'b-1',
          parentCommentId: null,
          body: '@maya-reyes try this against Take 3.',
          author: participant,
          mentioned: [participant],
          resolvedAt: null,
          resolvedByName: null,
          createdAt: '2026-09-01T12:00:00.000Z',
          canResolve: true,
        }]}
        participants={[participant]}
        loading={false}
        error={null}
        saving={false}
        resolvingId={null}
        onSubmit={asyncTrue}
        onSetResolved={asyncTrue}
        onReactionChanged={noop}
        onClose={noop}
      />
    )
    expect(markup).toContain('Section comments')
    expect(markup).toContain('Verse 1')
    expect(markup).toContain('@maya-reyes')
    expect(markup).toContain('Reply')
    expect(markup).toContain('Resolve thread')
    expect(markup).toContain('Comments never change lyrics, splits, rights, or approvals')
  })

  it('shows an empty state and a focused comment composer', () => {
    const markup = renderToStaticMarkup(
      <LyricCommentsPanel
        workId="11111111-1111-4111-8111-111111111111"
        label="Chorus"
        comments={[]}
        participants={[]}
        loading={false}
        error={null}
        saving={false}
        resolvingId={null}
        onSubmit={asyncTrue}
        onSetResolved={asyncTrue}
        onReactionChanged={noop}
        onClose={noop}
      />
    )
    expect(markup).toContain('No comments on this section yet')
    expect(markup).toContain('Start a comment')
    expect(markup).toContain('Post comment')
  })
})
