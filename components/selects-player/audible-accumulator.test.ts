import { accountForTick, foldAudibleSeconds, CONTIGUITY_CEILING_SECONDS, type PlaybackSample } from './audible-accumulator'

describe('accountForTick — pure per-tick delta math (Pitfall 1 guard)', () => {
  it('a forward 0.25s tick during normal playback returns the delta', () => {
    expect(accountForTick(10, 10.25, false)).toBeCloseTo(0.25)
  })

  it('a 40s forward jump (scrub) returns 0', () => {
    expect(accountForTick(10, 50, false)).toBe(0)
  })

  it('a backward jump (rewind) returns 0', () => {
    expect(accountForTick(10, 5, false)).toBe(0)
  })

  it('a tick while seeking returns 0 even for a small forward delta', () => {
    expect(accountForTick(10, 10.25, true)).toBe(0)
  })

  it('the first tick (lastTime null) returns 0', () => {
    expect(accountForTick(null, 10, false)).toBe(0)
  })

  it('a delta exactly at the contiguity ceiling counts', () => {
    expect(accountForTick(10, 10 + CONTIGUITY_CEILING_SECONDS, false)).toBe(CONTIGUITY_CEILING_SECONDS)
  })

  it('a delta just past the contiguity ceiling returns 0', () => {
    expect(accountForTick(10, 10 + CONTIGUITY_CEILING_SECONDS + 0.01, false)).toBe(0)
  })
})

describe('foldAudibleSeconds — sample-sequence fold (scrub-excluded acceptance bar)', () => {
  it('a pure scrub-through-without-play sequence totals ~0', () => {
    const samples: PlaybackSample[] = [
      { time: 0, seeking: false },
      { time: 40, seeking: true }, // user grabs the scrubber, drags to 40s
      { time: 40, seeking: false }, // releases — next tick starts a fresh anchor
    ]
    expect(foldAudibleSeconds(samples)).toBeCloseTo(0)
  })

  it('a contiguous full play totals ~track duration', () => {
    const samples: PlaybackSample[] = []
    for (let t = 0; t <= 10; t += 0.25) samples.push({ time: t, seeking: false })
    expect(foldAudibleSeconds(samples)).toBeCloseTo(10, 1)
  })

  it('resets contiguity after a mid-play seek, discarding the jump', () => {
    const samples: PlaybackSample[] = [
      { time: 0, seeking: false },
      { time: 1, seeking: false }, // 1s audible
      { time: 30, seeking: true }, // scrub forward
      { time: 30, seeking: false }, // fresh anchor
      { time: 31, seeking: false }, // 1s audible after the seek
    ]
    expect(foldAudibleSeconds(samples)).toBeCloseTo(2)
  })

  it('a backward jump inside the fold never subtracts from the total', () => {
    const samples: PlaybackSample[] = [
      { time: 5, seeking: false },
      { time: 6, seeking: false }, // 1s audible
      { time: 2, seeking: false }, // rewind — discarded, not negative-accumulated
      { time: 2.25, seeking: false }, // 0.25s audible from the new anchor
    ]
    expect(foldAudibleSeconds(samples)).toBeCloseTo(1.25)
  })
})
