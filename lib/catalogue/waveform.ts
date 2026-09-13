// ─── Waveform peaks ─────────────────────────────────────────────────────────
// A take's shape is extracted once, client-side, at creation (D-01). A
// missing peaks array means "not extracted yet" — never "draw something
// decorative". The peak-picking algorithm itself lives in
// lib/catalogue/record-over-beat.ts and is reused here, not reimplemented.
// The AudioContext lifecycle mirrors lib/catalogue/level-match.ts exactly:
// one context per call, closed in a finally.

import { waveformPeaks } from '@/lib/catalogue/record-over-beat'

export const PEAKS_BAR_COUNT = 200
export const REST_BAR_HEIGHT_PERCENT = 15

/** Maps each normalized 0..1 peak to a rounded 0..100 percent bar height,
 * clamping any out-of-range or non-finite input into range. */
export function scalePeaksToPercent(peaks: number[]): number[] {
  return peaks.map(peak => {
    const value = Number.isFinite(peak) ? Math.round(peak * 100) : 0
    return Math.max(0, Math.min(100, value))
  })
}

/** True only when `value` is an array of exactly PEAKS_BAR_COUNT integers,
 * each within 0..100. This is the single shared rule — the route schema
 * (39-03) and both players call it rather than re-stating the bounds. Kept
 * dependency-free so a Next.js route handler can import it. */
export function isValidPeaksPayload(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== PEAKS_BAR_COUNT) return false
  return value.every(
    entry => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= 100
  )
}

/** D-02's mechanism: the A/B panel draws what its level-matched playback
 * actually sounds like. Scales each bar by `volume`, rounds, and clamps into
 * 0..100, flooring at 1 so a quiet side still draws a visible strip. A
 * volume of 1, or a non-finite volume, returns the input unchanged. */
export function levelMatchedPeaks(peaks: number[], volume: number): number[] {
  if (volume === 1 || !Number.isFinite(volume)) return peaks
  return peaks.map(peak => {
    const scaled = Math.round(peak * volume)
    return Math.max(1, Math.min(100, scaled))
  })
}

/** Extracts and scales peaks from an already-decoded buffer — the hum /
 * record-over path, where the browser already holds a decoded buffer and
 * must not decode a second time. */
export function peaksFromBuffer(
  buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'getChannelData'>,
  barCount = PEAKS_BAR_COUNT
): number[] {
  return scalePeaksToPercent(waveformPeaks(buffer, barCount))
}

async function decodePeaks(arrayBuffer: ArrayBuffer, barCount: number): Promise<number[]> {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(arrayBuffer)
    return peaksFromBuffer(buffer, barCount)
  } catch {
    throw new Error("Could not read this take's waveform.")
  } finally {
    await context.close().catch(() => undefined)
  }
}

/** The plain-upload path: decodes the Blob the browser already holds before
 * or after it uploads. */
export async function extractPeaksFromBlob(blob: Blob, barCount = PEAKS_BAR_COUNT): Promise<number[]> {
  return decodePeaks(await blob.arrayBuffer(), barCount)
}

/** D-03's lazy backfill entry point — fetches a signed playback URL and
 * decodes it through the same path as a fresh upload. */
export async function extractPeaksFromUrl(url: string, barCount = PEAKS_BAR_COUNT): Promise<number[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Could not load this take's audio to extract its waveform.")
  return decodePeaks(await response.arrayBuffer(), barCount)
}
