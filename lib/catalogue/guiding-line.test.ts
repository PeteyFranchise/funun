import { GUIDING_LINE_PRIORITY, resolveGuidingLine, type GuidingLineSnapshot } from './guiding-line'

const ben = { collaboratorId: 'collab-ben', name: 'Ben' }
const cara = { collaboratorId: 'collab-cara', name: 'Cara' }

function baseSnapshot(overrides: Partial<GuidingLineSnapshot> = {}): GuidingLineSnapshot {
  return {
    versionCount: 1,
    blockCount: 1,
    members: [],
    writersMissingFromSheet: [],
    unresolvedAiEntries: 0,
    dismissedStepKeys: [],
    splitsNudgeFiredFor: [],
    splitReminderSetting: 'on',
    ...overrides,
  }
}

describe('resolveGuidingLine — priority selection', () => {
  it('returns the hum-first step for a brand-new work with nothing in it', () => {
    const step = resolveGuidingLine(baseSnapshot({ versionCount: 0, blockCount: 0 }))
    expect(step).not.toBeNull()
    expect(step?.key).toBe('hum_to_claim')
    expect(step?.headline).toBe('Start with a hum')
    expect(step?.reason).toBe('Save and protect your idea by just humming or singing right now.')
  })

  it('returns the hum-to-claim step, phrased as protecting the melody, for lyrics with no audio', () => {
    const step = resolveGuidingLine(baseSnapshot({ versionCount: 0, blockCount: 3 }))
    expect(step?.key).toBe('hum_to_claim')
    expect(step?.headline.toLowerCase()).toContain('melody')
    expect(step?.reason).toBe('Hum every melody you want to own, and the song is entirely yours.')
  })

  it('returns the splits step naming the missing contributor, and no number', () => {
    const step = resolveGuidingLine(
      baseSnapshot({ versionCount: 1, blockCount: 1, writersMissingFromSheet: [ben] })
    )
    expect(step?.key).toBe('splits')
    expect(step?.headline).toContain('Ben')
    expect(step?.headline).not.toMatch(/\d/)
    expect(JSON.stringify(step)).not.toMatch(/percentage|split.*\d/i)
  })

  it('returns exactly one step — the highest priority — when three things qualify at once', () => {
    // Three simultaneously-true candidates: two different missing writers
    // (each individually eligible for the splits nudge) plus an
    // audio-less work that would also qualify for hum-to-claim. Only the
    // single highest-priority step comes back.
    const snapshot = baseSnapshot({
      versionCount: 0,
      blockCount: 0,
      writersMissingFromSheet: [ben, cara],
    })
    const step = resolveGuidingLine(snapshot)
    expect(step).not.toBeNull()
    expect(step?.key).toBe('splits')
    expect(step?.headline).toContain('Ben')
    expect(step?.headline).not.toContain('Cara')
  })

  it('is never an array — a single object or null', () => {
    const step = resolveGuidingLine(baseSnapshot({ writersMissingFromSheet: [ben] }))
    expect(Array.isArray(step)).toBe(false)
  })

  it('returns null when the work needs nothing', () => {
    const step = resolveGuidingLine(baseSnapshot())
    expect(step).toBeNull()
  })

  it('declares the priority rotation in the decided order', () => {
    expect(GUIDING_LINE_PRIORITY).toEqual(['splits', 'hum_to_claim', 'ddex_gap', 'crate_qualifies'])
  })

  it('every returned step carries a non-empty action label and target', () => {
    const scenarios: GuidingLineSnapshot[] = [
      baseSnapshot({ versionCount: 0, blockCount: 0 }),
      baseSnapshot({ versionCount: 0, blockCount: 2 }),
      baseSnapshot({ writersMissingFromSheet: [ben] }),
    ]
    for (const snapshot of scenarios) {
      const step = resolveGuidingLine(snapshot)
      expect(step).not.toBeNull()
      expect(step?.actionLabel.length).toBeGreaterThan(0)
      expect(step?.actionTarget.length).toBeGreaterThan(0)
    }
  })
})

describe('resolveGuidingLine — cadence gates', () => {
  it('skips a dismissed step and falls through to the next-highest', () => {
    // hum_to_claim would otherwise qualify (no versions) — dismiss it and
    // confirm nothing else qualifies underneath it, so the result is null
    // rather than the dismissed step reappearing.
    const step = resolveGuidingLine(
      baseSnapshot({ versionCount: 0, blockCount: 0, dismissedStepKeys: ['hum_to_claim'] })
    )
    expect(step).toBeNull()
  })

  it('falls through a dismissed splits nudge to hum-to-claim underneath it', () => {
    const key = 'collaborator:collab-ben'
    const step = resolveGuidingLine(
      baseSnapshot({
        versionCount: 0,
        blockCount: 0,
        writersMissingFromSheet: [ben],
        dismissedStepKeys: [`splits:${key}`],
      })
    )
    expect(step?.key).toBe('hum_to_claim')
  })

  it('never appears for a contributor when split reminders are set to doors-only, even as the highest priority', () => {
    const step = resolveGuidingLine(
      baseSnapshot({
        versionCount: 1, // hum_to_claim would not qualify either, isolating the splits gate
        blockCount: 1,
        writersMissingFromSheet: [ben],
        splitReminderSetting: 'doors_only',
      })
    )
    expect(step).toBeNull()
  })

  it('does not return the splits step for a contributor it has already fired for, even before any dismissal', () => {
    const key = 'collaborator:collab-ben'
    const step = resolveGuidingLine(
      baseSnapshot({
        versionCount: 1,
        blockCount: 1,
        writersMissingFromSheet: [ben],
        splitsNudgeFiredFor: [key],
        dismissedStepKeys: [],
      })
    )
    expect(step).toBeNull()
  })

  it('still fires for a second, newly-missing contributor after the first has already fired', () => {
    const benKey = 'collaborator:collab-ben'
    const step = resolveGuidingLine(
      baseSnapshot({
        versionCount: 1,
        blockCount: 1,
        writersMissingFromSheet: [ben, cara],
        splitsNudgeFiredFor: [benKey],
      })
    )
    expect(step?.key).toBe('splits')
    expect(step?.headline).toContain('Cara')
  })
})
