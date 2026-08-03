import {
  MOOD_VALUES,
  MOODS_MAX,
  ENERGY_VALUES,
  VOCAL_VALUES,
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
})
