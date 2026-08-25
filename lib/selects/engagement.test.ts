import {
  QUALIFIED_LISTEN_SECONDS,
  DELTA_CEILING_SECONDS,
  clampDelta,
  aggregatePerTrack,
  aggregateTrack,
  aggregateSelectsRollup,
  type SelectsTrackEngagementRow,
} from './engagement'

function row(overrides: Partial<SelectsTrackEngagementRow> = {}): SelectsTrackEngagementRow {
  return {
    id: 'row-1',
    selects_id: 'selects-1',
    selects_track_id: 'track-1',
    viewer_key: 'viewer-a',
    delta_seconds: 1,
    event: 'heartbeat',
    created_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('QUALIFIED_LISTEN_SECONDS (31-SPEC R13 default)', () => {
  it('is 30', () => {
    expect(QUALIFIED_LISTEN_SECONDS).toBe(30)
  })
})

describe('clampDelta (Pitfall 2 per-heartbeat ceiling, mirrors migration 132 CHECK 0<delta<=15)', () => {
  it('returns n unchanged for 0 < n <= 15', () => {
    expect(clampDelta(0.25)).toBe(0.25)
    expect(clampDelta(15)).toBe(15)
  })

  it('clamps anything above 15 down to the ceiling', () => {
    expect(clampDelta(999999)).toBe(DELTA_CEILING_SECONDS)
    expect(clampDelta(15.01)).toBe(15)
  })

  it('rejects n <= 0 and non-finite values as 0 rather than throwing', () => {
    expect(clampDelta(0)).toBe(0)
    expect(clampDelta(-5)).toBe(0)
    expect(clampDelta(NaN)).toBe(0)
    expect(clampDelta(Infinity)).toBe(0)
  })
})

describe('aggregatePerTrack — rows pre-scoped to one (track, viewer) pair', () => {
  it('marks 29.9s summed audible as NOT qualified', () => {
    const rows = [row({ delta_seconds: 15 }), row({ delta_seconds: 14.9 })]
    const out = aggregatePerTrack(rows)
    expect(out.audibleSeconds).toBeCloseTo(29.9)
    expect(out.qualified).toBe(false)
  })

  it('marks exactly 30.0s summed audible as qualified', () => {
    const rows = [row({ delta_seconds: 15 }), row({ delta_seconds: 15 })]
    const out = aggregatePerTrack(rows)
    expect(out.audibleSeconds).toBe(30)
    expect(out.qualified).toBe(true)
  })

  it('scrubbing without audible playback (zero delta rows) never records a listen', () => {
    const out = aggregatePerTrack([])
    expect(out.audibleSeconds).toBe(0)
    expect(out.qualified).toBe(false)
    expect(out.replayCount).toBe(0)
  })

  it('counts two ended events as two distinct replays', () => {
    const rows = [
      row({ delta_seconds: 15, event: 'ended' }),
      row({ delta_seconds: 15, event: 'heartbeat' }),
      row({ delta_seconds: 15, event: 'ended' }),
    ]
    const out = aggregatePerTrack(rows)
    expect(out.replayCount).toBe(2)
  })

  it('never multiplies qualified by replays — stays exactly one qualified boolean past threshold', () => {
    const rows = [
      row({ delta_seconds: 15, event: 'ended' }),
      row({ delta_seconds: 15, event: 'ended' }),
      row({ delta_seconds: 15, event: 'ended' }),
    ]
    const out = aggregatePerTrack(rows)
    expect(out.qualified).toBe(true)
    expect(out.replayCount).toBe(3)
  })
})

describe('aggregateTrack — one track, multiple viewers, grouped by viewer_key', () => {
  it('counts qualifiedListens once per viewer who crossed the threshold, not per delta', () => {
    const rows = [
      row({ viewer_key: 'viewer-a', delta_seconds: 15 }),
      row({ viewer_key: 'viewer-a', delta_seconds: 15 }), // viewer-a totals 30 -> qualified
      row({ viewer_key: 'viewer-b', delta_seconds: 5 }), // viewer-b totals 5 -> not qualified
    ]
    const out = aggregateTrack('track-1', rows)
    expect(out.selectsTrackId).toBe('track-1')
    expect(out.audibleSeconds).toBe(35)
    expect(out.qualifiedListens).toBe(1)
  })

  it('sums replay counts across all viewers', () => {
    const rows = [
      row({ viewer_key: 'viewer-a', event: 'ended' }),
      row({ viewer_key: 'viewer-b', event: 'ended' }),
      row({ viewer_key: 'viewer-b', event: 'ended' }),
    ]
    const out = aggregateTrack('track-1', rows)
    expect(out.replayCount).toBe(3)
  })

  it('treats a null viewer_key as its own single group', () => {
    const rows = [
      row({ viewer_key: null, delta_seconds: 15 }),
      row({ viewer_key: null, delta_seconds: 15 }),
    ]
    const out = aggregateTrack('track-1', rows)
    expect(out.qualifiedListens).toBe(1)
  })
})

describe('aggregateSelectsRollup — folds already-computed per-track aggregates, no stored total', () => {
  it('sums per-track audible seconds/qualifiedListens/replayCount across tracks', () => {
    const tracks = [
      { selectsTrackId: 't1', audibleSeconds: 40, qualifiedListens: 1, replayCount: 0 },
      { selectsTrackId: 't2', audibleSeconds: 10, qualifiedListens: 0, replayCount: 1 },
    ]
    const out = aggregateSelectsRollup(tracks)
    expect(out).toEqual({ audibleSeconds: 50, qualifiedListens: 1, replayCount: 1, trackCount: 2 })
  })

  it('an empty track list rolls up to all-zero, not a stored default', () => {
    expect(aggregateSelectsRollup([])).toEqual({ audibleSeconds: 0, qualifiedListens: 0, replayCount: 0, trackCount: 0 })
  })
})
