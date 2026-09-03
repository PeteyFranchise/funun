export type WorkingTake = {
  id: string
  archivedAt?: string | null
}

const AUDIO_DOWNLOAD_EXTENSIONS = new Set(['webm', 'm4a', 'aac', 'mp3', 'wav', 'flac', 'ogg'])

function safeFileSegment(value: string, maxLength: number): string {
  return value
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

/** A presentation-only filename that retains the stored audio format. */
export function safeTakeDownloadName(input: {
  songTitle: string
  versionDisplay: string
  label?: string | null
  audioPath: string
}): string {
  const title = safeFileSegment(input.songTitle, 80) || 'funun-song'
  const version = safeFileSegment(input.versionDisplay, 12) || 'take'
  const label = safeFileSegment(input.label ?? '', 80)
  const pathExtension = input.audioPath.split('.').pop()?.toLowerCase() ?? ''
  const extension = AUDIO_DOWNLOAD_EXTENSIONS.has(pathExtension) ? pathExtension : 'audio'
  return [title, version, label].filter(Boolean).join('-') + `.${extension}`
}

/** Presentation-only labels are bounded and blank input clears the label. */
export function normalizeTakeLabel(value: string): string | null {
  const label = value.trim()
  return label ? label.slice(0, 200) : null
}

/** Keeps chronological order inside each group while putting the room's working take first. */
export function workingTakeFirst<T extends WorkingTake>(takes: T[], workingVersionId: string | null): T[] {
  if (!workingVersionId) return takes
  const working = takes.find(take => take.id === workingVersionId && !take.archivedAt)
  if (!working) return takes
  return [working, ...takes.filter(take => take.id !== workingVersionId)]
}
