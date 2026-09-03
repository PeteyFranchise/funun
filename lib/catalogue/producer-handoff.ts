export const PRODUCER_HANDOFF_NOTE_MAX = 1000
export const PRODUCER_HANDOFF_ROUND_LABEL_MAX = 80
export const PRODUCER_HANDOFF_KEY_MAX = 24
export const PRODUCER_HANDOFF_REFERENCE_MAX = 500

export type ProducerFeedbackStatus = 'done' | 'tried' | 'discuss'

export type ProducerFeedbackSnapshot = {
  feedbackId: string
  versionId: string
  versionDisplay: string
  timestampMs: number
  body: string
  authorUserId: string | null
  authorName: string
}

export type ProducerFeedbackResponse = {
  feedbackId: string
  status: ProducerFeedbackStatus
}

export type ProducerHandoffStage = 'sent' | 'received' | 'working' | 'returned' | 'reviewed'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ProducerHandoffRecipient = {
  userId: string
  name: string
}

export function buildProducerVocalPath(workId: string, sessionId: string, handoffId: string): string {
  if (![workId, sessionId, handoffId].every(value => UUID.test(value))) {
    throw new Error('Invalid producer handoff reference.')
  }
  return `${workId}/recording-sessions/${sessionId}/handoffs/${handoffId}-dry-vocal.wav`
}

export function normalizeHandoffNote(value: string): string | null {
  const note = value.trim()
  return note ? note.slice(0, PRODUCER_HANDOFF_NOTE_MAX) : null
}

export function normalizeHandoffRoundLabel(value: string): string | null {
  const label = value.trim()
  return label ? label.slice(0, PRODUCER_HANDOFF_ROUND_LABEL_MAX) : null
}

export function normalizeMusicalKey(value: string): string | null {
  const key = value.trim().replace(/\s+/g, ' ')
  return key ? key.slice(0, PRODUCER_HANDOFF_KEY_MAX) : null
}

export function normalizeProducerBpm(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const bpm = Number(value)
  if (!Number.isInteger(bpm) || bpm < 20 || bpm > 300) throw new Error('BPM must be a whole number between 20 and 300.')
  return bpm
}

export function normalizeReferenceUrl(value: string): string | null {
  const reference = value.trim()
  if (!reference) return null
  if (reference.length > PRODUCER_HANDOFF_REFERENCE_MAX) throw new Error('Reference link must be 500 characters or fewer.')
  let parsed: URL
  try {
    parsed = new URL(reference)
  } catch {
    throw new Error('Reference link must be a complete http or https URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Reference link must use http or https.')
  }
  return parsed.toString()
}

export function producerHandoffStage(input: {
  acknowledgedAt: string | null
  workingAt: string | null
  returnCount: number
  reviewCount: number
}): ProducerHandoffStage {
  if (input.reviewCount > 0) return 'reviewed'
  if (input.returnCount > 0) return 'returned'
  if (input.workingAt) return 'working'
  if (input.acknowledgedAt) return 'received'
  return 'sent'
}

export function producerHandoffAttention(input: {
  isRecipient: boolean
  stage: ProducerHandoffStage
  unreviewedReturnCount: number
  recipientName: string
}): string {
  if (input.unreviewedReturnCount > 0) {
    return `${input.unreviewedReturnCount} ${input.unreviewedReturnCount === 1 ? 'mix is' : 'mixes are'} ready to review`
  }
  if (input.isRecipient && input.stage === 'sent') return 'Producer pack ready to pick up'
  if (input.stage === 'sent') return `Waiting for ${input.recipientName} to receive the files`
  if (input.stage === 'received') return input.isRecipient ? 'Ready whenever you want to begin' : `${input.recipientName} has the files`
  if (input.stage === 'working') return `${input.recipientName} is working on it`
  if (input.stage === 'returned') return 'A returned mix is ready in the room'
  return 'Latest production round reviewed'
}

export function formatTechnicalDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'duration unavailable'
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

export function formatTechnicalSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return 'size unavailable'
  const megabytes = bytes / (1024 * 1024)
  return megabytes >= 10 ? `${Math.round(megabytes)} MB` : `${megabytes.toFixed(1)} MB`
}

export function buildProducerHandoffRecap(input: {
  songTitle: string
  senderName: string
  recipientName: string
  stage: ProducerHandoffStage
  roundLabel: string | null
  bpm: number | null
  musicalKey: string | null
  referenceUrl: string | null
  direction: string | null
  feedbackCount: number
}): string {
  const context = [input.bpm ? `${input.bpm} BPM` : null, input.musicalKey].filter(Boolean).join(' · ')
  return [
    `${input.songTitle} — producer handoff${input.roundLabel ? ` (${input.roundLabel})` : ''}`,
    `${input.senderName} → ${input.recipientName}`,
    `Status: ${input.stage}`,
    context || null,
    input.direction ? `Direction: ${input.direction}` : null,
    input.feedbackCount > 0 ? `${input.feedbackCount} timed production ${input.feedbackCount === 1 ? 'note' : 'notes'} attached` : null,
    input.referenceUrl ? `Reference: ${input.referenceUrl}` : null,
    'Creative workflow only — not master, rights, split or release approval.',
  ].filter((line): line is string => Boolean(line)).join('\n')
}

export function producerReturnLabel(fileName: string): string {
  const base = fileName
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 175)
    .trim()
  return `Producer mix — ${base || 'new return'}`.slice(0, 200)
}

export function producerInboxStatus(input: { acknowledgedAt: string | null; workingAt?: string | null; returnCount: number }): string {
  if (input.returnCount > 0) return input.returnCount === 1 ? '1 mix returned' : `${input.returnCount} mixes returned`
  if (input.workingAt) return 'Working on it'
  return input.acknowledgedAt ? 'Received' : 'Needs your reply'
}

export function safeAudioDownloadName(songTitle: string, suffix: string): string {
  const base = songTitle
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'funun-song'
  return `${base}-${suffix}.wav`
}
