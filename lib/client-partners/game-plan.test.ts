import {
  SEEDED_GAME_PLAN_TOPICS,
  buildDefaultGamePlanTopics,
  buildGamePlanLogBody,
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
