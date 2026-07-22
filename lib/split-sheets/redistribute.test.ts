// RED-first tests for redistribute() — the add/remove-party percentage
// rebalancer (P18-07, deliberation-driven). The hard contract: every
// output must pass validateApprovalTotal() so the server's 100.000% gate
// never rejects a redistribution result.

import { readFileSync } from 'fs'
import { redistribute } from './redistribute'
import { validateApprovalTotal } from './approval'

describe('redistribute — even mode', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'produces a set of %i parties that totals exactly 100.000',
    n => {
      const input = new Array(n).fill(0)
      const out = redistribute(input, 'even')
      expect(out).toHaveLength(n)
      expect(validateApprovalTotal(out)).toBe(true)
    }
  )

  it('ignores existing weights entirely — every party gets an equal share', () => {
    const out = redistribute([70, 20, 10], 'even')
    // All three shares are equal before residue; the residue (100 -
    // 3*33.333 = 0.001) is applied to the first entry on a tie.
    expect(out[0]).toBeCloseTo(33.334, 3)
    expect(out[1]).toBeCloseTo(33.333, 3)
    expect(out[2]).toBeCloseTo(33.333, 3)
    expect(validateApprovalTotal(out)).toBe(true)
  })

  it('applies rounding residue so the total is exactly 100.000 for an odd count', () => {
    const out = redistribute([0, 0, 0], 'even')
    const total = Math.round(out.reduce((a, b) => a + b, 0) * 1000) / 1000
    expect(total).toBe(100)
  })
})

describe('redistribute — proportional mode', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    'produces a set of %i parties that totals exactly 100.000 (all pre-weighted)',
    n => {
      // n existing, evenly-weighted parties (simulates n-1 -> n add, then
      // re-running proportional against the resulting weights, or a fresh
      // n-party proportional rescale).
      const input = new Array(n).fill(10)
      const out = redistribute(input, 'proportional')
      expect(out).toHaveLength(n)
      expect(validateApprovalTotal(out)).toBe(true)
    }
  )

  it('a 50/30/20 set gaining a fourth party scales the first three down preserving their 5:3:2 ratio', () => {
    const out = redistribute([50, 30, 20, 0], 'proportional')
    expect(out).toHaveLength(4)
    expect(validateApprovalTotal(out)).toBe(true)
    // New (zero-valued) party receives an even 1/4 share of the total.
    expect(out[3]).toBeCloseTo(25, 3)
    // The first three preserve their relative 5:3:2 ratio.
    const ratio1 = out[0] / out[1]
    const ratio2 = out[1] / out[2]
    expect(ratio1).toBeCloseTo(50 / 30, 3)
    expect(ratio2).toBeCloseTo(30 / 20, 3)
  })

  it('removing a party redistributes the freed percentage proportionally among the rest', () => {
    // 50/30/20 loses the 20% party — caller passes the remaining two.
    const out = redistribute([50, 30], 'proportional')
    expect(out).toHaveLength(2)
    expect(validateApprovalTotal(out)).toBe(true)
    expect(out[0]).toBeCloseTo(62.5, 3)
    expect(out[1]).toBeCloseTo(37.5, 3)
  })

  it('a lone party at 100% gaining a second party splits evenly 50/50', () => {
    const out = redistribute([100, 0], 'proportional')
    expect(out).toHaveLength(2)
    expect(validateApprovalTotal(out)).toBe(true)
    expect(out[0]).toBeCloseTo(50, 3)
    expect(out[1]).toBeCloseTo(50, 3)
  })

  it('a zero-total input returns an even distribution rather than dividing by zero', () => {
    const out = redistribute([0, 0, 0, 0], 'proportional')
    expect(out).toHaveLength(4)
    expect(validateApprovalTotal(out)).toBe(true)
    out.forEach(v => expect(v).toBeCloseTo(25, 3))
  })

  it('an empty input returns an empty array without throwing', () => {
    expect(redistribute([], 'proportional')).toEqual([])
    expect(redistribute([], 'even')).toEqual([])
  })
})

describe('redistribute — module conventions', () => {
  it('imports evenSplit from lib/split-sheets/approval.ts rather than recomputing it', () => {
    const src = readFileSync(require.resolve('./redistribute.ts'), 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*evenSplit[^}]*\}\s*from\s*['"]\.\/approval['"]/)
  })
})
