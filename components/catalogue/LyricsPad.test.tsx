import { renderToStaticMarkup } from 'react-dom/server'
import { LyricsPad, type LyricsPadBlock } from './LyricsPad'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ComposerCard.test.tsx and DiaryFeed.test.tsx.
// dnd-kit's DndContext/SortableContext render cleanly under
// renderToStaticMarkup with no DOM present; this suite stays structural
// only, per the plan's own instruction — no jsdom exists here to drive a
// drag.

const noop = () => {}
const noopAsync = async () => {}
const saveAsync = async () => true

function block(overrides: Partial<LyricsPadBlock> = {}): LyricsPadBlock {
  return {
    id: 'b1',
    work_id: 'w1',
    block_type: 'verse',
    custom_label: null,
    position: 0,
    text: 'City lights are burning',
    author_kind: 'human',
    author_user_id: 'u1',
    performers: [],
    repeat_of_block_id: null,
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    authorDisplay: { initial: 'P', name: '@peterzora', isOwner: true },
    singerDisplays: [],
    ...overrides,
  }
}

const baseProps = {
  vocalState: 'primary' as const,
  onHum: noop,
  onTextChange: saveAsync,
  sectionLocks: {},
  onBeginEdit: saveAsync,
  onEndEdit: noopAsync,
  onAddSinger: noop,
  onDetach: noop,
  onRemoveBlock: noop,
  onInsertSingle: noop,
  onInsertRepeat: noop,
  onReorder: noopAsync,
  onPasteImport: noop,
}

describe('LyricsPad', () => {
  it('renders one card per block, in position order', () => {
    const blocks = [
      block({ id: 'b1', block_type: 'verse', position: 0, text: 'First verse line' }),
      block({ id: 'b2', block_type: 'chorus', position: 1, text: 'Chorus line' }),
      block({ id: 'b3', block_type: 'verse', position: 2, text: 'Second verse line' }),
    ]
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={blocks} />)

    expect(markup).toContain('First verse line')
    expect(markup).toContain('Chorus line')
    expect(markup).toContain('Second verse line')
    // Position order — the first verse's text appears before the second's.
    expect(markup.indexOf('First verse line')).toBeLessThan(markup.indexOf('Chorus line'))
    expect(markup.indexOf('Chorus line')).toBeLessThan(markup.indexOf('Second verse line'))
    // Two verses exist, so RENUMBERING derives numerals for both — the
    // lone chorus gets no numeral.
    expect(markup).toContain('Verse 1')
    expect(markup).toContain('Verse 2')
    expect(markup).toContain('>Chorus<')
  })

  it('lists the eight add-section chips in the decided order', () => {
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={[block()]} />)
    const order = ['Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Intro', 'Outro', 'Hook', 'Custom']
    let lastIndex = -1
    for (const label of order) {
      const idx = markup.indexOf(label, lastIndex + 1)
      expect(idx).toBeGreaterThan(lastIndex)
      lastIndex = idx
    }
  })

  it('renders a divider above every block (n blocks -> n dividers)', () => {
    const blocks = [
      block({ id: 'b1', position: 0 }),
      block({ id: 'b2', position: 1 }),
      block({ id: 'b3', position: 2 }),
    ]
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={blocks} />)
    const dividerMatches = markup.match(/Insert a section here/g) ?? []
    expect(dividerMatches.length).toBe(3)
  })

  it('renders the add-section row, not a bare container, when the pad is empty', () => {
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={[]} />)
    expect(markup).toContain('Add a section')
    expect(markup).toContain('＋ Verse')
    expect(markup).not.toContain('Insert a section here')
  })

  it('renders the autosave line and the melody button, with no title input in the header', () => {
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={[block()]} />)
    expect(markup).toContain('lyrics saving automatically')
    expect(markup).toContain('every edit timestamped')
    expect(markup).toContain('Add the melody — hum it')
    expect(markup).not.toMatch(/<input[^>]*value="[^"]*"[^>]*>/)
  })

  it('renders no raw hex colour anywhere on the surface', () => {
    const markup = renderToStaticMarkup(<LyricsPad {...baseProps} blocks={[block()]} />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('shows who holds a section and requires an intentional takeover', () => {
    const markup = renderToStaticMarkup(
      <LyricsPad
        {...baseProps}
        blocks={[block()]}
        sectionLocks={{ b1: { state: 'other', holderName: 'Maya' } }}
      />
    )

    expect(markup).toContain('Maya is editing')
    expect(markup).toContain('You can wait or intentionally take over')
    expect(markup).toContain('Take over editing')
    expect(markup).toContain('readonly=""')
  })
})
