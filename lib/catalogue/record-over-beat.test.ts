import { clipEndMs, formatRecorderTime, sessionDurationMs } from './record-over-beat'

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
    expect(sessionDurationMs(5000, [])).toBe(5000)
  })
})
