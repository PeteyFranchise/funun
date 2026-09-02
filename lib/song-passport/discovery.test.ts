import { discoverPassportFacts } from '@/lib/song-passport/discovery'

describe('Song Passport legacy discovery', () => {
  const title = {
    fieldKey: 'composition_title' as const,
    target: { layer: 'composition' as const },
    value: 'A Song',
    sourceKind: 'work' as const,
    sourceRecordId: '11111111-1111-4111-8111-111111111111',
  }

  it('is deterministic, inherited and safe to run as a dry report', () => {
    const first = discoverPassportFacts([title])
    const second = discoverPassportFacts([title])
    expect(second).toEqual(first)
    expect(first.values[0]).toMatchObject({ state: 'inherited', targetKey: 'work' })
    expect(first.values[0]?.sourceFingerprint).toContain('work:11111111-1111-4111-8111-111111111111')
  })

  it('skips blanks and impossible source/field combinations', () => {
    const report = discoverPassportFacts([
      { ...title, value: '  ' },
      { ...title, sourceKind: 'profile' as const },
    ])
    expect(report.values).toHaveLength(0)
    expect(report.summary).toMatchObject({ skippedEmpty: 1, skippedUnsupportedSource: 1 })
  })

  it('reports contradictory sources instead of choosing a winner', () => {
    const report = discoverPassportFacts([
      title,
      { ...title, value: 'Another Song', sourceKind: 'contract' as const, sourceRecordId: '22222222-2222-4222-8222-222222222222' },
    ])
    expect(report.values).toHaveLength(2)
    expect(report.issues).toHaveLength(1)
    expect(report.issues[0]?.issueType).toBe('conflicting_values')
  })
})
