export const TRACK_AUDIO_BUCKET = 'track-audio'
export const TRACK_AUDIO_MAX_BYTES = 50 * 1024 * 1024

export type TrackAudioRole = 'master' | 'share'

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function trackAudioRole(value: unknown): TrackAudioRole {
  return value === 'master' ? 'master' : 'share'
}

export function resolveTrackAudioType(
  mimeType: string,
  fileName: string
): { ext: string; contentType: string } | null {
  const mimeExt = EXT_BY_MIME[mimeType.toLowerCase()]
  const nameExt = fileName.split('.').pop()?.toLowerCase() ?? ''
  const ext = mimeExt ?? (MIME_BY_EXT[nameExt] ? nameExt : '')
  return ext ? { ext, contentType: MIME_BY_EXT[ext] } : null
}

export function buildTrackAudioPath(
  userId: string,
  projectId: string,
  trackId: string,
  role: TrackAudioRole,
  objectId: string,
  ext: string
): string {
  const marker = role === 'master' ? 'master.' : ''
  return `${userId}/${projectId}/${trackId}.${marker}${objectId}.${ext}`
}

export function validateTrackAudioPath(
  path: string,
  userId: string,
  projectId: string,
  trackId: string,
  role: TrackAudioRole
): { ext: string; contentType: string } | null {
  const prefix = `${userId}/${projectId}/${trackId}.${role === 'master' ? 'master.' : ''}`
  if (!path.startsWith(prefix)) return null
  const tail = path.slice(prefix.length)
  const separator = tail.lastIndexOf('.')
  if (separator <= 0) return null
  const objectId = tail.slice(0, separator)
  const ext = tail.slice(separator + 1).toLowerCase()
  if (!UUID.test(objectId) || !MIME_BY_EXT[ext]) return null
  return { ext, contentType: MIME_BY_EXT[ext] }
}
