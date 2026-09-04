import { resolveAudioType } from '@/lib/catalogue/audio-mime'

export const IDEA_TITLE_MAX = 200
export const IDEA_NOTE_MAX = 10_000
export const IDEA_TRANSCRIPT_MAX = 50_000
export const IDEA_MOOD_MAX = 12

export type IdeaState = 'active' | 'snoozed' | 'archived' | 'promoted'
export type IdeaPermission = 'listen' | 'comment' | 'contribute'
export type IdeaRecordingKind = 'voice' | 'melody' | 'lyric' | 'rhythm' | 'harmony' | 'reference' | 'import'
export type IdeaRating = 'keep' | 'maybe'

export type IdeaRecordingView = {
  id: string
  createdBy: string | null
  creatorName: string
  parentRecordingId: string | null
  playbackUrl: string | null
  downloadUrl: string | null
  audioExt: string
  audioSize: number
  durationSeconds: number | null
  label: string | null
  kind: IdeaRecordingKind
  rating: IdeaRating | null
  archivedAt: string | null
  capturedAt: string
  markers: { id: string; timestampMs: number; label: string | null }[]
}

export type IdeaView = {
  id: string
  ownerId: string
  ownerName: string
  viewerPermission: 'owner' | IdeaPermission
  title: string
  note: string | null
  transcript: string | null
  moods: string[]
  state: IdeaState
  pinned: boolean
  snoozedUntil: string | null
  parentIdeaId: string | null
  promotedWorkId: string | null
  capturedAt: string
  recordings: IdeaRecordingView[]
  members: { userId: string; name: string; permission: IdeaPermission }[]
  comments: { id: string; recordingId: string | null; authorName: string; timestampMs: number | null; body: string; createdAt: string }[]
  references: { id: string; kind: 'link' | 'text' | 'image'; label: string | null; value: string }[]
  collections: { id: string; name: string }[]
}

export function automaticIdeaTitle(now: Date): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'UTC',
  }).format(now)
  return `Voice idea · ${formatted}`
}

export function normalizeIdeaTitle(value: string, fallback: string): string {
  const title = value.trim().replace(/\s+/g, ' ')
  return (title || fallback).slice(0, IDEA_TITLE_MAX)
}

export function normalizeIdeaMoods(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const moods: string[] = []
  for (const raw of value) {
    const mood = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 40) : ''
    const key = mood.toLocaleLowerCase()
    if (!mood || seen.has(key)) continue
    seen.add(key)
    moods.push(mood)
    if (moods.length === IDEA_MOOD_MAX) break
  }
  return moods
}

export function ideaPermissionAllows(permission: 'owner' | IdeaPermission | null, action: 'listen' | 'comment' | 'contribute' | 'manage'): boolean {
  if (permission === 'owner') return true
  if (action === 'listen') return permission !== null
  if (action === 'comment') return permission === 'comment' || permission === 'contribute'
  if (action === 'contribute') return permission === 'contribute'
  return false
}

export function buildIdeaRecordingPath(ideaId: string, recordingId: string, ext: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const audioType = resolveAudioType('', `recording.${ext}`)
  if (!uuid.test(ideaId) || !uuid.test(recordingId) || !audioType || audioType.ext !== ext) {
    throw new Error('Invalid idea recording reference.')
  }
  return `ideas/${ideaId}/${recordingId}.${ext}`
}

export function safeIdeaDownloadName(title: string, recording: { label: string | null; audioExt: string }): string {
  const base = `${title}-${recording.label ?? 'original-idea'}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .toLowerCase() || 'funun-idea'
  return `${base}.${recording.audioExt}`
}
