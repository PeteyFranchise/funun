import {
  lyricSuggestionErrorStatus,
  normalizeSuggestedText,
  normalizeSuggestionNote,
  presentLyricSuggestions,
} from './lyric-suggestions'
import type { LyricBlockSuggestion, LyricCommentParticipant } from '@/types/catalogue'

const maya: LyricCommentParticipant = {
  userId: 'maya', name: 'Maya', handle: 'maya', avatarUrl: null,
}

const pending: LyricBlockSuggestion = {
  id: 'suggestion-1', work_id: 'work-1', block_id: 'block-1', author_user_id: 'maya',
  base_text: 'Old line', proposed_text: 'New line', note: 'Try this cadence',
  mentioned_user_ids: [], status: 'pending', decided_by_user_id: null, decided_at: null,
  created_at: '2026-09-03T12:00:00Z', updated_at: '2026-09-03T12:00:00Z',
}

describe("Writer's Room lyric suggestions", () => {
  it('preserves lyric whitespace while normalizing line endings and bounds notes', () => {
    expect(normalizeSuggestedText(' line one\r\nline two ')).toBe(' line one\nline two ')
    expect(normalizeSuggestedText('   ')).toBeNull()
    expect(normalizeSuggestionNote('  Try this  ')).toBe('Try this')
    expect(normalizeSuggestionNote('')).toBeNull()
    expect(normalizeSuggestionNote('x'.repeat(501))).toBeUndefined()
  })

  it('gives acceptance only to administrators and withdrawal to the author', () => {
    const profiles = new Map([[maya.userId, maya]])
    const authorView = presentLyricSuggestions({
      suggestions: [pending], profiles, viewerUserId: 'maya', canAdminister: false, currentText: 'Old line',
    })[0]!
    expect(authorView).toMatchObject({ canAccept: false, canDecline: true, isStale: false })

    const adminView = presentLyricSuggestions({
      suggestions: [pending], profiles, viewerUserId: 'owner', canAdminister: true, currentText: 'Changed line',
    })[0]!
    expect(adminView).toMatchObject({ canAccept: true, canDecline: true, isStale: true })
  })

  it('maps stale, busy, permission and validation decisions to useful HTTP statuses', () => {
    expect(lyricSuggestionErrorStatus('suggestion_stale')).toBe(409)
    expect(lyricSuggestionErrorStatus('lyric_block_busy')).toBe(409)
    expect(lyricSuggestionErrorStatus('suggestion_accept_not_allowed')).toBe(403)
    expect(lyricSuggestionErrorStatus('suggestion_author_unavailable')).toBe(409)
    expect(lyricSuggestionErrorStatus('invalid_suggestion_decision')).toBe(400)
  })
})
