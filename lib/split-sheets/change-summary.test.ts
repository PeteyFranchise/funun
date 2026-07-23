// RED-first tests for summarizePartyChanges() — the P18-09 consensus-reset
// diff. Structural guarantee under test: the function accepts no
// caller-supplied free text (no parameter through which one could be
// passed) and NEVER flags an identity-only (PRO/IPI/publisher/
// administrator/legal-name) change as a party-set change.

import { readFileSync } from 'fs'
import { summarizePartyChanges, formatPartyChange } from './change-summary'

describe('summarizePartyChanges', () => {
  it('produces no record for a party present in both sets with an unchanged percentage', () => {
    const before = [{ id: '1', name: 'Jamie', split_percentage: 50 }]
    const after = [{ id: '1', name: 'Jamie', split_percentage: 50 }]
    expect(summarizePartyChanges(before, after)).toEqual([])
  })

  it('P18-09: an identity-only change (PRO/IPI/publisher/administrator/legal name) produces NO record', () => {
    const before = [
      { id: '1', name: 'Jamie', split_percentage: 50, pro: 'ascap', ipi: '111' },
    ]
    const after = [
      {
        id: '1',
        name: 'Jamie',
        split_percentage: 50,
        pro: 'bmi', // changed
        ipi: '222', // changed
        publishing_designee: 'New Publisher',
        administrator: 'New Admin',
        legal_name: 'Jamie Full Legal Name',
      },
    ]
    expect(summarizePartyChanges(before, after)).toEqual([])
  })

  it('flags an added party', () => {
    const before = [{ id: '1', name: 'Jamie', split_percentage: 100 }]
    const after = [
      { id: '1', name: 'Jamie', split_percentage: 80 },
      { id: '2', name: 'Rapper', split_percentage: 20 },
    ]
    const result = summarizePartyChanges(before, after)
    expect(result).toContainEqual({ kind: 'added', name: 'Rapper', to: 20 })
    expect(result).toContainEqual({ kind: 'moved', name: 'Jamie', from: 100, to: 80 })
  })

  it('flags a removed party', () => {
    const before = [
      { id: '1', name: 'Jamie', split_percentage: 50 },
      { id: '2', name: 'Rapper', split_percentage: 50 },
    ]
    const after = [{ id: '1', name: 'Jamie', split_percentage: 100 }]
    const result = summarizePartyChanges(before, after)
    expect(result).toContainEqual({ kind: 'removed', name: 'Rapper', from: 50 })
    expect(result).toContainEqual({ kind: 'moved', name: 'Jamie', from: 50, to: 100 })
  })

  it('flags a moved split with from/to values', () => {
    const before = [{ id: '1', name: 'Jamie', split_percentage: 40 }]
    const after = [{ id: '1', name: 'Jamie', split_percentage: 32 }]
    expect(summarizePartyChanges(before, after)).toEqual([
      { kind: 'moved', name: 'Jamie', from: 40, to: 32 },
    ])
  })

  it('matches by normalized name when no id is present (trim + lowercase)', () => {
    const before = [{ name: '  Jamie Fox  ', split_percentage: 50 }]
    const after = [{ name: 'jamie fox', split_percentage: 60 }]
    expect(summarizePartyChanges(before, after)).toEqual([
      { kind: 'moved', name: 'jamie fox', from: 50, to: 60 },
    ])
  })

  it('produces an empty list for two identical party sets', () => {
    const before = [
      { id: '1', name: 'Jamie', split_percentage: 50 },
      { id: '2', name: 'Rapper', split_percentage: 50 },
    ]
    const after = [
      { id: '1', name: 'Jamie', split_percentage: 50 },
      { id: '2', name: 'Rapper', split_percentage: 50 },
    ]
    expect(summarizePartyChanges(before, after)).toEqual([])
  })
})

describe('formatPartyChange', () => {
  it('renders system-worded English for each kind', () => {
    expect(formatPartyChange({ kind: 'added', name: 'Rapper', to: 20 })).toMatch(/Rapper/)
    expect(formatPartyChange({ kind: 'removed', name: 'Rapper', from: 20 })).toMatch(/Rapper/)
    expect(
      formatPartyChange({ kind: 'moved', name: 'Jamie', from: 40, to: 32 })
    ).toMatch(/40.*32|Jamie/)
  })
})

describe('change-summary — no free-text surface (P18-13)', () => {
  it('summarizePartyChanges has no parameter through which caller-supplied text could pass', () => {
    // Arity check: exactly two positional params (before, after) — no
    // optional third "note"/"message" argument.
    expect(summarizePartyChanges.length).toBe(2)
  })

  it('documents the harassment-vector rationale citing 17-DUAL-ENTRY-DESIGN section 10c-ii', () => {
    const src = readFileSync(require.resolve('./change-summary.ts'), 'utf8')
    expect(src).toMatch(/10c-ii/)
  })
})
