import {
  clampComparisonPosition,
  comparisonResolutionLabel,
  defaultComparisonIds,
} from './version-comparison'

const older = { id: 'v4-id', display: 'v4', createdAt: '2026-09-01T10:00:00Z', durationSeconds: 210 }
const newer = { id: 'v5-id', display: 'v5', createdAt: '2026-09-01T11:00:00Z', durationSeconds: 180 }

describe('Writer\'s Room version comparison', () => {
  it('defaults side A to the prior take and side B to the newest take', () => {
    expect(defaultComparisonIds([newer, older])).toEqual({ sideAId: older.id, sideBId: newer.id })
    expect(defaultComparisonIds([newer])).toBeNull()
  })

  it('preserves absolute time and clamps only for a shorter recording', () => {
    expect(clampComparisonPosition(105400, 180)).toBe(105400)
    expect(clampComparisonPosition(205000, 180)).toBe(180000)
    expect(clampComparisonPosition(205000, null)).toBe(205000)
  })

  it('names the newer take when resolving an older note while listening to it', () => {
    expect(comparisonResolutionLabel({ resolved: false, commentVersion: older, listeningVersion: newer }))
      .toBe('Mark addressed in v5')
    expect(comparisonResolutionLabel({ resolved: false, commentVersion: older, listeningVersion: older }))
      .toBe('Resolve note')
    expect(comparisonResolutionLabel({ resolved: true, commentVersion: older, listeningVersion: newer }))
      .toBe('Reopen note')
  })
})
