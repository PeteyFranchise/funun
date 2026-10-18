import { generateClaimToken, generateResponseToken, isTokenFormat } from './tokens'

describe('isTokenFormat', () => {
  it('accepts the tokens the generators produce', () => {
    expect(isTokenFormat(generateClaimToken())).toBe(true)
    expect(isTokenFormat(generateResponseToken())).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['too short', 'a'.repeat(63)],
    ['too long', 'a'.repeat(65)],
    ['uppercase', 'A'.repeat(64)],
    ['non-hex', 'g'.repeat(64)],
    ['trailing newline', 'a'.repeat(64) + '\n'],
  ])('rejects %s', (_label, value) => {
    expect(isTokenFormat(value)).toBe(false)
  })
})
