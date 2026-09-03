export type RecordingClip = {
  id: string
  serverId?: string
  position?: number
  blob: Blob
  url: string
  startMs: number
  durationMs: number
  buffer: AudioBuffer
}

export function clipEndMs(clip: Pick<RecordingClip, 'startMs' | 'durationMs'>, timingOffsetMs = 0): number {
  return Math.max(0, clip.startMs + timingOffsetMs + clip.durationMs)
}

export function sessionDurationMs(
  backingDurationMs: number,
  clips: Pick<RecordingClip, 'startMs' | 'durationMs'>[],
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
    input.clips,
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
    const source = context.createBufferSource()
    const level = context.createGain()
    source.buffer = clip.buffer
    level.gain.value = input.vocalGain
    source.connect(level).connect(context.destination)
    const rawStartSeconds = (clip.startMs + input.timingOffsetMs) / 1000
    source.start(Math.max(0, rawStartSeconds), Math.max(0, -rawStartSeconds))
  }

  return context.startRendering()
}
