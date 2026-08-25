import {
  validateAssignment,
  buildPublishTransition,
  buildCompletionUpsert,
  type Play,
  type PublishPlayInput,
} from './plays'

// ─── plays.ts — one-active invariant + two-kind assignment + idempotent
// completion (D-31.2-08/09/10/11). Pure-helper tests only — the I/O
// functions (publishPlay/loadActivePlay/markAssignmentComplete/
// loadCompletions) are exercised end-to-end via the route test in Task 3.

describe('validateAssignment — two-kind discriminant (D-31.2-09/10)', () => {
  it('accepts a client_targeted assignment with healthBand set and no directive content', () => {
    expect(
      validateAssignment({ kind: 'client_targeted', title: 'Chase at-risk accounts', healthBand: 'at_risk' })
    ).toEqual({ valid: true })
  })

  it('accepts a client_targeted assignment with only pipelineStageKey set', () => {
    expect(
      validateAssignment({ kind: 'client_targeted', title: 'Push negotiating deals', pipelineStageKey: 'negotiating' })
    ).toEqual({ valid: true })
  })

  it('rejects a client_targeted assignment with neither healthBand nor pipelineStageKey', () => {
    const result = validateAssignment({ kind: 'client_targeted', title: 'No target' })
    expect(result.valid).toBe(false)
  })

  it('rejects a client_targeted assignment that carries directive content (link/attachment/content) — posting-deferred, D-31.2-10', () => {
    const result = validateAssignment({
      kind: 'client_targeted',
      title: 'At risk',
      healthBand: 'at_risk',
      linkUrl: 'https://example.com',
    })
    expect(result.valid).toBe(false)
  })

  it('accepts a general_task with just a title', () => {
    expect(validateAssignment({ kind: 'general_task', title: 'Post this on social today' })).toEqual({ valid: true })
  })

  it('accepts a general_task carrying note/link/attachment/content', () => {
    expect(
      validateAssignment({
        kind: 'general_task',
        title: 'Post this on social today',
        note: 'Use the new artist spotlight copy',
        linkUrl: 'https://example.com/asset',
        attachmentUrl: 'https://storage.example.com/file.png',
        content: { caption: 'New drop out now' },
      })
    ).toEqual({ valid: true })
  })

  it('rejects a general_task with no title', () => {
    const result = validateAssignment({ kind: 'general_task', title: '' })
    expect(result.valid).toBe(false)
  })

  it('rejects a general_task that carries healthBand/pipelineStageKey (that targeting belongs to client_targeted only)', () => {
    const result = validateAssignment({ kind: 'general_task', title: 'Post this', healthBand: 'at_risk' })
    expect(result.valid).toBe(false)
  })

  it('rejects a malformed/unknown kind', () => {
    const result = validateAssignment({ kind: 'not_a_real_kind', title: 'Whatever' })
    expect(result.valid).toBe(false)
  })
})

describe('buildPublishTransition — one-active invariant (D-31.2-08)', () => {
  const newPlay: PublishPlayInput = {
    title: "This week's push",
    assignments: [{ kind: 'general_task', title: 'Post this' }],
  }

  it('when a play is currently active, the transition retires exactly that play and activates the new one', () => {
    const currentActive: Play = {
      id: 'play-1',
      title: 'Old play',
      note: null,
      status: 'active',
      publishedBy: 'user-1',
      publishedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const transition = buildPublishTransition(currentActive, newPlay)
    expect(transition.retireId).toBe('play-1')
    expect(transition.activate).toEqual(newPlay)
  })

  it('when no play is currently active, the transition retires nothing and activates the new one', () => {
    const transition = buildPublishTransition(null, newPlay)
    expect(transition.retireId).toBeNull()
    expect(transition.activate).toEqual(newPlay)
  })

  it('applying the transition against an in-memory play set always yields exactly one active row', () => {
    const currentActive: Play = {
      id: 'play-1',
      title: 'Old play',
      note: null,
      status: 'active',
      publishedBy: 'user-1',
      publishedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const transition = buildPublishTransition(currentActive, newPlay)

    // Simulate applying the transition: retire the target id, then insert
    // the newly-activated play — proving the resulting set has exactly one
    // active row regardless of the starting state.
    const priorPlays: Play[] = [currentActive]
    const afterRetire = priorPlays.map(p => (p.id === transition.retireId ? { ...p, status: 'retired' as const } : p))
    const newRow: Play = {
      id: 'play-2',
      title: transition.activate.title,
      note: transition.activate.note ?? null,
      status: 'active',
      publishedBy: 'user-1',
      publishedAt: '2026-08-24T00:00:00.000Z',
      createdAt: '2026-08-24T00:00:00.000Z',
    }
    const after = [...afterRetire, newRow]
    expect(after.filter(p => p.status === 'active')).toHaveLength(1)
  })
})

describe('buildCompletionUpsert — idempotent per (assignment, AE) shape (D-31.2-11)', () => {
  it('targets the UNIQUE(assignment_id, ae_user_id) conflict key with ignoreDuplicates', () => {
    const upsert = buildCompletionUpsert('assignment-1', 'ae-1')
    expect(upsert.onConflict).toBe('assignment_id,ae_user_id')
    expect(upsert.ignoreDuplicates).toBe(true)
    expect(upsert.values).toEqual({ assignment_id: 'assignment-1', ae_user_id: 'ae-1', note: null })
  })

  it('is idempotent — calling it twice with the same inputs yields identical upsert payloads', () => {
    const first = buildCompletionUpsert('assignment-1', 'ae-1', 'done it')
    const second = buildCompletionUpsert('assignment-1', 'ae-1', 'done it')
    expect(first).toEqual(second)
  })

  it('carries an optional note through to the values, defaulting to null', () => {
    const upsert = buildCompletionUpsert('assignment-1', 'ae-1', 'posted already')
    expect(upsert.values.note).toBe('posted already')
  })
})
