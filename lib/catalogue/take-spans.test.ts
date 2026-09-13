import { MIN_SPAN_MS, clampCarriedSpan, normalizeSpanDrag, spanGeometry, spanNeedsReposition } from './take-spans'

describe('take spans', () => {
  it('rejects a drag narrower than the minimum span', () => {
    expect(normalizeSpanDrag(4000, 4100, 60000)).toBeNull()
  })

  it('returns an ordered span for a forward drag', () => {
    expect(normalizeSpanDrag(4000, 9000, 60000)).toEqual({ startMs: 4000, endMs: 9000 })
  })

  it('orders a backwards drag the same as a forward one', () => {
    expect(normalizeSpanDrag(9000, 4000, 60000)).toEqual({ startMs: 4000, endMs: 9000 })
  })

  it('clamps an out-of-bounds drag into the take duration', () => {
    expect(normalizeSpanDrag(-500, 70000, 60000)).toEqual({ startMs: 0, endMs: 60000 })
  })

  it('computes shaded-band CSS percentages', () => {
    expect(spanGeometry(15000, 30000, 60000)).toEqual({ leftPercent: 25, widthPercent: 25 })
  })

  it('never lets a span geometry go negative or exceed the full width', () => {
    const geometry = spanGeometry(55000, 65000, 60000)
    expect(geometry.leftPercent).toBeGreaterThanOrEqual(0)
    expect(geometry.widthPercent).toBeGreaterThanOrEqual(0)
    expect(geometry.leftPercent + geometry.widthPercent).toBeLessThanOrEqual(100)
  })

  it('returns zero geometry for a non-positive duration', () => {
    expect(spanGeometry(0, 1000, 0)).toEqual({ leftPercent: 0, widthPercent: 0 })
  })

  it('D-07: clamps a carried span whose in-point exceeds the new take, never collapsing it to a point', () => {
    const result = clampCarriedSpan({ startMs: 50000, endMs: 58000, targetDurationMs: 40000 })
    expect(result.endMs).not.toBeNull()
    expect(result.endMs!).toBeGreaterThan(result.startMs)
    expect(result.needsReposition).toBe(true)
  })

  it('leaves a carried span untouched when it already fits', () => {
    expect(clampCarriedSpan({ startMs: 5000, endMs: 9000, targetDurationMs: 40000 })).toEqual({
      startMs: 5000,
      endMs: 9000,
      needsReposition: false,
    })
  })

  it('never turns a carried point comment into a span', () => {
    expect(clampCarriedSpan({ startMs: 5000, endMs: null, targetDurationMs: 40000 })).toEqual({
      startMs: 5000,
      endMs: null,
      needsReposition: false,
    })
  })

  it('returns the input untouched when the target take has no known duration', () => {
    expect(clampCarriedSpan({ startMs: 5000, endMs: 9000, targetDurationMs: null })).toEqual({
      startMs: 5000,
      endMs: 9000,
      needsReposition: false,
    })
  })

  it('flags a comment whose in-point exceeds a known duration, but not against an unknown one', () => {
    expect(spanNeedsReposition({ timestampMs: 50000, durationMs: 40000 })).toBe(true)
    expect(spanNeedsReposition({ timestampMs: 50000, durationMs: null })).toBe(false)
  })

  it('defines the minimum usable span length', () => {
    expect(MIN_SPAN_MS).toBe(250)
  })
})
