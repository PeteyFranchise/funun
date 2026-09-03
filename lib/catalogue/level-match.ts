const MAX_ANALYSIS_SAMPLES_PER_CHANNEL = 200_000

export function rmsFromChannels(channels: Float32Array[]): number {
  let sumSquares = 0
  let count = 0
  for (const channel of channels) {
    const stride = Math.max(1, Math.ceil(channel.length / MAX_ANALYSIS_SAMPLES_PER_CHANNEL))
    for (let index = 0; index < channel.length; index += stride) {
      const sample = channel[index] ?? 0
      sumSquares += sample * sample
      count += 1
    }
  }
  return count > 0 ? Math.sqrt(sumSquares / count) : 0
}

/** Attenuates the louder side to the quieter side; it never boosts or changes audio files. */
export function levelMatchedVolumes(rmsA: number, rmsB: number): { a: number; b: number } {
  if (!Number.isFinite(rmsA) || !Number.isFinite(rmsB) || rmsA <= 0 || rmsB <= 0) {
    return { a: 1, b: 1 }
  }
  const target = Math.min(rmsA, rmsB)
  return {
    a: Math.max(0.1, Math.min(1, target / rmsA)),
    b: Math.max(0.1, Math.min(1, target / rmsB)),
  }
}

async function decodeRms(context: AudioContext, url: string): Promise<number> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load a take for level matching.')
  const buffer = await context.decodeAudioData(await response.arrayBuffer())
  return rmsFromChannels(Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)))
}

export async function analyzePlaybackLevels(urlA: string, urlB: string): Promise<{ a: number; b: number }> {
  const context = new AudioContext()
  try {
    const [rmsA, rmsB] = await Promise.all([decodeRms(context, urlA), decodeRms(context, urlB)])
    return levelMatchedVolumes(rmsA, rmsB)
  } finally {
    await context.close().catch(() => undefined)
  }
}
