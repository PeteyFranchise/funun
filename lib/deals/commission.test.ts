import { computeNetFee } from './commission'

describe('computeNetFee', () => {
  it('splits gross into exact integer cents with no floating-point drift', () => {
    // 25% of an odd cent amount ($1,000.01) — must round-trip exactly.
    const grossCents = 100_001
    const { commissionCents, artistNetCents } = computeNetFee(grossCents, 25)
    expect(Number.isInteger(commissionCents)).toBe(true)
    expect(Number.isInteger(artistNetCents)).toBe(true)
    expect(commissionCents + artistNetCents).toBe(grossCents)
  })

  it('commissionPct 0 sends full gross to the artist with zero commission', () => {
    const { commissionCents, artistNetCents } = computeNetFee(500_000, 0)
    expect(commissionCents).toBe(0)
    expect(artistNetCents).toBe(500_000)
  })

  it('commissionPct 100 sends zero to the artist', () => {
    const { commissionCents, artistNetCents } = computeNetFee(500_000, 100)
    expect(commissionCents).toBe(500_000)
    expect(artistNetCents).toBe(0)
  })

  it('always reconstitutes the gross exactly across a range of odd-cent amounts and percentages', () => {
    const amounts = [1, 3, 7, 99, 101, 12_345, 999_999, 1_000_001]
    const pcts = [0, 1, 10, 15, 20, 25, 33.33, 50, 66.5, 99, 100]
    for (const gross of amounts) {
      for (const pct of pcts) {
        const { commissionCents, artistNetCents } = computeNetFee(gross, pct)
        expect(commissionCents + artistNetCents).toBe(gross)
      }
    }
  })

  it('throws a descriptive Error on negative gross', () => {
    expect(() => computeNetFee(-1, 25)).toThrow(/gross/i)
  })

  it('throws a descriptive Error on non-finite gross', () => {
    expect(() => computeNetFee(Number.NaN, 25)).toThrow(/gross/i)
    expect(() => computeNetFee(Number.POSITIVE_INFINITY, 25)).toThrow(/gross/i)
  })

  it('throws a descriptive Error on negative commission percentage', () => {
    expect(() => computeNetFee(500_000, -1)).toThrow(/commission/i)
  })

  it('throws a descriptive Error on non-finite commission percentage', () => {
    expect(() => computeNetFee(500_000, Number.NaN)).toThrow(/commission/i)
  })

  it('throws a descriptive Error on a commission percentage over 100', () => {
    expect(() => computeNetFee(500_000, 101)).toThrow(/commission/i)
  })
})
