import { renderToStaticMarkup } from 'react-dom/server'
import { WorkCard, type CatalogueCard } from './WorkCard'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as every other components/catalogue/*.test.tsx
// suite in this phase.

const workCard: CatalogueCard = {
  kind: 'work',
  id: 'w1',
  title: 'Midnight Drive',
  versionCount: 3,
  latestVersionNumeral: 3,
  blockCount: 4,
  contributors: [
    { id: 'm1', initial: 'P', name: 'Pete', isOwner: true },
    { id: 'm2', initial: 'B', name: 'Ben Cooke', isOwner: false },
  ],
  splitsStatus: 'draft',
  writerCount: 2,
  lastActivityAt: new Date(Date.now() - 60_000).toISOString(),
}

const emptyWorkCard: CatalogueCard = {
  kind: 'work',
  id: 'w2',
  title: 'Untitled',
  versionCount: 0,
  latestVersionNumeral: null,
  blockCount: 0,
  contributors: [{ id: 'm3', initial: 'P', name: 'Pete', isOwner: true }],
  splitsStatus: 'none',
  writerCount: 0,
  lastActivityAt: new Date(Date.now() - 3_600_000).toISOString(),
}

const legacyCard: CatalogueCard = {
  kind: 'legacy',
  id: 'proj1',
  title: 'demo — untitled (Apr)',
  lastActivityAt: new Date(Date.now() - 86_400_000).toISOString(),
}

describe('WorkCard', () => {
  it('renders the title, a version count with the latest numeral, and a splits word', () => {
    const markup = renderToStaticMarkup(<WorkCard card={workCard} />)
    expect(markup).toContain('Midnight Drive')
    expect(markup).toContain('3 versions · v3')
    expect(markup).toContain('Drafting')
  })

  it('renders no score ring and no release-only field', () => {
    const markup = renderToStaticMarkup(<WorkCard card={workCard} />)
    expect(markup).not.toMatch(/conic-gradient/)
    expect(markup).not.toMatch(/Release readiness|Deal-ready|ISRC|Distributor/i)
  })

  it('renders the block count when the pad has sections, and omits the line entirely when empty', () => {
    const withBlocks = renderToStaticMarkup(<WorkCard card={workCard} />)
    expect(withBlocks).toContain('4 sections')

    const withoutBlocks = renderToStaticMarkup(<WorkCard card={emptyWorkCard} />)
    expect(withoutBlocks).not.toContain('sections')
  })

  it('renders "No versions yet" and "No sheet yet" for a brand-new work with no writers', () => {
    const markup = renderToStaticMarkup(<WorkCard card={emptyWorkCard} />)
    expect(markup).toContain('No versions yet')
    expect(markup).toContain('No sheet yet')
  })

  it('renders "No writers yet" for a work with a draft sheet but nobody promoted', () => {
    const draftNoWriters: CatalogueCard = { ...workCard, splitsStatus: 'draft', writerCount: 0 }
    const markup = renderToStaticMarkup(<WorkCard card={draftNoWriters} />)
    expect(markup).toContain('No writers yet')
  })

  it('links to the composer room', () => {
    const markup = renderToStaticMarkup(<WorkCard card={workCard} />)
    expect(markup).toContain('href="/vault/works/w1"')
  })

  it('renders contributor avatars, one dot per contributor', () => {
    const markup = renderToStaticMarkup(<WorkCard card={workCard} />)
    const dots = markup.match(/rounded-full border border-card/g) ?? []
    expect(dots.length).toBe(2)
  })

  it('renders a legacy row with its marker and its existing project-room link, not the composer', () => {
    const markup = renderToStaticMarkup(<WorkCard card={legacyCard} />)
    expect(markup).toContain('Legacy project')
    expect(markup).toContain('demo — untitled (Apr)')
    expect(markup).toContain('href="/vault/proj1"')
    expect(markup).not.toContain('/vault/works/')
  })

  it('contains no raw hex colour', () => {
    expect(renderToStaticMarkup(<WorkCard card={workCard} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(renderToStaticMarkup(<WorkCard card={legacyCard} />)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('never spends the reserved bg-grad utility — this card is deliberately plain', () => {
    const markup = renderToStaticMarkup(<WorkCard card={workCard} />)
    expect(markup.match(/\bbg-grad\b(?!ient)/g) ?? []).toHaveLength(0)
  })
})
