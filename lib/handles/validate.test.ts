import { isValidHandle, normalizeHandleForCompare, handleFormatError } from '@/lib/handles/validate'

describe('isValidHandle', () => {
  it('accepts the one live production handle', () => {
    expect(isValidHandle('maya-reyes')).toBe(true)
  })

  it('accepts mixed case and underscores', () => {
    expect(isValidHandle('MayaReyes')).toBe(true)
    expect(isValidHandle('maya_reyes')).toBe(true)
  })

  it('rejects below minimum length and accepts at the boundary', () => {
    expect(isValidHandle('ab')).toBe(false)
    expect(isValidHandle('abc')).toBe(true)
  })

  it('rejects above maximum length and accepts at the boundary', () => {
    expect(isValidHandle('a'.repeat(31))).toBe(false)
    expect(isValidHandle('a'.repeat(30))).toBe(true)
  })

  it('rejects a leading separator', () => {
    expect(isValidHandle('-maya')).toBe(false)
    expect(isValidHandle('_maya')).toBe(false)
  })

  it('rejects a trailing separator', () => {
    expect(isValidHandle('maya-')).toBe(false)
    expect(isValidHandle('maya_')).toBe(false)
  })

  it('rejects consecutive separators', () => {
    expect(isValidHandle('may--a')).toBe(false)
    expect(isValidHandle('may__a')).toBe(false)
    expect(isValidHandle('may-_a')).toBe(false)
  })

  it('rejects spaces, dots, percent signs, and non-ASCII letters', () => {
    expect(isValidHandle('may a')).toBe(false)
    expect(isValidHandle('may.a')).toBe(false)
    expect(isValidHandle('may%a')).toBe(false)
    expect(isValidHandle('mayá')).toBe(false)
  })

  it('rejects empty and whitespace-only input without throwing', () => {
    expect(() => isValidHandle('')).not.toThrow()
    expect(() => isValidHandle('   ')).not.toThrow()
    expect(isValidHandle('')).toBe(false)
    expect(isValidHandle('   ')).toBe(false)
  })

  it('trims leading/trailing whitespace before checking', () => {
    expect(isValidHandle('  maya-reyes  ')).toBe(true)
  })
})

describe('normalizeHandleForCompare', () => {
  it('lowercases for comparison', () => {
    expect(normalizeHandleForCompare('MayaReyes')).toBe('mayareyes')
  })

  it('trims and lowercases', () => {
    expect(normalizeHandleForCompare('  Maya-Reyes ')).toBe('maya-reyes')
  })
})

describe('handleFormatError', () => {
  it('returns null for a valid handle', () => {
    expect(handleFormatError('maya-reyes')).toBeNull()
  })

  it('returns a specific message for a too-short handle', () => {
    expect(handleFormatError('ab')).toEqual(expect.stringContaining('3'))
  })

  it('returns a specific message for a too-long handle', () => {
    expect(handleFormatError('a'.repeat(31))).toEqual(expect.stringContaining('30'))
  })

  it('returns a specific message for bad characters', () => {
    expect(handleFormatError('may%a')).not.toBeNull()
  })

  it('returns a specific message for an edge separator', () => {
    expect(handleFormatError('-maya')).not.toBeNull()
    expect(handleFormatError('maya-')).not.toBeNull()
  })
})
