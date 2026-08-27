import { formatContactPhone, formatPhone, phoneDigits, isValidPhone } from './phone'

// The NANP helpers' own behavior is covered by lib/staff/phone.test.ts (which
// imports them through the lib/staff/phone re-export). These cases exist to
// pin them at their new home, and — the reason this file exists — to lock the
// international guard on formatContactPhone.

describe('NANP helpers at their new home', () => {
  it('re-exports identical behavior', () => {
    expect(phoneDigits('(313) 613-4284')).toBe('3136134284')
    expect(formatPhone('3136134284')).toBe('(313) 613-4284')
    expect(isValidPhone('3136134284')).toBe(true)
    expect(isValidPhone('313613428')).toBe(false)
  })
})

describe('formatContactPhone — US', () => {
  it('masks a bare 10-digit US number', () => {
    expect(formatContactPhone('3136134284')).toBe('(313) 613-4284')
  })

  it('masks progressively mid-type', () => {
    expect(formatContactPhone('3')).toBe('(3')
    expect(formatContactPhone('313')).toBe('(313')
    expect(formatContactPhone('3136')).toBe('(313) 6')
    expect(formatContactPhone('313613')).toBe('(313) 613')
    expect(formatContactPhone('3136134')).toBe('(313) 613-4')
    expect(formatContactPhone('3136134284')).toBe('(313) 613-4284')
  })

  it('drops a bare leading 1 country code', () => {
    expect(formatContactPhone('13136134284')).toBe('(313) 613-4284')
  })

  it('masks an explicit +1 as NANP', () => {
    expect(formatContactPhone('+1 313 613 4284')).toBe('(313) 613-4284')
    expect(formatContactPhone('+13136134284')).toBe('(313) 613-4284')
  })

  it('does not eat the keystroke while "+1" is still being typed', () => {
    // If "+1" masked to "" the artist could never finish typing a +1 number
    // in a controlled input — the field would clear under them.
    expect(formatContactPhone('+')).toBe('+')
    expect(formatContactPhone('+1')).toBe('+1')
    expect(formatContactPhone('+1 3')).toBe('(3')
  })

  it('formats a raw claim-prefill value', () => {
    // lib/profile/semantic-blank.ts maps a collaborator's phone into
    // contact_phone, so values arrive unformatted from the claim flow.
    expect(formatContactPhone('3136134284')).toBe('(313) 613-4284')
    expect(formatContactPhone('313.613.4284')).toBe('(313) 613-4284')
  })
})

describe('formatContactPhone — international', () => {
  it('returns a +44 UK number completely unchanged', () => {
    // THE regression this module exists to prevent: the NANP helpers would
    // turn this into "(207) 946-0958" — a plausible-looking wrong number,
    // silently, on a field that feeds contracts.
    expect(formatContactPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })

  it('leaves other country codes alone, at every length', () => {
    expect(formatContactPhone('+4')).toBe('+4')
    expect(formatContactPhone('+44')).toBe('+44')
    expect(formatContactPhone('+44 20')).toBe('+44 20')
    expect(formatContactPhone('+33 6 12 34 56 78')).toBe('+33 6 12 34 56 78')
    expect(formatContactPhone('+81-3-1234-5678')).toBe('+81-3-1234-5678')
    expect(formatContactPhone('+971 50 123 4567')).toBe('+971 50 123 4567')
  })

  it('never truncates a number longer than 10 digits', () => {
    expect(formatContactPhone('+86 138 0013 8000')).toBe('+86 138 0013 8000')
  })

  it('preserves a trailing space being typed as a separator', () => {
    expect(formatContactPhone('+44 20 ')).toBe('+44 20 ')
  })
})

describe('formatContactPhone — edges', () => {
  it('is safe on empty and whitespace input', () => {
    expect(formatContactPhone('')).toBe('')
    expect(formatContactPhone('   ')).toBe('')
  })

  it('is idempotent on already-formatted input', () => {
    const us = formatContactPhone('3136134284')
    expect(formatContactPhone(us)).toBe(us)

    const uk = formatContactPhone('+44 20 7946 0958')
    expect(formatContactPhone(uk)).toBe(uk)

    const partial = formatContactPhone('313')
    expect(formatContactPhone(partial)).toBe(partial)
  })
})
