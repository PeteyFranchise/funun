import {
  formatLyricLiftTimestamp,
  normalizeStructuredLyricSections,
} from '@/lib/catalogue/lyric-lift'

const timed = [
  { startMs: 0, endMs: 9000, text: 'first line second line', confidence: 0.82 },
  { startMs: 10000, endMs: 19000, text: 'bring it home', confidence: 0.45 },
]

describe('normalizeStructuredLyricSections', () => {
  it('accepts a faithful section draft and combines model and alignment review signals', () => {
    const result = normalizeStructuredLyricSections({
      transcript: 'First line second line bring it home',
      timedSegments: timed,
      durationMs: 20000,
      value: {
        sections: [
          { block_type: 'verse', custom_label: null, text: 'First line\nSecond line', start_ms: 0, end_ms: 9000, confidence: 0.9, needs_review: false, repeat_of_index: null },
          { block_type: 'chorus', custom_label: null, text: 'Bring it home', start_ms: 10000, end_ms: 19000, confidence: 0.8, needs_review: false, repeat_of_index: null },
        ],
      },
    })
    expect(result.usedFallback).toBe(false)
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0]?.confidence).toBeCloseTo(0.82)
    expect(result.sections[1]?.needsReview).toBe(true)
  })

  it('falls back to the exact provider transcript when structure output invents words', () => {
    const result = normalizeStructuredLyricSections({
      transcript: 'First line second line bring it home',
      timedSegments: timed,
      durationMs: 20000,
      value: {
        sections: [{ block_type: 'verse', custom_label: null, text: 'Entirely invented polished masterpiece', start_ms: 0, end_ms: 19000, confidence: 1, needs_review: false, repeat_of_index: null }],
      },
    })
    expect(result.usedFallback).toBe(true)
    expect(result.sections).toEqual([expect.objectContaining({
      blockType: 'custom',
      customLabel: 'Full transcription',
      text: 'First line second line bring it home',
    })])
  })

  it('keeps exact repeats linked and detaches a mismatched repeat suggestion', () => {
    const exact = normalizeStructuredLyricSections({
      transcript: 'Bring it home bring it home',
      timedSegments: timed,
      durationMs: 20000,
      value: { sections: [
        { block_type: 'chorus', custom_label: null, text: 'Bring it home', start_ms: 0, end_ms: 9000, confidence: 0.8, needs_review: false, repeat_of_index: null },
        { block_type: 'chorus', custom_label: null, text: 'Bring it home', start_ms: 10000, end_ms: 19000, confidence: 0.8, needs_review: false, repeat_of_index: 0 },
      ] },
    })
    expect(exact.sections[1]?.repeatOfIndex).toBe(0)

    const mismatch = normalizeStructuredLyricSections({
      transcript: 'Bring it home bring us home',
      timedSegments: timed,
      durationMs: 20000,
      value: { sections: [
        { block_type: 'chorus', custom_label: null, text: 'Bring it home', start_ms: 0, end_ms: 9000, confidence: 0.8, needs_review: false, repeat_of_index: null },
        { block_type: 'chorus', custom_label: null, text: 'Bring us home', start_ms: 10000, end_ms: 19000, confidence: 0.8, needs_review: false, repeat_of_index: 0 },
      ] },
    })
    expect(mismatch.sections[1]?.repeatOfIndex).toBeNull()
  })
})

describe('formatLyricLiftTimestamp', () => {
  it('formats millisecond positions as track time', () => {
    expect(formatLyricLiftTimestamp(105400)).toBe('1:45')
  })
})
