import type { RoomPresencePerson } from './room-presence'

export const LOCK_LEASE_MS = 30_000

export type LyricSectionLock = {
  blockId: string
  userId: string
  sessionId: string
  expiresAt: string
}

export type SectionLockView =
  | { state: 'available' }
  | { state: 'mine'; holderName: string }
  | { state: 'other'; holderName: string }

export type CollaborationHint =
  | { kind: 'lock_changed' | 'lyric_saved' | 'comment_changed'; blockId: string }
  | { kind: 'track_comment_changed'; versionId: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function normalizeLyricSectionLock(value: unknown, nowMs = Date.now()): LyricSectionLock | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!isUuid(raw.blockId) || !isUuid(raw.userId) || !isUuid(raw.sessionId)) return null
  if (typeof raw.expiresAt !== 'string') return null
  const expiresAt = Date.parse(raw.expiresAt)
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return null
  return {
    blockId: raw.blockId,
    userId: raw.userId,
    sessionId: raw.sessionId,
    expiresAt: raw.expiresAt,
  }
}

export function normalizeCollaborationHint(kind: unknown, payload: unknown): CollaborationHint | null {
  if (!payload || typeof payload !== 'object') return null
  if (kind === 'track_comment_changed') {
    const versionId = (payload as Record<string, unknown>).versionId
    return isUuid(versionId) ? { kind, versionId } : null
  }
  if (kind !== 'lock_changed' && kind !== 'lyric_saved' && kind !== 'comment_changed') return null
  const blockId = (payload as Record<string, unknown>).blockId
  return isUuid(blockId) ? { kind, blockId } : null
}

export function activeLocksByBlock(values: unknown[], nowMs = Date.now()): Record<string, LyricSectionLock> {
  const locks: Record<string, LyricSectionLock> = {}
  for (const value of values) {
    const lock = normalizeLyricSectionLock(value, nowMs)
    if (lock) locks[lock.blockId] = lock
  }
  return locks
}

export function sectionLockView(
  lock: LyricSectionLock | undefined,
  viewerUserId: string,
  viewerSessionId: string | null,
  people: RoomPresencePerson[],
  nowMs = Date.now()
): SectionLockView {
  if (!lock || Date.parse(lock.expiresAt) <= nowMs) return { state: 'available' }
  const holderName = people.find(person => person.userId === lock.userId)?.name ?? 'Another writer'
  if (lock.userId === viewerUserId && lock.sessionId === viewerSessionId) {
    return { state: 'mine', holderName }
  }
  return { state: 'other', holderName }
}
