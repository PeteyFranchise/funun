import { renderToStaticMarkup } from 'react-dom/server'
import { LyricBlockCard } from './LyricBlockCard'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx and DiaryFeed.test.tsx.

const noop = () => {}

describe('LyricBlockCard', () => {
  it('renders exactly the label it was passed', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Verse 2"
        text="City lights"
        isRepeat={false}
        author={{ initial: 'P', name: '@peterzora', isOwner: true }}
        vocalState="primary"
        singers={[]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    expect(markup).toContain('Verse 2')
  })

  it('renders the source text and the repeat badge, and suppresses the author affordance, on a linked repeat', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Chorus 2"
        text="Meet me at midnight, where the wrong feels right"
        isRepeat
        author={{ initial: 'P', name: '@peterzora', isOwner: true }}
        vocalState="primary"
        singers={[]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    expect(markup).toContain('Meet me at midnight, where the wrong feels right')
    expect(markup).toContain('↺ repeat')
    expect(markup).toContain('Detach to vary')
    // Suppressed — attribution stays with the original writer, not this row.
    expect(markup).not.toContain('@peterzora')
  })

  it('renders no singer affordance at all on an instrumental work', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Intro"
        text=""
        isRepeat={false}
        author={{ initial: 'P', name: null, isOwner: true }}
        vocalState="instrumental"
        singers={[]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    expect(markup).not.toContain('who sings this?')
    expect(markup).not.toContain('🎤')
  })

  it('renders two singer avatars for a duet', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Bridge"
        text="lines"
        isRepeat={false}
        author={null}
        vocalState="varies"
        singers={[
          { key: 's1', initial: 'P', name: 'Pete', isOwner: true },
          { key: 's2', initial: 'B', name: 'Ben', isOwner: false },
        ]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    // No writer badge here (author is null), so every "avatar dot" match
    // belongs to the singer cluster — exactly two for a duet.
    const avatarMatches = markup.match(/rounded-full border border-card/g) ?? []
    expect(avatarMatches.length).toBe(2)
    expect(markup).toContain('Pete')
    expect(markup).toContain('Ben')
  })

  it('offers the "who sings this?" affordance when the singer cluster is empty and the work is not instrumental', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Verse 1"
        text="lines"
        isRepeat={false}
        author={{ initial: 'P', name: null, isOwner: true }}
        vocalState="primary"
        singers={[]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    expect(markup).toContain('who sings this?')
  })

  it('contains no raw hex colour and no inline style attribute carrying one', () => {
    const markup = renderToStaticMarkup(
      <LyricBlockCard
        label="Outro"
        text="fade"
        isRepeat={false}
        author={{ initial: 'P', name: null, isOwner: true }}
        vocalState="primary"
        singers={[{ key: 's1', initial: 'P', name: null, isOwner: true }]}
        onTextChange={noop}
        onAddSinger={noop}
        onDetach={noop}
      />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(markup).not.toMatch(/style="[^"]*#/)
  })
})
