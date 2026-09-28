import { readSampleClearOutput, type SampleClearView } from '@/lib/tools/sampleclear'

// ─────────────────────────────────────────────────────────────────────────
// readSampleClearOutput unit suite.
//
// The route persists this payload as an untyped Record<string, unknown>
// because it is parsed out of model text — the declared SampleClearOutput
// type is an aspiration, not a guarantee. This suite is the only place that
// can actually observe the reader's behavior: ToolSidePanel.tsx is a client
// component and this repo has no jsdom, so a component test would verify
// nothing (see reference_jest_harness_constraints).
// ─────────────────────────────────────────────────────────────────────────

function fullValidPayload(overrides: Record<string, unknown> = {}) {
  return {
    assessment: 'This sample requires clearance from two separate rights holders.',
    master_rights: { likely_holder: 'Some Records LLC', how_to_contact: 'licensing@somerecords.example' },
    publishing_rights: { likely_holder: 'Some Publishing Co', how_to_contact: 'clearance@somepub.example' },
    master_request_letter: 'Dear Some Records,\n\nWe would like to request clearance...',
    publishing_request_letter: 'Dear Some Publishing,\n\nWe would like to request clearance...',
    alternatives: ['Re-record the sample', 'Use a royalty-free library', 'Remove the sample'],
    risk_level: 'medium',
    ...overrides,
  }
}

describe('readSampleClearOutput — full valid payload', () => {
  const result = readSampleClearOutput(fullValidPayload())

  it('returns a non-null result', () => {
    expect(result).not.toBeNull()
  })

  it('carries the assessment, trimmed', () => {
    expect(result?.assessment).toBe('This sample requires clearance from two separate rights holders.')
  })

  it('carries both rights blocks', () => {
    expect(result?.master).toEqual({ holder: 'Some Records LLC', contact: 'licensing@somerecords.example' })
    expect(result?.publishing).toEqual({ holder: 'Some Publishing Co', contact: 'clearance@somepub.example' })
  })

  it('carries both letters', () => {
    expect(result?.masterLetter).toBe('Dear Some Records,\n\nWe would like to request clearance...')
    expect(result?.publishingLetter).toBe('Dear Some Publishing,\n\nWe would like to request clearance...')
  })

  it('carries the alternatives, trimmed, in order', () => {
    expect(result?.alternatives).toEqual([
      'Re-record the sample',
      'Use a royalty-free library',
      'Remove the sample',
    ])
  })

  it('the risk level survives', () => {
    expect(result?.riskLevel).toBe('medium')
  })
})

describe('readSampleClearOutput — non-vacuity: field coverage against a mistyped key', () => {
  // Seven distinct sentinel strings, one per free-text string field. If the
  // reader mistypes a key name (e.g. `likely_holder` vs `likelyHolder`),
  // exactly one sentinel silently disappears while every other test in this
  // file keeps passing — this is the test that would catch it.
  const payload = {
    assessment: 'SENTINEL_ASSESSMENT',
    master_rights: { likely_holder: 'SENTINEL_MASTER_HOLDER', how_to_contact: 'SENTINEL_MASTER_CONTACT' },
    publishing_rights: { likely_holder: 'SENTINEL_PUB_HOLDER', how_to_contact: 'SENTINEL_PUB_CONTACT' },
    master_request_letter: 'SENTINEL_MASTER_LETTER',
    publishing_request_letter: 'SENTINEL_PUB_LETTER',
  }
  const result = readSampleClearOutput(payload)

  it('carries the assessment sentinel', () => {
    expect(result?.assessment).toBe('SENTINEL_ASSESSMENT')
  })

  it('carries the master holder sentinel', () => {
    expect(result?.master.holder).toBe('SENTINEL_MASTER_HOLDER')
  })

  it('carries the master contact sentinel', () => {
    expect(result?.master.contact).toBe('SENTINEL_MASTER_CONTACT')
  })

  it('carries the publishing holder sentinel', () => {
    expect(result?.publishing.holder).toBe('SENTINEL_PUB_HOLDER')
  })

  it('carries the publishing contact sentinel', () => {
    expect(result?.publishing.contact).toBe('SENTINEL_PUB_CONTACT')
  })

  it('carries the master letter sentinel', () => {
    expect(result?.masterLetter).toBe('SENTINEL_MASTER_LETTER')
  })

  it('carries the publishing letter sentinel', () => {
    expect(result?.publishingLetter).toBe('SENTINEL_PUB_LETTER')
  })
})

describe('readSampleClearOutput — unrecognisable payloads return null', () => {
  it('an empty object returns null', () => {
    expect(readSampleClearOutput({})).toBeNull()
  })

  it('null returns null', () => {
    expect(readSampleClearOutput(null)).toBeNull()
  })

  it('undefined returns null', () => {
    expect(readSampleClearOutput(undefined)).toBeNull()
  })

  it('a string returns null', () => {
    expect(readSampleClearOutput('not an object')).toBeNull()
  })

  it('a number returns null', () => {
    expect(readSampleClearOutput(42)).toBeNull()
  })

  it('an array returns null', () => {
    expect(readSampleClearOutput(['not', 'an', 'object'])).toBeNull()
  })
})

describe('readSampleClearOutput — all-wrong types produce null (nothing usable survives)', () => {
  const payload = {
    assessment: 12345,
    master_rights: 'not an object',
    publishing_rights: 'not an object',
    master_request_letter: 12345,
    publishing_request_letter: 12345,
    alternatives: 'not an array',
    risk_level: 12345,
  }
  const result = readSampleClearOutput(payload)

  it('returns null when every field is the wrong type', () => {
    expect(result).toBeNull()
  })
})

describe('readSampleClearOutput — whitespace-only strings are absent, not present', () => {
  it('an assessment of only spaces returns null (nothing else usable)', () => {
    expect(readSampleClearOutput({ assessment: '   ' })).toBeNull()
  })
})

describe('readSampleClearOutput — partial payload proves the fallback is not swallowing usable output', () => {
  const result = readSampleClearOutput({ master_request_letter: 'Only this letter exists.' })

  it('returns a non-null result', () => {
    expect(result).not.toBeNull()
  })

  it('the present letter survives', () => {
    expect(result?.masterLetter).toBe('Only this letter exists.')
  })

  it('every other field is null or empty', () => {
    expect(result?.assessment).toBeNull()
    expect(result?.master).toEqual({ holder: null, contact: null })
    expect(result?.publishing).toEqual({ holder: null, contact: null })
    expect(result?.publishingLetter).toBeNull()
    expect(result?.alternatives).toEqual([])
    expect(result?.riskLevel).toBeNull()
  })
})

describe('readSampleClearOutput — half-filled rights objects', () => {
  it('a holder with no contact: holder present, contact null', () => {
    const result = readSampleClearOutput({ master_rights: { likely_holder: 'Some Records LLC' } })
    expect(result?.master).toEqual({ holder: 'Some Records LLC', contact: null })
  })

  it('a rights value of null: both slots null, no throw', () => {
    expect(() => readSampleClearOutput({ master_rights: null, assessment: 'present' })).not.toThrow()
    const result = readSampleClearOutput({ master_rights: null, assessment: 'present' })
    expect(result?.master).toEqual({ holder: null, contact: null })
  })
})

describe('readSampleClearOutput — alternatives hygiene', () => {
  it('a mixed array keeps only real strings, trimmed, in order', () => {
    const result = readSampleClearOutput({
      alternatives: ['  Re-record it  ', '', '   ', 42, null, 'Use a library'],
    })
    expect(result?.alternatives).toEqual(['Re-record it', 'Use a library'])
  })

  it('a non-array alternatives value yields an empty array, not null', () => {
    const result = readSampleClearOutput({ assessment: 'present', alternatives: 'not an array' })
    expect(result?.alternatives).toEqual([])
  })
})

describe('readSampleClearOutput — risk level normalisation', () => {
  it('an upper-case value with surrounding whitespace maps to its lower-case member', () => {
    const result = readSampleClearOutput({ risk_level: '  HIGH  ' })
    expect(result?.riskLevel).toBe('high')
  })

  it('a value outside the three members maps to null, not passed through', () => {
    const result = readSampleClearOutput({ assessment: 'present', risk_level: 'extreme' })
    expect(result?.riskLevel).toBeNull()
  })

  it('a null risk level does not become a default — the view omits the chip', () => {
    const result = readSampleClearOutput({ assessment: 'present', risk_level: null })
    expect(result?.riskLevel).toBeNull()
  })
})

describe('readSampleClearOutput — the two null-contract directions', () => {
  it('a payload with nothing usable anywhere returns null', () => {
    expect(
      readSampleClearOutput({
        assessment: '',
        master_rights: {},
        publishing_rights: {},
        master_request_letter: '',
        publishing_request_letter: '',
        alternatives: [],
        risk_level: 'unknown',
      })
    ).toBeNull()
  })

  it('a payload with a single usable field does not return null', () => {
    const result = readSampleClearOutput({ risk_level: 'low' })
    expect(result).not.toBeNull()
    expect(result?.riskLevel).toBe('low')
  })
})

// Type-level sanity: SampleClearView is importable and shaped as expected.
describe('SampleClearView type', () => {
  it('a full result matches the expected shape', () => {
    const result = readSampleClearOutput(fullValidPayload()) as SampleClearView
    const shapeCheck: SampleClearView = result
    expect(shapeCheck).toBeTruthy()
  })
})
