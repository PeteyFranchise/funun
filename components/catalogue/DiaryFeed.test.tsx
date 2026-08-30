import { renderToStaticMarkup } from 'react-dom/server'
import { describeDiaryEvent, type DiaryEventContext, type DiaryEventRowLike } from '@/lib/catalogue/diary'
import { DiaryFeed, diaryMatchesQuery, type DiaryFeedEntry } from './DiaryFeed'

// No jsdom in this repo (testEnvironment: 'node') — asserted as static
// markup, matching components/handles/ChooseHandleGate.test.tsx.
//
// Fixtures run every row through the real `describeDiaryEvent()` (plan
// 04) rather than hand-writing view objects — this is the same
// contract the page will use, so a drift between the two modules would
// show up here first.

const CONTEXT: DiaryEventContext = {
  names: { u1: 'Ben Cooke', c1: 'Dana Whitfield' },
  versionNumerals: { v1: 1, v2: 2 },
}

const ROWS: DiaryEventRowLike[] = [
  {
    id: 'e-version-2',
    work_id: 'w1',
    kind: 'version',
    actor_user_id: 'u1',
    payload: { versionId: 'v2', source: 'upload', label: null },
    created_at: '2026-08-28T10:00:00Z',
  },
  {
    id: 'e-version-1',
    work_id: 'w1',
    kind: 'version',
    actor_user_id: 'u1',
    payload: { versionId: 'v1', source: 'hum', label: null },
    created_at: '2026-05-02T10:00:00Z',
  },
  {
    id: 'e-lyric-edit',
    work_id: 'w1',
    kind: 'lyric_edit',
    actor_user_id: 'u1',
    payload: { blockId: 'b1', blockType: 'verse', customLabel: null, operation: 'added' },
    created_at: '2026-08-20T10:00:00Z',
  },
  {
    id: 'e-roster',
    work_id: 'w1',
    kind: 'roster',
    actor_user_id: 'u1',
    payload: { memberId: 'm1', tier: 'contribute', collaboratorId: 'c1', memberUserId: null },
    created_at: '2026-06-03T10:00:00Z',
  },
  {
    id: 'e-sheet',
    work_id: 'w1',
    kind: 'sheet',
    actor_user_id: 'u1',
    payload: { partyId: 'p1', sheetId: 's1', name: 'Ben Cooke', collaboratorId: 'c1', operation: 'party_added' },
    created_at: '2026-06-03T10:05:00Z',
  },
  {
    id: 'e-ai-entry',
    work_id: 'w1',
    kind: 'ai_entry',
    actor_user_id: 'u1',
    payload: {
      entryId: 'ai1',
      level: 'version',
      component: 'vocal',
      mode: 'performance',
      citation: 'AI reference vocal — performed a human-written melody, demo only',
      humanSourceVersionId: 'v1',
    },
    created_at: '2026-05-21T10:00:00Z',
  },
  {
    id: 'e-rename',
    work_id: 'w1',
    kind: 'rename',
    actor_user_id: 'u1',
    payload: { previousTitle: 'Late Drive', title: 'Midnight' },
    created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 'e-reorder',
    work_id: 'w1',
    kind: 'reorder',
    actor_user_id: 'u1',
    payload: { blockCount: 3 },
    created_at: '2026-08-22T10:00:00Z',
  },
  {
    id: 'e-detach',
    work_id: 'w1',
    kind: 'detach',
    actor_user_id: 'u1',
    payload: { blockId: 'b2', blockType: 'chorus', detachedFromBlockId: 'b1' },
    created_at: '2026-08-23T10:00:00Z',
  },
  {
    id: 'e-note',
    work_id: 'w1',
    kind: 'note',
    actor_user_id: 'u1',
    payload: { text: 'Thinking about a bridge here.' },
    created_at: '2026-08-24T10:00:00Z',
  },
]

function buildEntries(): DiaryFeedEntry[] {
  return ROWS.map(row => {
    const view = describeDiaryEvent(row, CONTEXT)
    const entry: DiaryFeedEntry = { ...view, id: row.id }
    if (row.kind === 'version') {
      const payload = row.payload as { versionId: string }
      entry.versionNumeral = CONTEXT.versionNumerals[payload.versionId]
      if (row.id === 'e-version-2') {
        entry.playbackUrl = 'https://signed.example.com/v2.mp3?sig=abc'
        entry.playbackDurationSeconds = 47
      }
      // e-version-1 deliberately carries no playbackUrl.
    }
    return entry
  })
}

describe('DiaryFeed', () => {
  it('renders headline, consequence and date for every diary kind (compact layout)', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} />)
    expect(markup).toContain('v2 — audio uploaded')
    expect(markup).toContain('v1 — hum recorded')
    expect(markup).toContain('Ben Cooke added Verse')
    expect(markup).toContain('joined as')
    expect(markup).toContain('joined the split sheet')
    expect(markup).toContain('AI vocal added')
    expect(markup).toContain('Renamed &quot;Late Drive&quot; → &quot;Midnight&quot;')
    expect(markup).toContain('Ben Cooke reordered 3 sections')
    expect(markup).toContain('Ben Cooke detached')
    expect(markup).toContain('Thinking about a bridge here.')
  })

  it('renders a play control only for the version entry that carries a playbackUrl', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} />)
    // e-version-2 (47s, has a URL) gets a control with its duration.
    expect(markup).toContain('▶ 0:47')
  })

  it('renders no player at all for a version entry with no playbackUrl', () => {
    const withoutUrl = buildEntries().filter(e => e.id === 'e-version-1')
    const markup = renderToStaticMarkup(<DiaryFeed entries={withoutUrl} />)
    expect(markup).not.toContain('▶')
  })

  it("renders an AI entry's consequence character-identical to the citation it was given", () => {
    const citation = 'AI reference vocal — performed a human-written melody, demo only'
    const withAi = buildEntries().filter(e => e.id === 'e-ai-entry')
    const markup = renderToStaticMarkup(<DiaryFeed entries={withAi} />)
    expect(markup).toContain(citation)
  })

  it('renders no nudge affordance — the diary stays clean', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} />)
    expect(markup.toLowerCase()).not.toContain('re-author')
    expect(markup.toLowerCase()).not.toContain('add to the sheet')
    expect(markup.toLowerCase()).not.toContain('fix')
    expect(markup.toLowerCase()).not.toContain('warning')
  })

  it('does not re-sort — renders entries in the order it was given', () => {
    const entries = buildEntries()
    const markup = renderToStaticMarkup(<DiaryFeed entries={entries} />)
    const firstIndex = markup.indexOf('v2 — audio uploaded')
    const secondIndex = markup.indexOf('v1 — hum recorded')
    expect(firstIndex).toBeGreaterThan(-1)
    expect(secondIndex).toBeGreaterThan(firstIndex)
  })

  it('renders one quiet empty-state line and nothing else when there are no entries', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={[]} />)
    expect(markup).toContain('Nothing recorded yet')
  })

  it('renders both layout modes', () => {
    const entries = buildEntries()
    const compact = renderToStaticMarkup(<DiaryFeed entries={entries} layout="compact" />)
    const rail = renderToStaticMarkup(<DiaryFeed entries={entries} layout="rail" />)
    expect(compact).toContain('v1 — hum recorded')
    expect(rail).toContain('v1 — hum recorded')
    // Rail alone carries the kind chips (vN / § / AI).
    expect(rail).toContain('>§<')
    expect(rail).toContain('>AI<')
    expect(compact).not.toContain('>§<')
  })

  it('contains no raw hex colour', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} layout="rail" />)
    expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  // ─── Collapse + search (opt-in via collapseAfter) ─────────────────────

  it('without collapseAfter renders the whole feed and no chrome', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} />)
    expect(markup).toContain('Thinking about a bridge here.') // the 10th (oldest) entry
    expect(markup).not.toContain('Search the diary')
    expect(markup).not.toContain('Show all')
  })

  it('collapses to the most recent N and offers a "Show all" toggle when longer', () => {
    const markup = renderToStaticMarkup(<DiaryFeed entries={buildEntries()} collapseAfter={4} />)
    // First four (as given, newest-first) are shown…
    expect(markup).toContain('v2 — audio uploaded')
    expect(markup).toContain('Ben Cooke added Verse')
    // …and a later one is hidden behind the toggle.
    expect(markup).not.toContain('Thinking about a bridge here.')
    expect(markup).toContain('Show all 10 updates')
    expect(markup).toContain('Search the diary')
  })

  it('shows no chrome when the diary is not longer than collapseAfter', () => {
    const short = buildEntries().slice(0, 3)
    const markup = renderToStaticMarkup(<DiaryFeed entries={short} collapseAfter={6} />)
    expect(markup).toContain('v2 — audio uploaded')
    expect(markup).not.toContain('Search the diary')
    expect(markup).not.toContain('Show all')
  })

  it('diaryMatchesQuery finds by person and by section, case-insensitively', () => {
    const entries = buildEntries()
    const lyricEntry = entries.find(e => e.kind === 'lyric_edit')! // "Ben Cooke added Verse"
    const versionEntry = entries.find(e => e.kind === 'version')! // "v2 — audio uploaded"

    // by section
    expect(diaryMatchesQuery(lyricEntry, 'verse')).toBe(true)
    expect(diaryMatchesQuery(versionEntry, 'verse')).toBe(false)
    // by person (the actor's name is in the headline), case-insensitive
    expect(diaryMatchesQuery(lyricEntry, 'ben cooke')).toBe(true)
    expect(diaryMatchesQuery(lyricEntry, 'BEN')).toBe(true)
    // empty query matches everything; a miss matches nothing
    expect(diaryMatchesQuery(lyricEntry, '   ')).toBe(true)
    expect(diaryMatchesQuery(lyricEntry, 'saxophone')).toBe(false)
  })

  it('matches text carried in the consequence line, not only the headline', () => {
    const rosterEntry = buildEntries().find(e => e.kind === 'roster')!
    // "ownership" lives in the roster consequence ("…the sheet decides
    // ownership."), never in its headline ("Ben Cooke joined as …").
    expect(rosterEntry.headline.toLowerCase()).not.toContain('ownership')
    expect(diaryMatchesQuery(rosterEntry, 'ownership')).toBe(true)
  })
})
