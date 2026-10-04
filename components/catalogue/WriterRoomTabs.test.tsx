import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { WriterRoomTabs, type WriterRoomTabItem } from './WriterRoomTabs'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, same treatment as ProjectTabs' sibling pattern and every other
// components/catalogue/*.test.tsx file. A click → setState → re-render
// cycle (does tapping the door trigger actually open the overlay? does
// clicking a tab actually switch the active panel?) has no DOM here to
// exercise it against — this suite proves initial-render markup only.

const SENTINEL = 'TAKES-PANEL-SENTINEL-7f3c'

function items(): WriterRoomTabItem[] {
  return [
    { key: 'takes', label: 'Takes', description: '2 active takes', content: <p>{SENTINEL}</p> },
    { key: 'diary', label: 'Diary', description: 'Chronological song history', content: <p>Diary content</p> },
    { key: 'notes', label: 'Notes', description: '1 open thread', content: <p>Notes content</p> },
  ]
}

describe('WriterRoomTabs', () => {
  it('defaults to the first item active, the other two hidden', () => {
    const markup = renderToStaticMarkup(<WriterRoomTabs items={items()} />)
    const takesIndex = markup.indexOf(SENTINEL)
    expect(takesIndex).toBeGreaterThan(-1)
    // The panel wrapper immediately before the sentinel's own content must
    // not carry the `hidden` class — walk backward from the sentinel to its
    // nearest enclosing div's class attribute.
    const beforeTakes = markup.slice(0, takesIndex)
    const takesPanelOpenTag = beforeTakes.lastIndexOf('<div')
    const takesPanelTag = markup.slice(takesPanelOpenTag, markup.indexOf('>', takesPanelOpenTag) + 1)
    expect(takesPanelTag).not.toMatch(/class="[^"]*\bhidden\b[^"]*"/)

    const diaryIndex = markup.indexOf('Diary content')
    const beforeDiary = markup.slice(0, diaryIndex)
    const diaryPanelOpenTag = beforeDiary.lastIndexOf('<div')
    const diaryPanelTag = markup.slice(diaryPanelOpenTag, markup.indexOf('>', diaryPanelOpenTag) + 1)
    expect(diaryPanelTag).toMatch(/class="[^"]*\bhidden\b[^"]*"/)

    const notesIndex = markup.indexOf('Notes content')
    const beforeNotes = markup.slice(0, notesIndex)
    const notesPanelOpenTag = beforeNotes.lastIndexOf('<div')
    const notesPanelTag = markup.slice(notesPanelOpenTag, markup.indexOf('>', notesPanelOpenTag) + 1)
    expect(notesPanelTag).toMatch(/class="[^"]*\bhidden\b[^"]*"/)
  })

  it('honors an activeKey override — the third item is the one without hidden', () => {
    const markup = renderToStaticMarkup(<WriterRoomTabs items={items()} activeKey="notes" />)

    const takesIndex = markup.indexOf(SENTINEL)
    const beforeTakes = markup.slice(0, takesIndex)
    const takesPanelOpenTag = beforeTakes.lastIndexOf('<div')
    const takesPanelTag = markup.slice(takesPanelOpenTag, markup.indexOf('>', takesPanelOpenTag) + 1)
    expect(takesPanelTag).toMatch(/class="[^"]*\bhidden\b[^"]*"/)

    const notesIndex = markup.indexOf('Notes content')
    const beforeNotes = markup.slice(0, notesIndex)
    const notesPanelOpenTag = beforeNotes.lastIndexOf('<div')
    const notesPanelTag = markup.slice(notesPanelOpenTag, markup.indexOf('>', notesPanelOpenTag) + 1)
    expect(notesPanelTag).not.toMatch(/class="[^"]*\bhidden\b[^"]*"/)
  })

  it('mounts each panel exactly once — the sentinel never appears twice, regardless of which responsive chrome is present', () => {
    const markup = renderToStaticMarkup(<WriterRoomTabs items={items()} />)
    const occurrences = markup.split(SENTINEL).length - 1
    expect(occurrences).toBe(1)
  })

  it('renders both the inline desktop tab row and the mobile door trigger — static markup cannot tell us which one a real browser shows at a given width, only that both exist', () => {
    const markup = renderToStaticMarkup(<WriterRoomTabs items={items()} />)
    expect(markup).toMatch(/role="tablist"/)
    // The door trigger is a distinct, separately-labelled affordance from
    // the tablist itself — its own button, not merely the tablist row
    // re-styled.
    expect(markup).toContain('Takes, Diary &amp; Notes')
  })

  it('renders every item label and description', () => {
    const markup = renderToStaticMarkup(<WriterRoomTabs items={items()} />)
    for (const item of items()) {
      expect(markup).toContain(item.label)
      expect(markup).toContain(item.description)
    }
  })

  it('carries the PROVISIONAL status as a comment inside the component source, not only in planning docs', () => {
    const source = readFileSync(path.join(__dirname, 'WriterRoomTabs.tsx'), 'utf8')
    expect(source).toMatch(/PROVISIONAL/)
    expect(source).toMatch(/first real user feedback on the Writer's Room/i)
  })

  // Retired-palette and dark-blue-dominant-surface coverage is already
  // enforced repo-wide by `__tests__/palette-single-source.test.ts`, which
  // walks every file under components/ (this one included) — not
  // duplicated here, and deliberately not spelling a retired hex literal
  // in this file's own text, which that same walker would flag.
})
