import { clipEndMs, clipOverlapsRange, clipTimelineWindow, DRY_VOCAL_STEM_LEVELS, formatRecorderTime, sessionDurationMs, waveformPeaks } from './record-over-beat'

describe('record-over-beat timeline helpers', () => {
  it('formats recorder time without rounding ahead', () => {
    expect(formatRecorderTime(0)).toBe('0:00')
    expect(formatRecorderTime(65999)).toBe('1:05')
  })

  it('applies timing compensation without allowing a negative start', () => {
    expect(clipEndMs({ startMs: 100, durationMs: 900 }, -250)).toBe(750)
    expect(clipEndMs({ startMs: 2000, durationMs: 500 }, 120)).toBe(2620)
  })

  it('keeps the session at least as long as its backing or latest clip', () => {
    expect(sessionDurationMs(5000, [{ startMs: 4800, durationMs: 1000 }])).toBe(5800)
    expect(sessionDurationMs(5000, [{ startMs: 4800, durationMs: 1000, trimEndMs: 400 }])).toBe(5400)
    expect(sessionDurationMs(5000, [])).toBe(5000)
  })

  it('applies non-destructive trims to the source and timeline window', () => {
    expect(clipTimelineWindow({ startMs: 1000, durationMs: 2000, trimStartMs: 250, trimEndMs: 500 })).toEqual({
      timelineStartMs: 1250, sourceOffsetMs: 250, playableDurationMs: 1250, timelineEndMs: 2500,
    })
    expect(clipOverlapsRange({ startMs: 1000, durationMs: 500 }, 1400, 1600)).toBe(true)
    expect(clipOverlapsRange({ startMs: 1000, durationMs: 500 }, 1500, 1600)).toBe(false)
  })

  it('derives normalized waveform bars from real samples', () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1])
    const peaks = waveformPeaks({ length: samples.length, numberOfChannels: 1, getChannelData: () => samples }, 2)
    expect(peaks).toEqual([0.25, 1])
  })

  it('renders producer stems with no beat and unity dry-vocal gain', () => {
    expect(DRY_VOCAL_STEM_LEVELS).toEqual({ beatGain: 0, vocalGain: 1 })
  })
})
