import { MOOD_VALUES, INSTRUMENT_VALUES } from '@/lib/metadata/schema'
import { ALL_GENRE_SLUGS } from '@/lib/genres'
import { coerceSuggestion, suggestTrackTags } from './ai-tag'

describe('coerceSuggestion', () => {
  it('drops off-vocab moods and instruments, keeping only controlled-vocab members', () => {
    const result = coerceSuggestion({
      moods: [MOOD_VALUES[0], 'totally-made-up-vibe'],
      energy: 'medium',
      vocal: 'vocal',
      instruments: [INSTRUMENT_VALUES[0], 'kazoo-solo'],
      genres: [ALL_GENRE_SLUGS[0], 'not-a-real-genre'],
    })
    expect(result.moods).toEqual([MOOD_VALUES[0]])
    expect(result.moods).not.toContain('totally-made-up-vibe')
    expect(result.instruments).toEqual([INSTRUMENT_VALUES[0]])
    expect(result.instruments).not.toContain('kazoo-solo')
    expect(result.genres).toEqual([ALL_GENRE_SLUGS[0]])
    expect(result.genres).not.toContain('not-a-real-genre')
  })

  it('dedupes repeated values', () => {
    const term = MOOD_VALUES[0]
    const result = coerceSuggestion({ moods: [term, term, term] })
    expect(result.moods).toEqual([term])
  })

  it('caps mood/instrument/genre counts', () => {
    const tooManyMoods = MOOD_VALUES.slice(0, 20)
    const tooManyInstruments = INSTRUMENT_VALUES.slice(0, 20)
    const tooManyGenres = ALL_GENRE_SLUGS.slice(0, 20)
    const result = coerceSuggestion({
      moods: tooManyMoods,
      instruments: tooManyInstruments,
      genres: tooManyGenres,
    })
    expect(result.moods.length).toBeLessThan(tooManyMoods.length)
    expect(result.instruments.length).toBeLessThan(tooManyInstruments.length)
    expect(result.genres.length).toBeLessThan(tooManyGenres.length)
  })

  it('produces only vocab members for every field — no off-vocab value can appear', () => {
    const result = coerceSuggestion({
      moods: MOOD_VALUES,
      instruments: INSTRUMENT_VALUES,
      genres: ALL_GENRE_SLUGS,
      energy: 'not-a-real-energy',
      vocal: 'not-a-real-vocal',
    })
    expect(result.moods.every(m => (MOOD_VALUES as string[]).includes(m))).toBe(true)
    expect(result.instruments.every(i => (INSTRUMENT_VALUES as string[]).includes(i))).toBe(true)
    expect(result.genres.every(g => ALL_GENRE_SLUGS.includes(g))).toBe(true)
    expect(result.energy).toBeNull()
    expect(result.vocal).toBeNull()
  })

  it('stamps suggested_at and model, and never throws on null/garbage input', () => {
    expect(() => coerceSuggestion(null)).not.toThrow()
    const result = coerceSuggestion(null)
    expect(result.moods).toEqual([])
    expect(result.instruments).toEqual([])
    expect(result.genres).toEqual([])
    expect(result.energy).toBeNull()
    expect(result.vocal).toBeNull()
    expect(typeof result.suggested_at).toBe('string')
    expect(result.suggested_at.length).toBeGreaterThan(0)
    expect(typeof result.model).toBe('string')
    expect(result.model.length).toBeGreaterThan(0)
  })
})

describe('suggestTrackTags', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('returns { ok: false } gracefully when ANTHROPIC_API_KEY is absent — never throws', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await suggestTrackTags({ title: 'Golden Hour' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.error).toBe('string')
  })

  it('returns { ok: false } when the title is empty, without requiring a key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await suggestTrackTags({ title: '   ' })
    expect(result.ok).toBe(false)
  })
})
