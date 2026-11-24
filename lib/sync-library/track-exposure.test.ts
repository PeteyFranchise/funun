import {
  trackExposure,
  isTrackExposed,
  resolveListingStatus,
  type TrackExposureInput,
} from '@/lib/sync-library/track-exposure'

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

// ─── resolveListingStatus ─────────────────────────────────────────────────
// Terminal rows accumulate by design: sync_listings_active_track_uniq
// (096_sync_library.sql:63) is a PARTIAL unique index over the five active
// statuses, and re-submission after a terminal outcome is explicitly allowed.
// So history can sit beside the present, and trackExposure's terminal-first
// ranking would read the history if the caller handed it over.
describe('resolveListingStatus — the active row wins, terminal rows are history', () => {
  it('returns null for a track that has never been listed', () => {
    expect(resolveListingStatus([])).toBeNull()
  })

  it('returns the only status when there is one row', () => {
    expect(resolveListingStatus([{ status: 'admitted' }])).toBe('admitted')
  })

  it('prefers the ACTIVE row over an older terminal row — the re-admission case', () => {
    // Withdrawn last month, re-applied and admitted since. Reading the
    // withdrawal would hide a live track forever, which is the bug this
    // function exists to prevent.
    const resolved = resolveListingStatus([
      { status: 'withdrawn', created_at: '2026-09-01T00:00:00Z' },
      { status: 'admitted', created_at: '2026-10-01T00:00:00Z' },
    ])
    expect(resolved).toBe('admitted')
    expect(trackExposure({ ...base, listingStatus: resolved })).toEqual({ status: 'exposed' })
  })

  it('prefers the active row even when the terminal row is NEWER', () => {
    // Order and recency are both irrelevant against an active row: the partial
    // unique index guarantees at most one, so its existence is the answer.
    expect(
      resolveListingStatus([
        { status: 'admitted', created_at: '2026-09-01T00:00:00Z' },
        { status: 'rejected', created_at: '2026-10-01T00:00:00Z' },
      ])
    ).toBe('admitted')
  })

  it('falls back to the LATEST terminal row when no active row exists', () => {
    const resolved = resolveListingStatus([
      { status: 'rejected', created_at: '2026-08-01T00:00:00Z' },
      { status: 'withdrawn', created_at: '2026-09-01T00:00:00Z' },
    ])
    expect(resolved).toBe('withdrawn')
    expect(trackExposure({ ...base, listingStatus: resolved })).toEqual({
      status: 'unavailable',
      reason: 'withdrawn',
    })
  })

  it('is independent of row order', () => {
    const rows = [
      { status: 'withdrawn' as const, created_at: '2026-09-01T00:00:00Z' },
      { status: 'rejected' as const, created_at: '2026-08-01T00:00:00Z' },
    ]
    expect(resolveListingStatus(rows)).toBe('withdrawn')
    expect(resolveListingStatus([...rows].reverse())).toBe('withdrawn')
  })

  it('recognises every pre-admission active status, not just admitted', () => {
    for (const status of ['applied', 'invited', 'agreement_pending', 'pending_admit'] as const) {
      expect(resolveListingStatus([{ status: 'removed', created_at: '2026-10-05T00:00:00Z' }, { status }])).toBe(
        status
      )
      // Active-but-not-admitted is still not exposed — that is trackExposure's
      // job, and this function must not quietly answer it.
      expect(trackExposure({ ...base, listingStatus: status })).toEqual({ status: 'not_admitted' })
    }
  })
})
