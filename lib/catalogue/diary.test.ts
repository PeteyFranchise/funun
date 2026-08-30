import {
  describeDiaryEvent,
  isTriggerSourced,
  DIARY_KIND_ACCENT,
  type DiaryEventContext,
  type DiaryEventRowLike,
} from '@/lib/catalogue/diary'
import type { DiaryEventKind } from '@/types/catalogue'

const NOW = '2026-08-30T12:00:00.000Z'

const EMPTY_CONTEXT: DiaryEventContext = { names: {}, versionNumerals: {} }

function row(kind: string, payload: unknown, actorUserId: string | null = 'u-1'): DiaryEventRowLike {
  return {
    id: 'evt-1',
    work_id: 'work-1',
    kind,
    actor_user_id: actorUserId,
    payload,
    created_at: NOW,
  }
}

describe('lib/catalogue/diary — describeDiaryEvent', () => {
  it('version (hum) distinguishes hum from upload and carries the derived numeral', () => {
    const context: DiaryEventContext = { names: {}, versionNumerals: { 'v-1': 2 } }
    const entry = describeDiaryEvent(row('version', { versionId: 'v-1', source: 'hum' }), context)
    expect(entry.headline).toContain('v2')
    expect(entry.headline.toLowerCase()).toContain('hum')
    expect(entry.consequence).toMatch(/authorship evidence/i)
    expect(entry.date).toBe(NOW)
    expect(entry.accent).toBe(DIARY_KIND_ACCENT.version)
  })

  it('version (upload) reads distinctly from a hum', () => {
    const context: DiaryEventContext = { names: {}, versionNumerals: { 'v-2': 3 } }
    const entry = describeDiaryEvent(row('version', { versionId: 'v-2', source: 'upload' }), context)
    expect(entry.headline).toContain('v3')
    expect(entry.headline.toLowerCase()).toContain('upload')
    expect(entry.headline.toLowerCase()).not.toContain('hum')
  })

  it('lyric_edit is section-level — names the section and the person, never "lyrics changed"', () => {
    const context: DiaryEventContext = { names: { 'u-1': 'Ben Cooke' }, versionNumerals: {} }
    const entry = describeDiaryEvent(
      row('lyric_edit', { blockId: 'b-1', blockType: 'chorus', customLabel: null, operation: 'added' }),
      context
    )
    expect(entry.headline).toContain('Ben Cooke')
    expect(entry.headline).toContain('Chorus')
    expect(entry.headline.toLowerCase()).not.toBe('lyrics changed')
  })

  it('lyric_edit uses the custom label for a custom section', () => {
    const entry = describeDiaryEvent(
      row('lyric_edit', { blockId: 'b-2', blockType: 'custom', customLabel: 'Breakdown', operation: 'edited' }),
      EMPTY_CONTEXT
    )
    expect(entry.headline).toContain('Breakdown')
  })

  it('ai_entry consequence is the stored citation, character-identical, never recomposed', () => {
    const citation = 'AI reference vocal — demo only. Ownership fully preserved; the diary proves it.'
    const entry = describeDiaryEvent(
      row('ai_entry', { entryId: 'ai-1', level: 'version', component: 'vocal', mode: 'performance', citation }),
      EMPTY_CONTEXT
    )
    expect(entry.consequence).toBe(citation)
    expect(entry.accent).toBe(DIARY_KIND_ACCENT.ai_entry)
  })

  it('roster names the person who joined and their tier; consequence states membership is not a split', () => {
    const context: DiaryEventContext = { names: { 'collab-1': 'Dana Rowe' }, versionNumerals: {} }
    const entry = describeDiaryEvent(
      row('roster', { memberId: 'm-1', tier: 'contribute', collaboratorId: 'collab-1' }),
      context
    )
    expect(entry.headline).toContain('Dana Rowe')
    expect(entry.headline).toContain('Contributor')
    expect(entry.consequence).toMatch(/not a split/i)
  })

  it('sheet names the writer and the split, and cites the living-draft consequence', () => {
    const entry = describeDiaryEvent(
      row('sheet', { partyId: 'p-1', sheetId: 'sheet-1', name: 'Ben Cooke', splitPercentage: 40 }),
      EMPTY_CONTEXT
    )
    expect(entry.headline).toContain('Ben Cooke')
    expect(entry.headline).toContain('40')
    expect(entry.consequence).toMatch(/money or release/i)
  })

  it('rename states both the old and the new title', () => {
    const entry = describeDiaryEvent(
      row('rename', { oldTitle: 'Late Drive', newTitle: 'Midnight' }),
      EMPTY_CONTEXT
    )
    expect(entry.headline).toContain('Late Drive')
    expect(entry.headline).toContain('Midnight')
  })

  it('reorder is a single line for the whole drag, not one line per block', () => {
    const entry = describeDiaryEvent(row('reorder', { blockCount: 5 }), { names: { 'u-1': 'Ben' }, versionNumerals: {} })
    expect(entry.headline).toContain('5')
    // A single entry object, not an array/list — the shape itself proves "one line".
    expect(typeof entry.headline).toBe('string')
  })

  it('detach names the section that was detached and states it now carries its own authorship', () => {
    const entry = describeDiaryEvent(
      row('detach', { blockId: 'b-3', blockType: 'chorus', customLabel: null }),
      { names: { 'u-1': 'Ben' }, versionNumerals: {} }
    )
    expect(entry.headline).toContain('Chorus')
    expect(entry.consequence).toMatch(/own authorship/i)
  })

  it('note renders the artist text as the headline with no consequence line', () => {
    const entry = describeDiaryEvent(row('note', { text: 'Bridge idea: modulate up a step' }), EMPTY_CONTEXT)
    expect(entry.headline).toBe('Bridge idea: modulate up a step')
    expect(entry.consequence).toBeNull()
  })

  it('degrades an unknown or future kind to a neutral entry rather than throwing', () => {
    expect(() => describeDiaryEvent(row('some_future_kind', { anything: true }), EMPTY_CONTEXT)).not.toThrow()
    const entry = describeDiaryEvent(row('some_future_kind', { anything: true }), EMPTY_CONTEXT)
    expect(entry.consequence).toBeNull()
    expect(entry.headline.length).toBeGreaterThan(0)
    expect(entry.date).toBe(NOW)
  })

  it('every one of the nine known kinds produces a headline, a date, and a consequence field (possibly null)', () => {
    const fixtures: Array<{ kind: DiaryEventKind; payload: unknown }> = [
      { kind: 'version', payload: { versionId: 'v-1', source: 'hum' } },
      { kind: 'lyric_edit', payload: { blockId: 'b-1', blockType: 'verse', customLabel: null, operation: 'added' } },
      { kind: 'roster', payload: { memberId: 'm-1', tier: 'contribute', collaboratorId: 'c-1' } },
      { kind: 'sheet', payload: { partyId: 'p-1', sheetId: 's-1', name: 'X', splitPercentage: 50 } },
      { kind: 'ai_entry', payload: { entryId: 'a-1', level: 'work', component: 'lyric', mode: 'generate', citation: 'x' } },
      { kind: 'rename', payload: { oldTitle: 'A', newTitle: 'B' } },
      { kind: 'reorder', payload: { blockCount: 3 } },
      { kind: 'detach', payload: { blockId: 'b-2', blockType: 'bridge', customLabel: null } },
      { kind: 'note', payload: { text: 'hi' } },
    ]
    for (const { kind, payload } of fixtures) {
      const entry = describeDiaryEvent(row(kind, payload), EMPTY_CONTEXT)
      expect(entry.headline).toEqual(expect.any(String))
      expect(entry.headline.length).toBeGreaterThan(0)
      expect(entry.date).toBe(NOW)
      expect(entry.consequence === null || typeof entry.consequence === 'string').toBe(true)
    }
  })
})

describe('lib/catalogue/diary — isTriggerSourced (CAT-Q1)', () => {
  const ALL_KINDS: DiaryEventKind[] = [
    'version',
    'lyric_edit',
    'roster',
    'sheet',
    'ai_entry',
    'rename',
    'reorder',
    'detach',
    'note',
  ]

  it('is true for every kind except note', () => {
    for (const kind of ALL_KINDS) {
      expect(isTriggerSourced(kind)).toBe(kind !== 'note')
    }
  })

  it('note is the single app-authored exception', () => {
    expect(isTriggerSourced('note')).toBe(false)
    const triggerSourced = ALL_KINDS.filter(k => isTriggerSourced(k))
    expect(triggerSourced).toHaveLength(8)
  })
})
