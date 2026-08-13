import {
  MOOD_VALUES,
  MOODS_MAX,
  ENERGY_VALUES,
  VOCAL_VALUES,
  INSTRUMENT_VALUES,
  readDescriptors,
  sanitizeDescriptors,
} from './schema'

describe('sanitizeDescriptors', () => {
  it('unknown/non-array moods never throws and yields an empty moods array', () => {
    expect(() => sanitizeDescriptors({ moods: 'not-an-array', energy: 'low', vocal: 'vocal' })).not.toThrow()
    const result = sanitizeDescriptors({ moods: 'not-an-array', energy: 'low', vocal: 'vocal' })
    expect(result?.moods).toEqual([])
  })

  it('never throws on garbage input types', () => {
    expect(() => sanitizeDescriptors(undefined)).not.toThrow()
    expect(() => sanitizeDescriptors(null)).not.toThrow()
    expect(() => sanitizeDescriptors('a string')).not.toThrow()
    expect(() => sanitizeDescriptors(42)).not.toThrow()
    expect(() => sanitizeDescriptors([])).not.toThrow()
  })

  it('drops a mood term not in the controlled vocabulary — never persists free text', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0], 'totally-made-up-vibe'] })
    expect(result?.moods).toEqual([MOOD_VALUES[0]])
    expect(result?.moods).not.toContain('totally-made-up-vibe')
  })

  it('a supervisor filtering on a controlled term must not miss a near-miss free-text variant', () => {
    // "melancholic" is not the controlled term "melancholy" — must be dropped, not coerced.
    const result = sanitizeDescriptors({ moods: ['melancholic'] })
    expect(result?.moods ?? []).not.toContain('melancholic')
  })

  it('de-duplicates repeated mood terms', () => {
    const term = MOOD_VALUES[0]
    const result = sanitizeDescriptors({ moods: [term, term, term] })
    expect(result?.moods).toEqual([term])
  })

  it('truncates to MOODS_MAX when more terms are supplied', () => {
    const tooMany = MOOD_VALUES.slice(0, MOODS_MAX + 5)
    const result = sanitizeDescriptors({ moods: tooMany })
    expect(result?.moods.length).toBe(MOODS_MAX)
  })

  it('energy not in ENERGY_VALUES becomes null', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]], energy: 'extreme' })
    expect(result?.energy).toBeNull()
  })

  it('a valid energy value is preserved', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]], energy: ENERGY_VALUES[0] })
    expect(result?.energy).toBe(ENERGY_VALUES[0])
  })

  it('vocal not in VOCAL_VALUES becomes null', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]], vocal: 'kazoo' })
    expect(result?.vocal).toBeNull()
  })

  it('a valid vocal value is preserved', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]], vocal: VOCAL_VALUES[0] })
    expect(result?.vocal).toBe(VOCAL_VALUES[0])
  })

  it('fully empty/absent input returns null, not an empty object', () => {
    expect(sanitizeDescriptors(undefined)).toBeNull()
    expect(sanitizeDescriptors(null)).toBeNull()
    expect(sanitizeDescriptors({})).toBeNull()
    expect(sanitizeDescriptors({ moods: [] })).toBeNull()
  })

  it('does not infer vocal from anything — only an explicit, valid vocal value survives', () => {
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]] })
    expect(result?.vocal ?? null).toBeNull()
  })
})

describe('readDescriptors', () => {
  it('metadata without a descriptors key returns null', () => {
    expect(readDescriptors(null)).toBeNull()
    expect(readDescriptors(undefined)).toBeNull()
    expect(readDescriptors({})).toBeNull()
    expect(readDescriptors({ composers: [] })).toBeNull()
  })

  it('filters out terms retired from the vocabulary on read, preserving the remaining valid terms', () => {
    const term = MOOD_VALUES[0]
    const result = readDescriptors({
      descriptors: { moods: [term, 'retired-old-term'], energy: 'low', vocal: 'vocal' },
    })
    expect(result?.moods).toEqual([term])
    expect(result?.energy).toBe('low')
    expect(result?.vocal).toBe('vocal')
  })

  it('round-trips a well-formed descriptors object unchanged', () => {
    const term = MOOD_VALUES[1]
    const raw = { moods: [term], energy: 'high', vocal: 'instrumental', updated_at: '2026-01-01T00:00:00.000Z' }
    const result = readDescriptors({ descriptors: raw })
    expect(result).toEqual({
      moods: [term],
      energy: 'high',
      vocal: 'instrumental',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
  })

  it('a blob with a valid instruments array returns those instruments, off-vocab dropped, capped', () => {
    const valid = INSTRUMENT_VALUES[0]
    const tooMany = INSTRUMENT_VALUES.slice(0, MOODS_MAX + 5)
    const result = readDescriptors({
      descriptors: { moods: [MOOD_VALUES[0]], instruments: [valid, 'kazoo-solo', ...tooMany] },
    })
    expect(result?.instruments).toBeDefined()
    expect(result?.instruments).not.toContain('kazoo-solo')
    expect(result?.instruments?.every(i => (INSTRUMENT_VALUES as string[]).includes(i))).toBe(true)
    expect(result?.instruments?.length).toBeLessThanOrEqual(MOODS_MAX)
  })

  it('a blob with no instruments returns an empty/absent instruments field without breaking existing reads', () => {
    const term = MOOD_VALUES[0]
    const result = readDescriptors({ descriptors: { moods: [term], energy: 'low', vocal: 'vocal' } })
    expect(result?.instruments ?? []).toEqual([])
    expect(result?.moods).toEqual([term])
    expect(result?.energy).toBe('low')
    expect(result?.vocal).toBe('vocal')
  })

  it('a blob carrying ai_suggested returns the ai_suggested sub-object vocab-coerced, confirmed values unchanged', () => {
    const confirmedMood = MOOD_VALUES[0]
    const suggestedMood = MOOD_VALUES[1]
    const result = readDescriptors({
      descriptors: {
        moods: [confirmedMood],
        energy: 'low',
        vocal: 'vocal',
        ai_suggested: {
          moods: [suggestedMood, 'not-a-real-mood'],
          energy: 'high',
          vocal: 'instrumental',
          instruments: [INSTRUMENT_VALUES[0], 'fake-instrument'],
          suggested_at: '2026-08-13T00:00:00.000Z',
          model: 'claude-sonnet-4-20250514',
        },
      },
    })
    expect(result?.moods).toEqual([confirmedMood])
    expect(result?.energy).toBe('low')
    expect(result?.vocal).toBe('vocal')
    expect(result?.ai_suggested).toEqual({
      moods: [suggestedMood],
      energy: 'high',
      vocal: 'instrumental',
      instruments: [INSTRUMENT_VALUES[0]],
      suggested_at: '2026-08-13T00:00:00.000Z',
      model: 'claude-sonnet-4-20250514',
    })
  })

  it('a blob carrying a pending sub-object returns it vocab-coerced WITHOUT altering confirmed moods/energy/vocal', () => {
    const confirmedMood = MOOD_VALUES[0]
    const proposedMood = MOOD_VALUES[2]
    const result = readDescriptors({
      descriptors: {
        moods: [confirmedMood],
        energy: 'medium',
        vocal: 'vocal',
        pending: {
          moods: [proposedMood, 'nonsense'],
          energy: 'low',
          vocal: 'instrumental',
          instruments: [],
          proposed_by: 'ae-user-1',
          proposed_at: '2026-08-13T01:00:00.000Z',
        },
      },
    })
    expect(result?.moods).toEqual([confirmedMood])
    expect(result?.energy).toBe('medium')
    expect(result?.vocal).toBe('vocal')
    expect(result?.pending).toEqual({
      moods: [proposedMood],
      energy: 'low',
      vocal: 'instrumental',
      instruments: [],
      proposed_by: 'ae-user-1',
      proposed_at: '2026-08-13T01:00:00.000Z',
    })
  })
})

describe('sanitizeDescriptors — descriptor v2 additive behavior', () => {
  it('never emits ai_suggested or pending from artist input, even if present in the raw input', () => {
    const result = sanitizeDescriptors({
      moods: [MOOD_VALUES[0]],
      ai_suggested: { moods: [MOOD_VALUES[1]], energy: 'high', vocal: 'vocal', instruments: [], suggested_at: 'x', model: 'x' },
      pending: { moods: [MOOD_VALUES[2]], energy: 'low', vocal: 'instrumental', instruments: [], proposed_by: 'x', proposed_at: 'x' },
    })
    expect(result).not.toHaveProperty('ai_suggested')
    expect(result).not.toHaveProperty('pending')
  })

  it('still returns null for a fully-untagged input, even with an empty instruments array', () => {
    expect(sanitizeDescriptors({ instruments: [] })).toBeNull()
  })

  it('accepts and normalizes a valid instruments array, dropping off-vocab values', () => {
    const valid = INSTRUMENT_VALUES[0]
    const result = sanitizeDescriptors({ moods: [MOOD_VALUES[0]], instruments: [valid, 'not-real'] })
    expect(result?.instruments).toEqual([valid])
  })
})
