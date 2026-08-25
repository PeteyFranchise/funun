// ─── Selects engagement — server contract + read-time aggregation (R13, D-31.2-12/13) ─
// Pure, compute-on-read aggregation over migration 132's raw
// selects_track_engagement delta rows — mirrors lib/client-partners/
// health.ts's "pure function, separately tested from its I/O caller"
// precedent. No supabase import, no fetch: plan 05 (the write route) and
// plan 10 (the read rollups) own all I/O and pass already-fetched rows
// into these functions — D-06 compute-on-read doctrine, never a stored
// running total.

/** 31-SPEC R13 default: audible time at/above this threshold is a qualified listen. */
export const QUALIFIED_LISTEN_SECONDS = 30

/** Mirrors migration 132's CHECK (0 < delta_seconds <= 15) — the per-heartbeat abuse ceiling (Pitfall 2). */
export const DELTA_CEILING_SECONDS = 15

export type EngagementEvent = 'heartbeat' | 'pause' | 'ended' | 'unload'

// Mirrors migration 132's selects_track_engagement columns exactly.
export type SelectsTrackEngagementRow = {
  id: string
  selects_id: string
  selects_track_id: string
  viewer_key: string | null
  delta_seconds: number
  event: EngagementEvent
  created_at: string
}

/**
 * Clamps a single client-reported delta to the per-heartbeat ceiling
 * (Pitfall 2) before it is persisted or aggregated. A delta that is <= 0
 * or non-finite is not real audible playback time — rejected as 0 rather
 * than thrown, so one malformed/duplicate flush never aborts an
 * aggregation pass over a batch of rows. The DB CHECK (migration 132) is
 * the defense-in-depth backstop if this contract is ever bypassed.
 */
export function clampDelta(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, DELTA_CEILING_SECONDS)
}

export type PerViewerTrackAggregate = {
  audibleSeconds: number
  qualified: boolean
  replayCount: number
}

/**
 * Aggregates raw delta rows already scoped to a single (track, viewer)
 * pair. audibleSeconds is a straight sum (D-06 — no stored running
 * total); qualified is a single boolean, never multiplied by replays
 * (R13 acceptance: past-threshold audible == exactly one qualified
 * listen per track+viewer); replayCount counts every 'ended' event
 * distinctly — a replay is distinct from a resume-after-pause, which
 * never emits 'ended'.
 */
export function aggregatePerTrack(
  rows: Pick<SelectsTrackEngagementRow, 'delta_seconds' | 'event'>[]
): PerViewerTrackAggregate {
  const audibleSeconds = rows.reduce((sum, row) => sum + row.delta_seconds, 0)
  const replayCount = rows.filter(row => row.event === 'ended').length
  return {
    audibleSeconds,
    qualified: audibleSeconds >= QUALIFIED_LISTEN_SECONDS,
    replayCount,
  }
}

export type TrackEngagement = {
  selectsTrackId: string
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
}

/**
 * Aggregates raw delta rows for ONE track across all viewers — groups by
 * viewer_key (a null viewer_key is its own single group), applies
 * aggregatePerTrack per viewer group, then sums. qualifiedListens counts
 * the viewers who crossed the threshold, never per-delta and never
 * inflated by replays.
 */
export function aggregateTrack(
  selectsTrackId: string,
  rows: Pick<SelectsTrackEngagementRow, 'viewer_key' | 'delta_seconds' | 'event'>[]
): TrackEngagement {
  const byViewer = new Map<string, Pick<SelectsTrackEngagementRow, 'delta_seconds' | 'event'>[]>()
  for (const row of rows) {
    const key = row.viewer_key ?? '__null__'
    const bucket = byViewer.get(key)
    if (bucket) bucket.push(row)
    else byViewer.set(key, [row])
  }

  let audibleSeconds = 0
  let qualifiedListens = 0
  let replayCount = 0
  for (const viewerRows of byViewer.values()) {
    const agg = aggregatePerTrack(viewerRows)
    audibleSeconds += agg.audibleSeconds
    replayCount += agg.replayCount
    if (agg.qualified) qualifiedListens += 1
  }

  return { selectsTrackId, audibleSeconds, qualifiedListens, replayCount }
}

export type SelectsEngagementRollup = {
  audibleSeconds: number
  qualifiedListens: number
  replayCount: number
  trackCount: number
}

/**
 * Folds already-computed per-track aggregates into a Selects-level
 * summary — a pure sum, no stored total (D-06). Callers pass the output
 * of aggregateTrack for each track in the Selects; this never re-reads
 * raw rows itself.
 */
export function aggregateSelectsRollup(tracks: TrackEngagement[]): SelectsEngagementRollup {
  return tracks.reduce<SelectsEngagementRollup>(
    (acc, t) => ({
      audibleSeconds: acc.audibleSeconds + t.audibleSeconds,
      qualifiedListens: acc.qualifiedListens + t.qualifiedListens,
      replayCount: acc.replayCount + t.replayCount,
      trackCount: acc.trackCount + 1,
    }),
    { audibleSeconds: 0, qualifiedListens: 0, replayCount: 0, trackCount: 0 }
  )
}
