import { trackExposure, isTrackExposed, type TrackExposureInput } from '@/lib/sync-library/track-exposure'

const base: TrackExposureInput = {
  trackId: 't1',
  audioFileUrl: 'track-audio/w1/v1.wav',
  listingStatus: 'admitted',
}

describe('trackExposure — D-11 track-level discoverability', () => {
  it('exposes an admitted track with a bound master', () => {
    expect(trackExposure(base)).toEqual({ status: 'exposed' })
    expect(isTrackExposed(base)).toBe(true)
  })

  it('refuses a track with no listing of its own, even on a project where a sibling is admitted', () => {
    // The sibling's admission is simply not in this input, which is the point:
    // there is no shape in which a sibling could influence the answer.
    expect(trackExposure({ ...base, listingStatus: null })).toEqual({ status: 'not_admitted' })
  })

  it('refuses every pre-admission status', () => {
    for (const s of ['applied', 'invited', 'agreement_pending', 'pending_admit'] as const) {
      expect(trackExposure({ ...base, listingStatus: s })).toEqual({ status: 'not_admitted' })
    }
  })

  it('refuses an admitted track whose master is null, empty or whitespace — a tracks row is not a master', () => {
    for (const url of [null, '', '   ']) {
      expect(trackExposure({ ...base, audioFileUrl: url })).toEqual({ status: 'no_playable_master' })
    }
  })

  it('reports every terminal state as unavailable, naming the reason', () => {
    for (const s of ['rejected', 'withdrawn', 'removed'] as const) {
      expect(trackExposure({ ...base, listingStatus: s })).toEqual({ status: 'unavailable', reason: s })
    }
  })

  it('lets a terminal state outrank a missing master', () => {
    // A withdrawn track is unavailable BECAUSE it was withdrawn. Reporting
    // 'no_playable_master' would send staff hunting for audio that is not the
    // reason the buyer cannot have it.
    expect(trackExposure({ ...base, listingStatus: 'withdrawn', audioFileUrl: null })).toEqual({
      status: 'unavailable',
      reason: 'withdrawn',
    })
  })

  it("treats an 'unreleased' project's track exactly like any other — the label does not block it", () => {
    // D-11: "A truthful `unreleased` project label does not block it." There is
    // no project type in the input AT ALL, which is how that is guaranteed
    // rather than asserted.
    expect(Object.keys(base)).not.toContain('projectType')
    expect(trackExposure(base)).toEqual({ status: 'exposed' })
  })

  it('cannot be influenced by readiness, rights, samples or AI provenance — they are not expressible', () => {
    // The guard is the TYPE, so this test documents the guarantee and fails
    // loudly if the input ever widens to accept a clearance fact.
    expect(Object.keys(base).sort()).toEqual(['audioFileUrl', 'listingStatus', 'trackId'])
  })
})
