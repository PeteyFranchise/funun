import {
  PEAKS_BAR_COUNT,
  REST_BAR_HEIGHT_PERCENT,
  isValidPeaksPayload,
  levelMatchedPeaks,
  peaksFromBuffer,
  scalePeaksToPercent,
} from './waveform'

describe('waveform peaks', () => {
  it('scales normalized peaks to rounded 0..100 percent heights', () => {
    expect(scalePeaksToPercent([0.08, 0.5, 1])).toEqual([8, 50, 100])
  })

  it('clamps out-of-range peaks into 0..100 and drops non-finite values to 0', () => {
    expect(scalePeaksToPercent([-0.5, 1.5, NaN, Infinity, -Infinity])).toEqual([0, 100, 0, 0, 0])
  })

  it('validates a peaks payload by exact cardinality and per-value integer range', () => {
    expect(isValidPeaksPayload(new Array(PEAKS_BAR_COUNT).fill(50))).toBe(true)
    expect(isValidPeaksPayload(new Array(199).fill(50))).toBe(false)
    expect(isValidPeaksPayload(new Array(200).fill(50))).toBe(true)
    expect(isValidPeaksPayload(new Array(201).fill(50))).toBe(false)
    expect(isValidPeaksPayload([...new Array(199).fill(50), 12.5])).toBe(false)
    expect(isValidPeaksPayload([...new Array(199).fill(50), -1])).toBe(false)
    expect(isValidPeaksPayload([...new Array(199).fill(50), 101])).toBe(false)
    expect(isValidPeaksPayload('not an array')).toBe(false)
    expect(isValidPeaksPayload([...new Array(199).fill(50), null])).toBe(false)
  })

  it('level-matches a drawn waveform to what its playback actually sounds like', () => {
    expect(levelMatchedPeaks([2, 10, 100], 0.5)).toEqual([1, 5, 50])
    expect(levelMatchedPeaks([2, 10, 100], 1)).toEqual([2, 10, 100])
  })

  it('floors a level-matched bar at 1 so a quiet side still draws a visible strip', () => {
    expect(levelMatchedPeaks([1], 0.1)).toEqual([1])
  })

  it('defines the rest-state bar height', () => {
    expect(REST_BAR_HEIGHT_PERCENT).toBe(15)
  })

  it('extracts and scales peaks from a decoded buffer using the reused waveformPeaks algorithm', () => {
    const samples = new Float32Array([0, 0.25, -0.5, 1])
    const peaks = peaksFromBuffer(
      { length: samples.length, numberOfChannels: 1, getChannelData: () => samples },
      2
    )
    expect(peaks).toEqual([25, 100])
  })
})
