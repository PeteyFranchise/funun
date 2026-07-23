// ─── lib/split-sheets/agreement.ts tests ──────────────────────────────
// Covers the verbatim operative clauses, the verbatim guidance notes, the
// production-only counsel gate (P17-09a), and the small display helpers
// the renderer uses for the em-dash / legal-name-with-p/k/a conventions.

import {
  AGREEMENT_CLAUSES,
  GUIDANCE_NOTES,
  PRE_SIGNATURE_REVIEW_PROMPT,
  COUNSEL_REVIEW_STATUS,
  assertCounselReviewedForProduction,
  partiesMissingLegalName,
  displayValue,
  displayLegalName,
  composeLegalNameFromProfile,
} from './agreement'

describe('AGREEMENT_CLAUSES', () => {
  it('reproduces both operative sentences verbatim, in source order', () => {
    expect(AGREEMENT_CLAUSES).toHaveLength(2)
    expect(AGREEMENT_CLAUSES[0]).toBe(
      'This Songwriter/Publishing split agreement may not be modified or amended except by writing and signed by all Co-writers named above.'
    )
    expect(AGREEMENT_CLAUSES[1]).toBe(
      'If the foregoing accurately represents the agreement between the Co-writers as to their respective ownership interests and shares of songwriting royalties payable in connection with the above-noted composition, please acknowledge your understanding and agreement by executing this contract in the appropriate space below.'
    )
  })
})

describe('GUIDANCE_NOTES', () => {
  it('reproduces the three approved notes verbatim, in order', () => {
    expect(GUIDANCE_NOTES).toHaveLength(3)
    expect(GUIDANCE_NOTES[0]).toBe(
      'Use your full legal name exactly as registered with your PRO. If you do not yet have a PRO, complete the field as "None yet" and update it later once affiliated.'
    )
    expect(GUIDANCE_NOTES[1]).toBe(
      'Where a detail is not yet known, it is shown as —. Enter the release title if known; if not final, use the current working project title. If self-releasing, the label may be entered as "Independent".'
    )
    expect(GUIDANCE_NOTES[2]).toBe(
      'This split sheet confirms songwriting and publishing shares only. Master ownership and master revenue splits, if any, are not determined by this split sheet unless expressly stated in a separate written agreement.'
    )
  })
})

describe('PRE_SIGNATURE_REVIEW_PROMPT', () => {
  it('points at the decline/object path, not inline editing', () => {
    expect(PRE_SIGNATURE_REVIEW_PROMPT).toMatch(/decline/i)
    expect(PRE_SIGNATURE_REVIEW_PROMPT).not.toMatch(/edit/i)
  })
})

describe('counsel gate (P17-09a)', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, configurable: true })
  })

  // P17-09a: counsel reviewed and approved AGREEMENT_CLAUSES (Pete, 2026-07-21).
  // These two tests guard the flip itself — they must invert the moment the
  // constant does, so a future accidental revert to 'unreviewed' is caught
  // here rather than silently reopening the production gate.
  it('COUNSEL_REVIEW_STATUS is reviewed', () => {
    expect(COUNSEL_REVIEW_STATUS).toBe('reviewed')
  })

  it('does not throw in production now that it is reviewed', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })
    expect(() => assertCounselReviewedForProduction()).not.toThrow()
  })

  it('is a no-op in development', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', configurable: true })
    expect(() => assertCounselReviewedForProduction()).not.toThrow()
  })

  it('is a no-op in test', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true })
    expect(() => assertCounselReviewedForProduction()).not.toThrow()
  })
})

describe('partiesMissingLegalName (mint gate — Phase 18 review WR / A4)', () => {
  it('flags a fast-added party whose legal_name is empty, null, undefined, or whitespace', () => {
    const parties = [
      { id: '1', name: 'Jessica Ramirez', legal_name: 'Jessica Ramirez' }, // ok
      { id: '2', name: 'alex@example.com', legal_name: '' }, // fast-add, blank
      { id: '3', name: 'sam@example.com', legal_name: null }, // fast-add, null
      { id: '4', name: 'jo@example.com', legal_name: undefined }, // absent
      { id: '5', name: 'ray@example.com', legal_name: '   ' }, // whitespace-only
    ]
    const missing = partiesMissingLegalName(parties)
    expect(missing.map(p => p.id)).toEqual(['2', '3', '4', '5'])
    // Returns the party objects intact so the route can name who is missing.
    expect(missing[0].name).toBe('alex@example.com')
  })

  it('returns an empty array when every party has a real legal name', () => {
    const parties = [
      { id: '1', name: 'Nova', legal_name: 'Jessica Ramirez' },
      { id: '2', name: 'André Beaumont', legal_name: 'André Beaumont' },
    ]
    expect(partiesMissingLegalName(parties)).toEqual([])
  })

  it('passes the initiator (legal name locked from Settings) while catching an incomplete recipient', () => {
    const parties = [
      { id: 'self', name: 'Maya Carter', legal_name: 'Maya Elise Carter' }, // locked from Settings
      { id: 'guest', name: 'newwriter@example.com', legal_name: '' }, // not yet completed
    ]
    expect(partiesMissingLegalName(parties).map(p => p.id)).toEqual(['guest'])
  })
})

describe('displayValue', () => {
  it('returns the trimmed value when present', () => {
    expect(displayValue('  Songtrust  ')).toBe('Songtrust')
  })

  it('returns an em-dash for null, undefined, or blank strings', () => {
    expect(displayValue(null)).toBe('—')
    expect(displayValue(undefined)).toBe('—')
    expect(displayValue('')).toBe('—')
    expect(displayValue('   ')).toBe('—')
  })
})

describe('displayLegalName', () => {
  it('renders "Legal Name (p/k/a Professional Name)" when they differ', () => {
    expect(displayLegalName('Jessica Ramirez', 'Nova')).toBe('Jessica Ramirez (p/k/a Nova)')
  })

  it('renders the legal name alone when it matches the professional name', () => {
    expect(displayLegalName('André Beaumont', 'André Beaumont')).toBe('André Beaumont')
  })

  it('falls back to the professional name when no legal name is captured (pre-063 row)', () => {
    expect(displayLegalName(null, 'Marco Belan')).toBe('Marco Belan')
    expect(displayLegalName(undefined, 'Marco Belan')).toBe('Marco Belan')
    expect(displayLegalName('   ', 'Marco Belan')).toBe('Marco Belan')
  })
})

describe('composeLegalNameFromProfile', () => {
  it('joins first/middle/last name parts', () => {
    expect(
      composeLegalNameFromProfile({
        legal_first_name: 'Maya',
        legal_middle_name: 'Elise',
        legal_last_name: 'Carter',
      })
    ).toBe('Maya Elise Carter')
  })

  it('omits a blank middle name without a double space', () => {
    expect(
      composeLegalNameFromProfile({
        legal_first_name: 'André',
        legal_middle_name: null,
        legal_last_name: 'Beaumont',
      })
    ).toBe('André Beaumont')
  })

  it('appends the suffix with a comma, mirroring assembleDisplayName', () => {
    expect(
      composeLegalNameFromProfile({
        legal_first_name: 'Jane',
        legal_last_name: 'Smith',
        legal_name_suffix: 'Jr.',
      })
    ).toBe('Jane Smith, Jr.')
  })

  it('returns an empty string when no legal name parts are on file', () => {
    expect(composeLegalNameFromProfile({})).toBe('')
    expect(
      composeLegalNameFromProfile({ legal_first_name: null, legal_last_name: undefined })
    ).toBe('')
  })
})
