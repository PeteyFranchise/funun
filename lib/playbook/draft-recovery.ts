import type { PlaybookEntryType } from '@/lib/playbook/content'

export const PLAYBOOK_RECOVERY_VERSION = 1
export const PLAYBOOK_RECOVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000
export const PLAYBOOK_RECOVERY_MAX_BODY_CHARS = 250_000

export type PlaybookRecoveryDraft = {
  entryType: PlaybookEntryType
  title: string
  body: string
  subGroupId?: string
  templateKey?: string
}

export type PlaybookRecoveryRecord = {
  version: typeof PLAYBOOK_RECOVERY_VERSION
  savedAt: number
  draft: PlaybookRecoveryDraft
}

export type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function safeSegment(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase())
}

export function playbookRecoveryKey(input: {
  viewerId: string
  roomKey: string
  entryId?: string
}): string {
  const scope = input.entryId ? `entry:${safeSegment(input.entryId)}` : 'new'
  return `${playbookRecoveryPrefix(input.viewerId)}${safeSegment(input.roomKey)}:${scope}`
}

export function playbookRecoveryPrefix(viewerId: string): string {
  return `funun:playbook-recovery:v${PLAYBOOK_RECOVERY_VERSION}:${safeSegment(viewerId)}:`
}

export function parsePlaybookRecoveryKey(
  key: string,
  viewerId: string
): { roomKey: string; entryId: string | null } | null {
  const prefix = playbookRecoveryPrefix(viewerId)
  if (!key.startsWith(prefix)) return null
  const remainder = key.slice(prefix.length)
  const parts = remainder.split(':')
  if (parts.length === 2 && parts[1] === 'new') {
    try {
      return { roomKey: decodeURIComponent(parts[0]), entryId: null }
    } catch {
      return null
    }
  }
  if (parts.length === 3 && parts[1] === 'entry' && parts[2]) {
    try {
      return { roomKey: decodeURIComponent(parts[0]), entryId: decodeURIComponent(parts[2]) }
    } catch {
      return null
    }
  }
  return null
}

function isDraft(value: unknown): value is PlaybookRecoveryDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Record<string, unknown>
  if (!['sop', 'topic', 'document'].includes(String(draft.entryType))) return false
  if (typeof draft.title !== 'string' || draft.title.length > 300) return false
  if (typeof draft.body !== 'string' || draft.body.length > PLAYBOOK_RECOVERY_MAX_BODY_CHARS) return false
  if (draft.subGroupId !== undefined && (typeof draft.subGroupId !== 'string' || draft.subGroupId.length > 200)) return false
  if (draft.templateKey !== undefined && (typeof draft.templateKey !== 'string' || draft.templateKey.length > 100)) return false
  return true
}

export function readPlaybookRecovery(
  storage: RecoveryStorage,
  key: string,
  now = Date.now()
): PlaybookRecoveryRecord | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<PlaybookRecoveryRecord>
    const validTimestamp = typeof value.savedAt === 'number' && Number.isFinite(value.savedAt)
    const expired = validTimestamp && now - value.savedAt! > PLAYBOOK_RECOVERY_RETENTION_MS
    const fromFuture = validTimestamp && value.savedAt! > now + 5 * 60 * 1_000
    if (value.version !== PLAYBOOK_RECOVERY_VERSION || !validTimestamp || expired || fromFuture || !isDraft(value.draft)) {
      storage.removeItem(key)
      return null
    }
    return value as PlaybookRecoveryRecord
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      // Storage may be unavailable entirely; authoring must remain usable.
    }
    return null
  }
}

export function writePlaybookRecovery(
  storage: RecoveryStorage,
  key: string,
  draft: PlaybookRecoveryDraft,
  now = Date.now()
): PlaybookRecoveryRecord | null {
  if (!isDraft(draft)) return null
  const record: PlaybookRecoveryRecord = { version: PLAYBOOK_RECOVERY_VERSION, savedAt: now, draft }
  try {
    storage.setItem(key, JSON.stringify(record))
    return record
  } catch {
    return null
  }
}

export function removePlaybookRecovery(storage: RecoveryStorage, key: string): boolean {
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
