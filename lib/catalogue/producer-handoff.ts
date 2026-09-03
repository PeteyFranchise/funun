export const PRODUCER_HANDOFF_NOTE_MAX = 1000

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

export function producerInboxStatus(input: { acknowledgedAt: string | null; returnCount: number }): string {
  if (input.returnCount > 0) return input.returnCount === 1 ? '1 mix returned' : `${input.returnCount} mixes returned`
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
