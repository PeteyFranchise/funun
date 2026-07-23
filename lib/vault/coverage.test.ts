// RED-first test for tracksNeedingSheet() — the coverage denominator rule
// (P18-15, 18-CONTEXT.md, settled after planning). This function is
// deliberately trivial: EVERY track needs a split sheet, no exceptions.
// See lib/vault/coverage.ts for the recorded rationale.

import { tracksNeedingSheet } from '@/lib/vault/coverage'

describe('tracksNeedingSheet — every track, no exceptions (P18-15)', () => {
  it('returns all 5 tracks for a 5-track project — there is no solo-written exemption', () => {
    const tracks = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 't5' }]
    expect(tracksNeedingSheet(tracks)).toHaveLength(5)
    expect(tracksNeedingSheet(tracks)).toEqual(tracks)
  })

  it('still returns a track whose metadata shows a single composer', () => {
    const soloTrack = { id: 't1', metadata: { composers: [{ name: 'Solo Writer', split: 100 }] } }
    const result = tracksNeedingSheet([soloTrack])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
  })

  it('returns an empty list for a project with zero tracks (vacuously complete, no divide-by-zero downstream)', () => {
    expect(tracksNeedingSheet([])).toEqual([])
  })

  it('reads only the track list — composer/party shape does not change the result', () => {
    const withComposers = [{ id: 't1', metadata: { composers: [{ name: 'A', split: 50 }, { name: 'B', split: 50 }] } }]
    const withoutComposers = [{ id: 't1' }]
    expect(tracksNeedingSheet(withComposers)).toHaveLength(1)
    expect(tracksNeedingSheet(withoutComposers)).toHaveLength(1)
  })
})
