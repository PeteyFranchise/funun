import { renderToStaticMarkup } from 'react-dom/server'
import { WorkHeader } from './WorkHeader'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx / GuidingLine.test.tsx.

const baseProps = {
  workId: 'work-1',
  title: 'Midnight',
  ownerHandle: 'peterzora',
  contributorNames: ['Ben Cooke'],
  splitsStatus: 'draft',
  canEdit: true,
}

describe('WorkHeader', () => {
  it('renders the title as an input carrying the current value', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader
        {...baseProps}
        vocalState="primary"
        primaryPerformerLabel="peterzora"
      />
    )
    expect(markup).toContain('aria-label="Song title"')
    expect(markup).toContain('value="Midnight"')
  })

  it('renders the splits chip as a state word with no percent character next to a name', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).toContain('Splits: draft')
    expect(markup).not.toContain('%')
  })

  it('renders the contributor and owner chips as plain names — never a number beside one', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).toContain('@peterzora')
    expect(markup).toContain('Ben Cooke')
    expect(markup).not.toMatch(/Ben Cooke[^<]*\d/)
  })

  it('renders the primary state with the inheritance line and the resolved performer', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).toContain('primary performer: @peterzora')
    expect(markup).toContain('sections inherit unless tagged')
  })

  it('renders the varies state distinctly, without the inheritance line', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="varies" primaryPerformerLabel={null} />
    )
    expect(markup).toContain('Varies')
    expect(markup).toContain('per-block')
    expect(markup).not.toContain('sections inherit unless tagged')
  })

  it('renders the instrumental state distinctly and states what it causes, without the inheritance line', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="instrumental" primaryPerformerLabel={null} />
    )
    expect(markup).toContain('Instrumental — no vocals')
    expect(markup).toContain('Crate vocal check')
    expect(markup).not.toContain('sections inherit unless tagged')
  })

  it('each of the three vocal states renders its own distinct affordance', () => {
    const primary = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    const varies = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="varies" primaryPerformerLabel={null} />
    )
    const instrumental = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="instrumental" primaryPerformerLabel={null} />
    )
    expect(primary).not.toBe(varies)
    expect(varies).not.toBe(instrumental)
    expect(primary).not.toBe(instrumental)
  })

  it('collapses the LearnWhy guardrail content on first paint', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).toContain('Why does inheritance work this way?')
    expect(markup).not.toContain('fills the plan and never the record')
    expect(markup).not.toContain('can never hide under the default')
  })

  it('disables the title input and vocal control when the viewer cannot edit', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} canEdit={false} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).toContain('disabled=""')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(
      <WorkHeader {...baseProps} vocalState="primary" primaryPerformerLabel="peterzora" />
    )
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
