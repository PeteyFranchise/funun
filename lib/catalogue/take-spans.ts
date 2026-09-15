// ─── Range comments ─────────────────────────────────────────────────────────
// A span is creative context only and never moves automatically between
// takes. Every function here is pure geometry/arithmetic — no component or
// network import belongs in this file.

/** Wide enough to filter an accidental tap-drag, tight enough not to block a
 * legitimate vocal-comp span, and deliberately a named constant so changing
 * it later is one line. */
export const MIN_SPAN_MS = 250

/** D-04: a drag narrower than MIN_SPAN_MS snaps back with no confirm
 * affordance — returning null rather than a degenerate span is what makes
 * that implementable without a second guard in the component. Rounds both
 * inputs, orders them low-to-high, and clamps both into 0..durationMs. */
export function normalizeSpanDrag(
  anchorMs: number,
  pointerMs: number,
  durationMs: number
): { startMs: number; endMs: number } | null {
  const anchor = Math.round(anchorMs)
  const pointer = Math.round(pointerMs)
  const lowMs = Math.min(anchor, pointer)
  const highMs = Math.max(anchor, pointer)
  const startMs = Math.max(0, Math.min(durationMs, lowMs))
  const endMs = Math.max(0, Math.min(durationMs, highMs))
  if (endMs - startMs < MIN_SPAN_MS) return null
  return { startMs, endMs }
}

/** Returns the shaded band's CSS percentages, defensively clamped so left is
 * 0..100 and left + width never exceeds 100. */
export function spanGeometry(
  startMs: number,
  endMs: number,
  durationMs: number
): { leftPercent: number; widthPercent: number } {
  if (durationMs <= 0) return { leftPercent: 0, widthPercent: 0 }
  const leftPercent = Math.max(0, Math.min(100, (startMs / durationMs) * 100))
  const rawWidthPercent = ((endMs - startMs) / durationMs) * 100
  const widthPercent = Math.max(0, Math.min(100 - leftPercent, rawWidthPercent))
  return { leftPercent, widthPercent }
}

/** The client-side twin of the SQL clamp in migration 224's
 * `review_work_version_comment_carry()`. Mirrors it exactly, including the
 * one-millisecond start reservation: without it a clamped start lands on the
 * bound and forces an end one millisecond past it, which the database
 * rejects and would roll the whole carry batch back. */
export function clampCarriedSpan(input: {
  startMs: number
  endMs: number | null
  targetDurationMs: number | null
}): { startMs: number; endMs: number | null; needsReposition: boolean } {
  const { startMs, endMs, targetDurationMs } = input
  if (targetDurationMs === null) {
    return { startMs, endMs, needsReposition: false }
  }
  const needsReposition = startMs > targetDurationMs
  if (endMs === null) {
    return { startMs: Math.min(startMs, targetDurationMs), endMs: null, needsReposition }
  }
  const clampedStart = Math.min(startMs, Math.max(0, targetDurationMs - 1))
  const clampedEnd = Math.max(clampedStart + 1, Math.min(endMs, targetDurationMs))
  return { startMs: clampedStart, endMs: clampedEnd, needsReposition }
}

/** True only when a duration is known and the in-point exceeds it. The
 * carry-offer list in TimedTrackPlayer uses this to flag an offered comment
 * before it is carried; the stored `needs_reposition` column covers it
 * after. */
export function spanNeedsReposition(input: { timestampMs: number; durationMs: number | null }): boolean {
  return input.durationMs !== null && input.timestampMs > input.durationMs
}
