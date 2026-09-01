import {
  extractMentionHandles,
  lyricCommentSectionLabel,
  resolveMentionedUserIds,
} from './comments'

const participants = [
  { userId: 'u-1', name: 'Maya', handle: 'Maya-Reyes', avatarUrl: null },
  { userId: 'u-2', name: 'Peter', handle: 'peter_zora', avatarUrl: null },
  { userId: 'u-3', name: 'No Handle', handle: null, avatarUrl: null },
]

describe("Writer's Room comment mentions", () => {
  it('extracts unique valid handles and ignores email addresses', () => {
    expect(extractMentionHandles('Ask @Maya-Reyes, then @peter_zora. Email x@outside.com. @Maya-Reyes')).toEqual([
      'maya-reyes',
      'peter_zora',
    ])
  })

  it('resolves mentions only to current handle-bearing song participants', () => {
    expect(resolveMentionedUserIds('@maya-reyes @outsider @peter_zora', participants)).toEqual(['u-1', 'u-2'])
  })

  it('uses custom lyric headings without inventing stored numerals', () => {
    expect(lyricCommentSectionLabel('chorus', null)).toBe('Chorus')
    expect(lyricCommentSectionLabel('custom', 'Breakdown')).toBe('Breakdown')
  })
})
