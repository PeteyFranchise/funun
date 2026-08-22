import { formatPhone, phoneDigits, isValidPhone } from './phone'

describe('phoneDigits', () => {
  it('strips non-digits and caps at 10', () => {
    expect(phoneDigits('(313) 555-0142')).toBe('3135550142')
    expect(phoneDigits('313.555.0142 x9')).toBe('3135550142')
    expect(phoneDigits('13135550142999')).toBe('1313555014') // capped at 10
    expect(phoneDigits('')).toBe('')
  })
})

describe('formatPhone', () => {
  it('progressively masks toward (XXX) XXX-XXXX regardless of input shape', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone('31')).toBe('(31')
    expect(formatPhone('313')).toBe('(313')
    expect(formatPhone('313555')).toBe('(313) 555')
    expect(formatPhone('3135550142')).toBe('(313) 555-0142')
    expect(formatPhone('313.555.0142')).toBe('(313) 555-0142')
    expect(formatPhone('+1 (313) 555 0142')).toBe('(313) 555-0142') // extra digit dropped past 10
  })
})

describe('isValidPhone', () => {
  it('requires exactly 10 digits', () => {
    expect(isValidPhone('(313) 555-0142')).toBe(true)
    expect(isValidPhone('3135550142')).toBe(true)
    expect(isValidPhone('313555014')).toBe(false) // 9
    expect(isValidPhone('(313) 555-')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })
})
