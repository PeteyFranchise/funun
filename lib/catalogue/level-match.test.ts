import { levelMatchedVolumes, rmsFromChannels } from './level-match'

describe('approximate comparison level matching', () => {
  it('measures channel RMS and attenuates only the louder side', () => {
    expect(rmsFromChannels([new Float32Array([0.5, -0.5, 0.5, -0.5])])).toBeCloseTo(0.5)
    expect(levelMatchedVolumes(0.5, 0.25)).toEqual({ a: 0.5, b: 1 })
    expect(levelMatchedVolumes(0.2, 0.4)).toEqual({ a: 1, b: 0.5 })
  })

  it('fails neutral for silent or invalid analysis and never boosts', () => {
    expect(levelMatchedVolumes(0, 0.3)).toEqual({ a: 1, b: 1 })
    expect(levelMatchedVolumes(Number.NaN, 0.3)).toEqual({ a: 1, b: 1 })
    expect(levelMatchedVolumes(100, 0.01).a).toBe(0.1)
  })
})
