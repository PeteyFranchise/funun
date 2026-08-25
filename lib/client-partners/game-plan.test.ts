import {
  SEEDED_GAME_PLAN_TOPICS,
  buildDefaultGamePlanTopics,
  buildGamePlanLogBody,
  buildPickerTopics,
  coveredSummary,
  normalizeGamePlanTopics,
  type GamePlanTopic,
} from './game-plan'

// ─── lib/client-partners/game-plan (31.1 plan 07, Task 1, R14/D-31.1-06) ────
// Pure-function coverage for the Game Plan's shared "X of N covered" text,
// the seeded default topic set, and the input-normalization used by the
// route before persisting/logging.

function topic(overrides: Partial<GamePlanTopic> = {}): GamePlanTopic {
  return {
    id: 't1',
    title: 'A topic',
    source: null,
    questions: [],
    done: false,
    note: '',
    ...overrides,
  }
}

describe('coveredSummary', () => {
  it('reports 0 of N covered when nothing is checked — never a silent blank (SPEC R14 boundary edge)', () => {
    const topics = [topic({ id: 't1' }), topic({ id: 't2' }), topic({ id: 't3' }), topic({ id: 't4' }), topic({ id: 't5' })]
    const summary = coveredSummary(topics)
    expect(summary).toEqual({ covered: 0, total: 5, text: '0 of 5 covered' })
  })

  it('counts only done:true topics', () => {
    const topics = [
      topic({ id: 't1', done: true }),
      topic({ id: 't2', done: true }),
      topic({ id: 't3', done: false }),
    ]
    expect(coveredSummary(topics)).toEqual({ covered: 2, total: 3, text: '2 of 3 covered' })
  })

  it('reports all covered', () => {
    const topics = [topic({ done: true }), topic({ id: 't2', done: true })]
    expect(coveredSummary(topics).text).toBe('2 of 2 covered')
  })

  it('handles an empty topic list without throwing', () => {
    expect(coveredSummary([])).toEqual({ covered: 0, total: 0, text: '0 of 0 covered' })
  })
})

describe('buildDefaultGamePlanTopics', () => {
  it('returns one topic per seeded default, all unchecked, sourced "seeded"', () => {
    const topics = buildDefaultGamePlanTopics()
    expect(topics).toHaveLength(SEEDED_GAME_PLAN_TOPICS.length)
    expect(topics.every(t => t.done === false)).toBe(true)
    expect(topics.every(t => t.source === 'seeded')).toBe(true)
    expect(topics.every(t => t.note === '')).toBe(true)
    expect(topics[0].title).toBe(SEEDED_GAME_PLAN_TOPICS[0].title)
    expect(topics[0].questions).toEqual(SEEDED_GAME_PLAN_TOPICS[0].questions)
  })

  it('returns fresh array/question copies each call (no shared mutable state)', () => {
    const a = buildDefaultGamePlanTopics()
    const b = buildDefaultGamePlanTopics()
    a[0].done = true
    a[0].questions.push('mutated')
    expect(b[0].done).toBe(false)
    expect(b[0].questions).not.toContain('mutated')
  })
})

describe('buildGamePlanLogBody', () => {
  it('is exactly the covered summary when no topic carries a note', () => {
    const topics = [topic({ id: 't1', done: true }), topic({ id: 't2', done: false })]
    expect(buildGamePlanLogBody(topics)).toBe('1 of 2 covered')
  })

  it('appends one line per noted topic, in order', () => {
    const topics = [
      topic({ id: 't1', title: 'Confirm the brief', done: true, note: 'Timeline slipped a week.' }),
      topic({ id: 't2', title: 'Budget & scope', done: false, note: '  Still pending finance sign-off.  ' }),
      topic({ id: 't3', title: 'No note here', done: true, note: '' }),
    ]
    const body = buildGamePlanLogBody(topics)
    expect(body).toBe(
      '2 of 3 covered\nConfirm the brief — Timeline slipped a week.\nBudget & scope — Still pending finance sign-off.'
    )
  })

  it('records "0 of N covered" (never a blank) even when 0 are covered', () => {
    const topics = [topic({ id: 't1' }), topic({ id: 't2' }), topic({ id: 't3' })]
    expect(buildGamePlanLogBody(topics)).toBe('0 of 3 covered')
  })

  it('handles a fully empty topic list', () => {
    expect(buildGamePlanLogBody([])).toBe('0 of 0 covered')
  })
})

describe('buildPickerTopics', () => {
  // ─── 31.2-08 Task 2 (D-31.2-07, Pitfall 4) ────────────────────────────
  // Authored Playbook Topics AUGMENT the seeded starters at read time —
  // neither list replaces the other. An empty authored list must reproduce
  // 31.1's exact seeded-only behavior (RED-first: this must pass before
  // any implementation exists to prove the empty-authored case is truly a
  // no-op relative to the untouched SEEDED_GAME_PLAN_TOPICS constant).

  it('returns seeded-only topics when authored is empty (31.1 behavior preserved)', () => {
    const picker = buildPickerTopics(SEEDED_GAME_PLAN_TOPICS, [])
    expect(picker).toHaveLength(SEEDED_GAME_PLAN_TOPICS.length)
    expect(picker.every(t => t.source === 'seeded')).toBe(true)
    expect(picker.map(t => t.id)).toEqual(SEEDED_GAME_PLAN_TOPICS.map(t => t.id))
  })

  it('concatenates authored topics after the seeded starters — seeded never dropped', () => {
    const authored = [
      { id: 'entry-1', title: 'Renewal cadence', questions: ['How often do they re-up?'] },
      { id: 'entry-2', title: 'Escalation path', questions: [] },
    ]
    const picker = buildPickerTopics(SEEDED_GAME_PLAN_TOPICS, authored)
    expect(picker).toHaveLength(SEEDED_GAME_PLAN_TOPICS.length + authored.length)
    expect(picker.slice(0, SEEDED_GAME_PLAN_TOPICS.length).every(t => t.source === 'seeded')).toBe(true)
    const authoredEntries = picker.slice(SEEDED_GAME_PLAN_TOPICS.length)
    expect(authoredEntries.map(t => t.source)).toEqual(['playbook:entry-1', 'playbook:entry-2'])
    expect(authoredEntries.map(t => t.title)).toEqual(['Renewal cadence', 'Escalation path'])
    expect(authoredEntries[0].questions).toEqual(['How often do they re-up?'])
  })

  it('never mutates the SEEDED_GAME_PLAN_TOPICS constant it reads from', () => {
    const before = JSON.parse(JSON.stringify(SEEDED_GAME_PLAN_TOPICS))
    buildPickerTopics(SEEDED_GAME_PLAN_TOPICS, [{ id: 'x', title: 'X', questions: ['q'] }])
    expect(SEEDED_GAME_PLAN_TOPICS).toEqual(before)
  })
})

describe('normalizeGamePlanTopics', () => {
  it('defaults a missing source to null and a missing note to empty string', () => {
    const normalized = normalizeGamePlanTopics([
      { id: 't1', title: 'Custom topic', questions: ['A question?'], done: false },
    ])
    expect(normalized).toEqual([
      { id: 't1', title: 'Custom topic', source: null, questions: ['A question?'], done: false, note: '' },
    ])
  })

  it('preserves an explicit source and note', () => {
    const normalized = normalizeGamePlanTopics([
      {
        id: 't1',
        title: 'Selects context',
        source: 'selects:Holiday social',
        questions: [],
        done: true,
        note: 'Loved it.',
      },
    ])
    expect(normalized[0].source).toBe('selects:Holiday social')
    expect(normalized[0].note).toBe('Loved it.')
  })
})
