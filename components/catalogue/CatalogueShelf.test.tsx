import { renderToStaticMarkup } from 'react-dom/server'
import { CatalogueShelf } from './CatalogueShelf'
import type { CatalogueCard } from './WorkCard'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as every other components/catalogue/*.test.tsx
// suite in this phase.

const cards: CatalogueCard[] = [
  {
    kind: 'work',
    id: 'w1',
    title: 'Midnight Drive',
    versionCount: 1,
    latestVersionNumeral: 1,
    blockCount: 0,
    contributors: [{ id: 'm1', initial: 'P', name: 'Pete', isOwner: true }],
    splitsStatus: 'none',
    writerCount: 0,
    lastActivityAt: new Date().toISOString(),
  },
  {
    kind: 'legacy',
    id: 'proj1',
    title: 'demo — untitled (Apr)',
    lastActivityAt: new Date().toISOString(),
  },
]

describe('CatalogueShelf', () => {
  it('renders the heading and the possessive-voice subtitle', () => {
    const markup = renderToStaticMarkup(<CatalogueShelf cards={cards} />)
    expect(markup).toContain('My Catalogue')
    expect(markup).toContain('Your songs')
  })

  it('renders the grid for a populated list, including the legacy row', () => {
    const markup = renderToStaticMarkup(<CatalogueShelf cards={cards} />)
    expect(markup).toContain('Midnight Drive')
    expect(markup).toContain('demo — untitled (Apr)')
    expect(markup).not.toContain('Start with a hum')
  })

  it('renders the hum pitch and the 🎵 door for an empty list', () => {
    const markup = renderToStaticMarkup(<CatalogueShelf cards={[]} />)
    expect(markup).toContain('Start with a hum')
    expect(markup).toContain('Thirty seconds of melody makes it real')
    expect(markup).toContain('🎵 Start a song')
    expect(markup).toContain('href="/vault/new"')
  })

  it('contains no raw hex colour, in either state', () => {
    expect(renderToStaticMarkup(<CatalogueShelf cards={cards} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(renderToStaticMarkup(<CatalogueShelf cards={[]} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('never spends the reserved bg-grad utility, in either state — the page already spent it', () => {
    const populated = renderToStaticMarkup(<CatalogueShelf cards={cards} />)
    const empty = renderToStaticMarkup(<CatalogueShelf cards={[]} />)
    expect(populated.match(/\bbg-grad\b(?!ient)/g) ?? []).toHaveLength(0)
    expect(empty.match(/\bbg-grad\b(?!ient)/g) ?? []).toHaveLength(0)
  })
})
