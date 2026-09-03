export type RecordingClip = {
  id: string
  serverId?: string
  position?: number
  trimStartMs?: number
  trimEndMs?: number
  muted?: boolean
  removed?: boolean
  blob: Blob
  url: string
  startMs: number
  durationMs: number
  buffer: AudioBuffer
}

export const DRY_VOCAL_STEM_LEVELS = { beatGain: 0, vocalGain: 1 } as const

export function clipTimelineWindow(
  clip: Pick<RecordingClip, 'startMs' | 'durationMs' | 'trimStartMs' | 'trimEndMs'>,
  timingOffsetMs = 0
) {
  const trimStartMs = Math.max(0, clip.trimStartMs ?? 0)
  const trimEndMs = Math.max(0, clip.trimEndMs ?? 0)
  const rawStartMs = clip.startMs + timingOffsetMs + trimStartMs
  const beforeTimelineMs = Math.max(0, -rawStartMs)
  const sourceOffsetMs = trimStartMs + beforeTimelineMs
  const playableDurationMs = Math.max(0, clip.durationMs - sourceOffsetMs - trimEndMs)
  const timelineStartMs = Math.max(0, rawStartMs)
  return { timelineStartMs, sourceOffsetMs, playableDurationMs, timelineEndMs: timelineStartMs + playableDurationMs }
}

export function clipEndMs(clip: Pick<RecordingClip, 'startMs' | 'durationMs' | 'trimStartMs' | 'trimEndMs'>, timingOffsetMs = 0): number {
  return clipTimelineWindow(clip, timingOffsetMs).timelineEndMs
}

export function clipOverlapsRange(
  clip: Pick<RecordingClip, 'startMs' | 'durationMs' | 'trimStartMs' | 'trimEndMs'>,
  rangeStartMs: number,
  rangeEndMs: number,
  timingOffsetMs = 0
): boolean {
  const window = clipTimelineWindow(clip, timingOffsetMs)
  return window.timelineStartMs < rangeEndMs && window.timelineEndMs > rangeStartMs
}

export function waveformPeaks(
  buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'getChannelData'>,
  barCount: number
): number[] {
  if (barCount <= 0 || buffer.length <= 0 || buffer.numberOfChannels <= 0) return []
  const bars: number[] = []
  for (let bar = 0; bar < barCount; bar += 1) {
    const from = Math.floor((bar / barCount) * buffer.length)
    const to = Math.max(from + 1, Math.floor(((bar + 1) / barCount) * buffer.length))
    let peak = 0
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const samples = buffer.getChannelData(channel)
      for (let index = from; index < to && index < samples.length; index += 1) {
        peak = Math.max(peak, Math.abs(samples[index] ?? 0))
      }
    }
    bars.push(peak)
  }
  const maximum = Math.max(...bars, 0.001)
  return bars.map(peak => Math.max(0.08, peak / maximum))
}

export function sessionDurationMs(
  backingDurationMs: number,
  clips: Pick<RecordingClip, 'startMs' | 'durationMs' | 'trimStartMs' | 'trimEndMs'>[],
  timingOffsetMs = 0
): number {
  return Math.max(backingDurationMs, ...clips.map(clip => clipEndMs(clip, timingOffsetMs)), 1)
}

export function formatRecorderTime(totalMs: number): string {
  const seconds = Math.max(0, Math.floor(totalMs / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

/** Encodes an AudioBuffer as 16-bit PCM WAV for a portable immutable rough mix. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const sampleCount = buffer.length
  const bytesPerSample = 2
  const dataLength = sampleCount * channels * bytesPerSample
  const array = new ArrayBuffer(44 + dataLength)
  const view = new DataView(array)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  let offset = 44
  for (let frame = 0; frame < sampleCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]![frame] ?? 0))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += bytesPerSample
    }
  }
  return new Blob([array], { type: 'audio/wav' })
}

export async function renderRoughMix(input: {
  backing: AudioBuffer
  clips: RecordingClip[]
  beatGain: number
  vocalGain: number
  timingOffsetMs: number
}): Promise<AudioBuffer> {
  const durationMs = sessionDurationMs(
    Math.round(input.backing.duration * 1000),
    input.clips.filter(clip => !clip.muted && !clip.removed),
    input.timingOffsetMs
  )
  const sampleRate = Math.min(48000, Math.max(22050, input.backing.sampleRate))
  const frameCount = Math.ceil((durationMs / 1000) * sampleRate)
  const context = new OfflineAudioContext(2, frameCount, sampleRate)

  const beat = context.createBufferSource()
  const beatLevel = context.createGain()
  beat.buffer = input.backing
  beatLevel.gain.value = input.beatGain
  beat.connect(beatLevel).connect(context.destination)
  beat.start(0)

  for (const clip of input.clips) {
    if (clip.muted || clip.removed) continue
    const window = clipTimelineWindow(clip, input.timingOffsetMs)
    if (window.playableDurationMs <= 0) continue
    const source = context.createBufferSource()
    const level = context.createGain()
    source.buffer = clip.buffer
    level.gain.value = input.vocalGain
    source.connect(level).connect(context.destination)
    source.start(window.timelineStartMs / 1000, window.sourceOffsetMs / 1000, window.playableDurationMs / 1000)
  }

  return context.startRendering()
}

/** Renders the approved comp at unity vocal gain on a zero-aligned silent backing timeline. */
export async function renderDryVocalStem(input: {
  backing: AudioBuffer
  clips: RecordingClip[]
  timingOffsetMs: number
}): Promise<AudioBuffer> {
  return renderRoughMix({
    backing: input.backing,
    clips: input.clips,
    ...DRY_VOCAL_STEM_LEVELS,
    timingOffsetMs: input.timingOffsetMs,
  })
}
