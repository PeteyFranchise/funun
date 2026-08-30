import { renderToStaticMarkup } from 'react-dom/server'
import { ComposerCard, ComposerCardEmptyState } from './ComposerCard'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as components/handles/ChooseHandleGate.test.tsx
// and components/vault/SharedProjectBadge.test.tsx.

describe('ComposerCard', () => {
  const noop = () => {}

  it('renders all four verbs with the sketch 005-C labels when capture is supported', () => {
    const markup = renderToStaticMarkup(
      <ComposerCard onHum={noop} onWriteLyrics={noop} onAddAudio={noop} onNote={noop} supportsCapture />
    )
    expect(markup).toContain('Hum it')
    expect(markup).toContain('Write lyrics')
    expect(markup).toContain('Add audio')
    expect(markup).toContain('Note')
  })

  it('renders the verbatim reassurance line', () => {
    const markup = renderToStaticMarkup(
      <ComposerCard onHum={noop} onWriteLyrics={noop} onAddAudio={noop} onNote={noop} supportsCapture />
    )
    expect(markup).toContain(
      'Whatever you add, the song remembers — who, what, when. That&#x27;s your proof, kept automatically.'
    )
  })

  it('degrades the hum tile to the upload path when capture is unsupported, without dropping the tile', () => {
    const markup = renderToStaticMarkup(
      <ComposerCard onHum={noop} onWriteLyrics={noop} onAddAudio={noop} onNote={noop} supportsCapture={false} />
    )
    expect(markup).not.toContain('Hum it')
    expect(markup).toContain('Upload it')
    // "Add audio" (the unrelated, separate tile) still renders on its own.
    expect(markup).toContain('Add audio')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <ComposerCard onHum={noop} onWriteLyrics={noop} onAddAudio={noop} onNote={noop} supportsCapture />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('spends no gradient on the default (non-empty) variant', () => {
    const markup = renderToStaticMarkup(
      <ComposerCard onHum={noop} onWriteLyrics={noop} onAddAudio={noop} onNote={noop} supportsCapture />
    )
    expect(markup).not.toContain('bg-grad')
  })
})

describe('ComposerCardEmptyState', () => {
  const noop = () => {}

  it('renders the hum-first hero copy and both actions', () => {
    const markup = renderToStaticMarkup(
      <ComposerCardEmptyState
        onHumYourIdea={noop}
        onStartWithLyrics={noop}
        onAddAudio={noop}
        supportsCapture
      />
    )
    expect(markup).toContain('Start with a hum')
    expect(markup).toContain('Thirty seconds of melody makes it real — and provably yours.')
    expect(markup).toContain('Hum your idea')
    expect(markup).toContain('Start with lyrics')
  })

  it('spends exactly one gradient, on the primary action', () => {
    const markup = renderToStaticMarkup(
      <ComposerCardEmptyState
        onHumYourIdea={noop}
        onStartWithLyrics={noop}
        onAddAudio={noop}
        supportsCapture
      />
    )
    const gradientMatches = markup.match(/bg-grad\b/g) ?? []
    expect(gradientMatches).toHaveLength(1)
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <ComposerCardEmptyState
        onHumYourIdea={noop}
        onStartWithLyrics={noop}
        onAddAudio={noop}
        supportsCapture
      />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('degrades the primary action to the upload path when capture is unsupported, keeping the gradient on it', () => {
    const markup = renderToStaticMarkup(
      <ComposerCardEmptyState
        onHumYourIdea={noop}
        onStartWithLyrics={noop}
        onAddAudio={noop}
        supportsCapture={false}
      />
    )
    expect(markup).not.toContain('Hum your idea')
    expect(markup).toContain('Add your idea')
    const gradientMatches = markup.match(/bg-grad\b/g) ?? []
    expect(gradientMatches).toHaveLength(1)
  })
})
