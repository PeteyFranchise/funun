// RED-first tests for the splits reconciliation diff (ESIGN-12, P17-07).
// reconcileSplits must match by normalized name only, flag percentage
// mismatches, and NEVER mutate the composers[] array it's given.

import { reconcileSplits } from './reconciliation'
import type { Composer } from '@/lib/metadata/schema'

function composer(name: string, split: number): Composer {
  return { name, role: 'composer_lyricist', pro: 'none', split }
}

describe('reconcileSplits', () => {
  it('matches a party to a composer by normalized (trim + case-fold) name', () => {
    const result = reconcileSplits(
      [{ name: '  Jane Doe  ', split_percentage: 50 }],
      [composer('jane doe', 50)]
    )
    expect(result.rows).toEqual([
      { kind: 'matched', name: '  Jane Doe  ', partyPercent: 50, composerPercent: 50, equal: true },
    ])
    expect(result.needsWriteBack).toBe(false)
  })

  it('flags a mismatch when a matched pair differs in percentage', () => {
    const result = reconcileSplits(
      [{ name: 'Jane Doe', split_percentage: 60 }],
      [composer('Jane Doe', 50)]
    )
    expect(result.rows).toEqual([
      { kind: 'matched', name: 'Jane Doe', partyPercent: 60, composerPercent: 50, equal: false },
    ])
    expect(result.needsWriteBack).toBe(true)
  })

  it('reports a party with no matching composer as unmatched', () => {
    const result = reconcileSplits([{ name: 'New Collaborator', split_percentage: 25 }], [])
    expect(result.rows).toEqual([
      { kind: 'party_no_composer', name: 'New Collaborator', partyPercent: 25 },
    ])
    expect(result.needsWriteBack).toBe(true)
  })

  it('reports a composer with no matching party as extra', () => {
    const result = reconcileSplits([], [composer('Old Composer', 100)])
    expect(result.rows).toEqual([
      { kind: 'composer_no_party', name: 'Old Composer', composerPercent: 100 },
    ])
    expect(result.needsWriteBack).toBe(true)
  })

  it('reports overall needsWriteBack=false only when every row matches exactly', () => {
    const result = reconcileSplits(
      [
        { name: 'Jane Doe', split_percentage: 60 },
        { name: 'John Smith', split_percentage: 40 },
      ],
      [composer('jane doe', 60), composer('john smith', 40)]
    )
    expect(result.needsWriteBack).toBe(false)
    expect(result.rows.every(r => r.kind === 'matched' && r.equal)).toBe(true)
  })

  it('never mutates the composers array it is given', () => {
    const composers = [composer('Jane Doe', 50)]
    const snapshot = JSON.parse(JSON.stringify(composers))
    reconcileSplits([{ name: 'Jane Doe', split_percentage: 99 }], composers)
    expect(composers).toEqual(snapshot)
  })

  it('handles empty parties and empty composers with an empty diff', () => {
    const result = reconcileSplits([], [])
    expect(result.rows).toEqual([])
    expect(result.needsWriteBack).toBe(false)
  })

  it('produces a full diff (matched + unmatched + extra) in one pass', () => {
    const result = reconcileSplits(
      [
        { name: 'Jane Doe', split_percentage: 50 },
        { name: 'Brand New Party', split_percentage: 50 },
      ],
      [composer('jane doe', 50), composer('Departed Composer', 0)]
    )
    expect(result.rows).toContainEqual({
      kind: 'matched',
      name: 'Jane Doe',
      partyPercent: 50,
      composerPercent: 50,
      equal: true,
    })
    expect(result.rows).toContainEqual({
      kind: 'party_no_composer',
      name: 'Brand New Party',
      partyPercent: 50,
    })
    expect(result.rows).toContainEqual({
      kind: 'composer_no_party',
      name: 'Departed Composer',
      composerPercent: 0,
    })
    expect(result.needsWriteBack).toBe(true)
  })
})
