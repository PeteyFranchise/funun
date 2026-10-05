import { resolveTrackAiProvenance } from './track-work-link'
import type { AiEntryInput } from './ai-entries'

const generatedFull: AiEntryInput = { mode: 'generate', component: 'full', hasHumanSource: false }
const generatedInstrument: AiEntryInput = { mode: 'generate', component: 'instrument', hasHumanSource: false }
const performedVocalWithHumanSource: AiEntryInput = { mode: 'performance', component: 'vocal', hasHumanSource: true }
const performedVocalNoHumanSource: AiEntryInput = { mode: 'performance', component: 'vocal', hasHumanSource: false }

describe('resolveTrackAiProvenance', () => {
  it('returns unresolved for a null workId, for ANY aiEntries, including an empty list', () => {
    expect(resolveTrackAiProvenance(null, [])).toEqual(
      expect.objectContaining({ status: 'unresolved' })
    )
    expect(resolveTrackAiProvenance(null, [generatedFull])).toEqual(
      expect.objectContaining({ status: 'unresolved' })
    )
    expect(resolveTrackAiProvenance(null, [performedVocalWithHumanSource])).toEqual(
      expect.objectContaining({ status: 'unresolved' })
    )
  })

  it('never reaches clear for a null workId, no matter how eligible the entries would be', () => {
    const verdict = resolveTrackAiProvenance(null, [generatedInstrument, performedVocalWithHumanSource])
    expect(verdict.status).not.toBe('clear')
    expect(verdict.status).toBe('unresolved')
  })

  it('returns clear for a resolved workId with zero aiEntries', () => {
    expect(resolveTrackAiProvenance('work-1', [])).toEqual({ status: 'clear' })
  })

  it('returns clear for a resolved workId whose entries are all eligible', () => {
    const verdict = resolveTrackAiProvenance('work-1', [generatedInstrument, performedVocalWithHumanSource])
    expect(verdict).toEqual({ status: 'clear' })
  })

  it('returns disqualified when at least one entry disqualifies, even alongside eligible entries', () => {
    const verdict = resolveTrackAiProvenance('work-1', [generatedInstrument, generatedFull])
    expect(verdict.status).toBe('disqualified')
    if (verdict.status === 'disqualified') {
      expect(verdict.reasons.length).toBeGreaterThan(0)
    }
  })

  it('collects every disqualifying reason, not just the first one found', () => {
    const verdict = resolveTrackAiProvenance('work-1', [generatedFull, performedVocalNoHumanSource])
    expect(verdict.status).toBe('disqualified')
    if (verdict.status === 'disqualified') {
      expect(verdict.reasons).toHaveLength(2)
    }
  })

  it('disqualifies on a wholly generated full master alone', () => {
    const verdict = resolveTrackAiProvenance('work-1', [generatedFull])
    expect(verdict.status).toBe('disqualified')
  })

  it('disqualifies on a performed vocal with no human source alone', () => {
    const verdict = resolveTrackAiProvenance('work-1', [performedVocalNoHumanSource])
    expect(verdict.status).toBe('disqualified')
  })
})
