// ─── Pure audible-time delta math (R13, D-31.2-12 — genuine-accumulator watch-out) ─
// Extracted from useAudibleTimeAccumulator.ts's DOM event handlers
// (31.2-RESEARCH Pattern 4) so "scrub does not count / replay is distinct"
// is unit-tested directly, apart from React/DOM — mirrors
// lib/client-partners/health.ts's "pure function, separately tested from
// its caller" precedent. NEVER a setInterval/Date.now() wall-clock timer
// (Pitfall 1) — every delta here is derived exclusively from consecutive
// audio.currentTime readings.

/** Ticks fire roughly every 250ms during normal playback; anything larger than this is a seek/scrub jump, not audible playback. */
export const CONTIGUITY_CEILING_SECONDS = 2

/**
 * Returns the audible delta to accumulate for a single timeupdate tick.
 * Only a small, forward, contiguous delta counts as audible playback:
 * - lastTime === null (first tick / just resumed after a seek) -> 0
 * - seeking -> 0 (mid-scrub; the element is not audibly playing)
 * - a negative or zero delta (rewind / stall) -> 0
 * - a delta exceeding the contiguity ceiling (a scrub/seek jump) -> 0
 * - otherwise, the delta itself
 */
export function accountForTick(lastTime: number | null, currentTime: number, seeking: boolean): number {
  if (lastTime == null) return 0
  if (seeking) return 0
  const delta = currentTime - lastTime
  if (delta <= 0) return 0
  if (delta > CONTIGUITY_CEILING_SECONDS) return 0
  return delta
}

export type PlaybackSample = { time: number; seeking: boolean }

/**
 * Folds an ordered sequence of (time, seeking) playback samples into total
 * accumulated audible-seconds. A seeking sample breaks the contiguity
 * chain — mirrors the hook's onSeeking handler resetting lastTimeRef to
 * null — so the tick immediately after a seek never counts the jump as a
 * delta; it starts a fresh anchor exactly like a real timeupdate would.
 */
export function foldAudibleSeconds(samples: PlaybackSample[]): number {
  let total = 0
  let lastTime: number | null = null
  for (const sample of samples) {
    if (sample.seeking) {
      lastTime = null
      continue
    }
    total += accountForTick(lastTime, sample.time, false)
    lastTime = sample.time
  }
  return total
}
