import { eligibleEarlierTakes, type ExistingTakeOption } from './human-source-takes'

function take(overrides: Partial<ExistingTakeOption> & { id: string; createdAt: string }): ExistingTakeOption {
  return {
    display: overrides.id,
    description: 'Take',
    playbackUrl: null,
    durationSeconds: null,
    isAiTagged: false,
    ...overrides,
  }
}

describe('eligibleEarlierTakes', () => {
  const versions = [
    take({ id: 'v1', createdAt: '2026-09-01T10:00:00.000Z' }),
    take({ id: 'v2', createdAt: '2026-09-01T11:00:00.000Z', isAiTagged: true }),
    take({ id: 'v3', createdAt: '2026-09-01T12:00:00.000Z' }),
    take({ id: 'v4', createdAt: '2026-09-01T13:00:00.000Z' }),
  ]

  it('excludes the target, later takes, and already AI-tagged takes', () => {
    expect(eligibleEarlierTakes(versions, 'v3').map(version => version.id)).toEqual(['v1'])
  })

  it('offers every non-AI take newest-first when there is no target version', () => {
    expect(eligibleEarlierTakes(versions, null).map(version => version.id)).toEqual(['v4', 'v3', 'v1'])
  })

  it('fails closed for a missing target or malformed timestamps', () => {
    expect(eligibleEarlierTakes(versions, 'missing')).toEqual([])
    expect(
      eligibleEarlierTakes([take({ id: 'bad', createdAt: 'not-a-date' })], null)
    ).toEqual([])
  })
})
