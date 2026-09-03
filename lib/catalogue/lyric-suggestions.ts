import type {
  LyricBlockSuggestion,
  LyricBlockSuggestionView,
  LyricCommentParticipant,
} from '@/types/catalogue'

export const LYRIC_SUGGESTION_TEXT_MAX = 4000
export const LYRIC_SUGGESTION_NOTE_MAX = 500

export function normalizeSuggestedText(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, '\n')
  if (!normalized.trim() || normalized.length > LYRIC_SUGGESTION_TEXT_MAX) return null
  return normalized
}

export function normalizeSuggestionNote(value: string | null | undefined): string | null | undefined {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  if (normalized.length > LYRIC_SUGGESTION_NOTE_MAX) return undefined
  return normalized
}

function fallbackParticipant(userId: string): LyricCommentParticipant {
  return { userId, name: 'A writer', handle: null, avatarUrl: null }
}

export function presentLyricSuggestions({
  suggestions,
  profiles,
  viewerUserId,
  canAdminister,
  currentText,
}: {
  suggestions: LyricBlockSuggestion[]
  profiles: Map<string, LyricCommentParticipant>
  viewerUserId: string
  canAdminister: boolean
  currentText: string
}): LyricBlockSuggestionView[] {
  return suggestions.map(suggestion => ({
    id: suggestion.id,
    blockId: suggestion.block_id,
    baseText: suggestion.base_text,
    proposedText: suggestion.proposed_text,
    note: suggestion.note,
    author: suggestion.author_user_id
      ? (profiles.get(suggestion.author_user_id) ?? fallbackParticipant(suggestion.author_user_id))
      : fallbackParticipant(suggestion.id),
    mentioned: suggestion.mentioned_user_ids
      .map(userId => profiles.get(userId))
      .filter((participant): participant is LyricCommentParticipant => Boolean(participant)),
    status: suggestion.status,
    decidedByName: suggestion.decided_by_user_id
      ? (profiles.get(suggestion.decided_by_user_id)?.name ?? 'A writer')
      : null,
    decidedAt: suggestion.decided_at,
    createdAt: suggestion.created_at,
    canAccept: suggestion.status === 'pending' && canAdminister,
    canDecline:
      suggestion.status === 'pending' &&
      (canAdminister || suggestion.author_user_id === viewerUserId),
    isStale: suggestion.status === 'pending' && suggestion.base_text !== currentText,
  }))
}

export function lyricSuggestionErrorStatus(message: string): number {
  if (message.includes('suggestion_not_found')) return 404
  if (
    message.includes('suggestion_stale') ||
    message.includes('lyric_block_busy') ||
    message.includes('suggestion_already_decided') ||
    message.includes('suggestion_author_unavailable')
  ) return 409
  if (message.includes('not_allowed') || message.includes('work_access_required')) return 403
  if (message.includes('invalid_') || message.includes('matches_current')) return 400
  return 500
}
