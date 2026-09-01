import { isValidHandle, normalizeHandleForCompare } from '@/lib/handles/validate'
import type { LyricCommentParticipant, LyricBlockType } from '@/types/catalogue'

const MENTION_PATTERN = /(^|[\s(])@([A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)/g

/** Extracts unique valid @handles without treating email addresses as mentions. */
export function extractMentionHandles(body: string): string[] {
  const handles: string[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const handle = match[2] ?? ''
    if (!isValidHandle(handle)) continue
    const normalized = normalizeHandleForCompare(handle)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    handles.push(normalized)
  }
  return handles
}

/** Mentions can resolve only to current, handle-bearing participants in this song. */
export function resolveMentionedUserIds(
  body: string,
  participants: LyricCommentParticipant[]
): string[] {
  const byHandle = new Map(
    participants
      .filter(participant => participant.handle)
      .map(participant => [normalizeHandleForCompare(participant.handle!), participant.userId])
  )
  return extractMentionHandles(body)
    .map(handle => byHandle.get(handle))
    .filter((userId): userId is string => Boolean(userId))
}

const BLOCK_TYPE_LABELS: Record<LyricBlockType, string> = {
  verse: 'Verse',
  pre_chorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  hook: 'Hook',
  custom: 'section',
}

export function lyricCommentSectionLabel(
  blockType: LyricBlockType,
  customLabel: string | null
): string {
  return blockType === 'custom' && customLabel
    ? customLabel
    : BLOCK_TYPE_LABELS[blockType]
}
