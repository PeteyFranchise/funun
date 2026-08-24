import { daysInStage, resolveStage, type PipelineStage } from './stages'

const DAY_MS = 24 * 60 * 60 * 1000

function isoAgo(ms: number, fromMs: number): string {
  return new Date(fromMs - ms).toISOString()
}

describe('daysInStage', () => {
  const now = new Date('2026-08-24T12:00:00.000Z').getTime()

  it('returns whole days between stage_entered_at and now', () => {
    expect(daysInStage(isoAgo(5 * DAY_MS, now), now)).toBe(5)
  })

  it('returns null (never 0 or a fabricated value) when stage_entered_at is absent', () => {
    expect(daysInStage(null, now)).toBeNull()
  })

  it('floors at 0, never negative, for a future stage_entered_at (clock skew)', () => {
    const future = new Date(now + 2 * DAY_MS).toISOString()
    expect(daysInStage(future, now)).toBe(0)
  })

  it('defaults now to Date.now() when not supplied', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * DAY_MS).toISOString()
    expect(daysInStage(fiveDaysAgo)).toBe(5)
  })
})

describe('resolveStage', () => {
  const stages: PipelineStage[] = [
    { id: 's1', key: 'new_lead', label: 'New lead', sortOrder: 0, isTerminal: false },
    { id: 's2', key: 'contacted', label: 'Contacted', sortOrder: 1, isTerminal: false },
    { id: 's3', key: 'active', label: 'Active', sortOrder: 2, isTerminal: false },
    { id: 's4', key: 'negotiating', label: 'Negotiating', sortOrder: 3, isTerminal: false },
    { id: 's5', key: 'closed_dormant', label: 'Closed/Dormant', sortOrder: 4, isTerminal: true },
  ]

  it('returns the matching stage for a known id', () => {
    expect(resolveStage('s3', stages)).toEqual(stages[2])
  })

  it('returns null for an unknown id', () => {
    expect(resolveStage('unknown-id', stages)).toBeNull()
  })

  it('returns null for a null stageId', () => {
    expect(resolveStage(null, stages)).toBeNull()
  })

  it('returns the terminal stage untouched', () => {
    expect(resolveStage('s5', stages)?.isTerminal).toBe(true)
  })
})
