import {
  countUnresolvedAudioNotes,
  countUnresolvedAudioNotesByVersion,
  countUnresolvedLyricNotesByBlock,
  presentStudioNotes,
  resolveLyricNoteDeepLink,
  selectSongStudioNotes,
  studioNoteMatchesFilter,
} from './studio-notes'
import type {
  LyricBlockComment,
  LyricCommentParticipant,
  WorkNoteReaction,
  WorkStudioNote,
  WorkVersionComment,
} from '@/types/catalogue'

const VIEWER = '11111111-1111-4111-8111-111111111111'
const WRITER = '22222222-2222-4222-8222-222222222222'
const SONG_NOTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SONG_REPLY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AUDIO_NOTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const LYRIC_NOTE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const VERSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const BLOCK = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

const viewer: LyricCommentParticipant = { userId: VIEWER, name: 'Peter Zora', handle: 'peterzora', avatarUrl: null }
const writer: LyricCommentParticipant = { userId: WRITER, name: 'Shane Maux', handle: 'shanemaux', avatarUrl: null }

const songNotes: WorkStudioNote[] = [
  {
    id: SONG_NOTE,
    work_id: 'work',
    parent_note_id: null,
    author_user_id: WRITER,
    body: 'Try a quieter opening.',
    mentioned_user_ids: [],
    resolved_at: null,
    resolved_by_user_id: null,
    created_at: '2026-09-04T02:00:00.000Z',
  },
  {
    id: SONG_REPLY,
    work_id: 'work',
    parent_note_id: SONG_NOTE,
    author_user_id: WRITER,
    body: '@peterzora I made a pass.',
    mentioned_user_ids: [VIEWER],
    resolved_at: null,
    resolved_by_user_id: null,
    created_at: '2026-09-04T02:01:00.000Z',
  },
]

const audioNotes: WorkVersionComment[] = [{
  id: AUDIO_NOTE,
  work_id: 'work',
  version_id: VERSION,
  parent_comment_id: null,
  author_user_id: VIEWER,
  body: 'Drop the drums here.',
  timestamp_ms: 105000,
  mentioned_user_ids: [WRITER],
  resolved_at: null,
  resolved_by_user_id: null,
  carried_from_version_id: null,
  carried_from_comment_id: null,
  created_at: '2026-09-04T03:00:00.000Z',
}]

const lyricNotes: LyricBlockComment[] = [{
  id: LYRIC_NOTE,
  work_id: 'work',
  block_id: BLOCK,
  parent_comment_id: null,
  author_user_id: WRITER,
  body: 'Keep this image.',
  mentioned_user_ids: [],
  resolved_at: '2026-09-04T04:30:00.000Z',
  resolved_by_user_id: WRITER,
  created_at: '2026-09-04T04:00:00.000Z',
}]

const reactions: WorkNoteReaction[] = [
  { id: 'r1', work_id: 'work', source: 'audio', note_id: AUDIO_NOTE, user_id: VIEWER, reaction: 'heard', created_at: '2026-09-04T03:01:00.000Z' },
  { id: 'r2', work_id: 'work', source: 'audio', note_id: AUDIO_NOTE, user_id: WRITER, reaction: 'heard', created_at: '2026-09-04T03:02:00.000Z' },
  { id: 'r3', work_id: 'work', source: 'song', note_id: SONG_REPLY, user_id: VIEWER, reaction: 'done', created_at: '2026-09-04T03:03:00.000Z' },
]

describe('Studio Notes presentation', () => {
  const notes = presentStudioNotes({
    songNotes,
    audioNotes,
    lyricNotes,
    profiles: new Map([[VIEWER, viewer], [WRITER, writer]]),
    versionLabels: new Map([[VERSION, 'v2 Rough mix']]),
    blockLabels: new Map([[BLOCK, 'Chorus 1']]),
    viewerUserId: VIEWER,
    viewerIsOwner: true,
    viewerCanAdminister: true,
    reactions,
  })

  it('merges all three sources newest-first without copying their contexts', () => {
    expect(notes.map(note => note.source)).toEqual(['lyrics', 'audio', 'song'])
    expect(notes[0]?.context).toEqual({ kind: 'lyrics', label: 'Chorus 1', blockId: BLOCK })
    expect(notes[1]?.context).toEqual({ kind: 'audio', label: 'v2 Rough mix · 1:45', versionId: VERSION, timestampMs: 105000 })
  })

  it('threads replies and aggregates each reaction independently', () => {
    expect(notes[2]?.replies).toHaveLength(1)
    expect(notes[2]?.replies[0]?.reactions[0]).toMatchObject({ reaction: 'done', count: 1, reactedByViewer: true })
    expect(notes[1]?.reactions[0]).toMatchObject({ reaction: 'heard', count: 2, reactedByViewer: true })
    expect(notes[1]?.reactions[0]?.people.map(person => person.name)).toEqual(['Peter Zora', 'Shane Maux'])
  })

  it('includes a thread in For me when a reply—not only the root—addresses the viewer', () => {
    expect(studioNoteMatchesFilter(notes[2]!, 'mine', VIEWER)).toBe(true)
    expect(studioNoteMatchesFilter(notes[0]!, 'open', VIEWER)).toBe(false)
    expect(studioNoteMatchesFilter(notes[0]!, 'resolved', VIEWER)).toBe(true)
  })
})

// ─── source-scoped selectors (Studio Notes scoped-by-kind) ─────────────
//
// A separate, extended fixture set. The three cases above assert the
// aggregation behaviour this task must not alter, so they keep their own
// unmodified three-item `notes` computation; these selectors need more
// shapes (a resolved audio root, a version outside the allowlist, a second
// unresolved lyric thread with its own reply) and get their own presented
// list rather than growing the shared one out from under those assertions.

const VERSION_OTHER = '99999999-9999-4999-8999-999999999999'
const BLOCK_2 = '88888888-8888-4888-8888-888888888888'
const AUDIO_NOTE_RESOLVED = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const AUDIO_NOTE_OUT_OF_ALLOWLIST = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'
const AUDIO_REPLY = 'a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5'
const LYRIC_NOTE_2 = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3'
const LYRIC_REPLY_2 = 'a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4'

const scopedAudioNotes: WorkVersionComment[] = [
  ...audioNotes,
  {
    id: AUDIO_REPLY,
    work_id: 'work',
    version_id: VERSION,
    parent_comment_id: AUDIO_NOTE,
    author_user_id: WRITER,
    body: 'On it.',
    timestamp_ms: 105000,
    mentioned_user_ids: [],
    resolved_at: null,
    resolved_by_user_id: null,
    carried_from_version_id: null,
    carried_from_comment_id: null,
    created_at: '2026-09-04T03:05:00.000Z',
  },
  {
    id: AUDIO_NOTE_RESOLVED,
    work_id: 'work',
    version_id: VERSION,
    parent_comment_id: null,
    author_user_id: VIEWER,
    body: 'Already handled, resolved.',
    timestamp_ms: 20000,
    mentioned_user_ids: [],
    resolved_at: '2026-09-01T01:30:00.000Z',
    resolved_by_user_id: WRITER,
    carried_from_version_id: null,
    carried_from_comment_id: null,
    created_at: '2026-09-01T01:00:00.000Z',
  },
  {
    id: AUDIO_NOTE_OUT_OF_ALLOWLIST,
    work_id: 'work',
    version_id: VERSION_OTHER,
    parent_comment_id: null,
    author_user_id: VIEWER,
    body: 'Unresolved, but on a version the caller does not render.',
    timestamp_ms: 5000,
    mentioned_user_ids: [],
    resolved_at: null,
    resolved_by_user_id: null,
    carried_from_version_id: null,
    carried_from_comment_id: null,
    created_at: '2026-09-01T01:05:00.000Z',
  },
]

const scopedLyricNotes: LyricBlockComment[] = [
  ...lyricNotes,
  {
    id: LYRIC_NOTE_2,
    work_id: 'work',
    block_id: BLOCK_2,
    parent_comment_id: null,
    author_user_id: WRITER,
    body: 'This line is still unresolved.',
    mentioned_user_ids: [],
    resolved_at: null,
    resolved_by_user_id: null,
    created_at: '2026-09-01T02:00:00.000Z',
  },
  {
    id: LYRIC_REPLY_2,
    work_id: 'work',
    block_id: BLOCK_2,
    parent_comment_id: LYRIC_NOTE_2,
    author_user_id: VIEWER,
    body: 'Agreed, still looking at it.',
    mentioned_user_ids: [],
    resolved_at: null,
    resolved_by_user_id: null,
    created_at: '2026-09-01T02:01:00.000Z',
  },
]

describe('Studio Notes source-scoped selectors', () => {
  const notes = presentStudioNotes({
    songNotes,
    audioNotes: scopedAudioNotes,
    lyricNotes: scopedLyricNotes,
    profiles: new Map([[VIEWER, viewer], [WRITER, writer]]),
    versionLabels: new Map([[VERSION, 'v2 Rough mix'], [VERSION_OTHER, 'v1 Demo']]),
    blockLabels: new Map([[BLOCK, 'Chorus 1'], [BLOCK_2, 'Verse 2']]),
    viewerUserId: VIEWER,
    viewerIsOwner: true,
    viewerCanAdminister: true,
    reactions,
  })

  it('selects song-kind threads only, order preserved', () => {
    expect(selectSongStudioNotes(notes).map(note => note.id)).toEqual([SONG_NOTE])
  })

  it('counts unresolved audio roots per allowed version, excluding a resolved root on that same version', () => {
    expect(countUnresolvedAudioNotesByVersion(notes, [VERSION])).toEqual({ [VERSION]: 1 })
    expect(countUnresolvedAudioNotes(notes, [VERSION])).toBe(1)
  })

  it('counts an unresolved root even though it has a reply, without double-counting the reply', () => {
    const audioRoot = notes.find(note => note.id === AUDIO_NOTE)
    expect(audioRoot?.replies).toHaveLength(1)
    expect(countUnresolvedAudioNotesByVersion(notes, [VERSION])[VERSION]).toBe(1)
  })

  it('excludes an audio root whose version is absent from the allowlist', () => {
    expect(countUnresolvedAudioNotes(notes, [VERSION])).toBe(1)
    expect(countUnresolvedAudioNotesByVersion(notes, [VERSION, VERSION_OTHER])).toEqual({
      [VERSION]: 1,
      [VERSION_OTHER]: 1,
    })
    expect(countUnresolvedAudioNotes(notes, [VERSION, VERSION_OTHER])).toBe(2)
  })

  it('counts unresolved lyric roots per block, omitting a resolved block', () => {
    expect(countUnresolvedLyricNotesByBlock(notes)).toEqual({ [BLOCK_2]: 1 })
  })

  it('resolves a lyric root id, or any of its reply ids, to the thread block id and label', () => {
    expect(resolveLyricNoteDeepLink(notes, LYRIC_NOTE_2)).toEqual({ blockId: BLOCK_2, label: 'Verse 2' })
    expect(resolveLyricNoteDeepLink(notes, LYRIC_REPLY_2)).toEqual({ blockId: BLOCK_2, label: 'Verse 2' })
  })

  it('returns null for a song id, an audio id, an unknown id, and a null id', () => {
    expect(resolveLyricNoteDeepLink(notes, SONG_NOTE)).toBeNull()
    expect(resolveLyricNoteDeepLink(notes, AUDIO_NOTE)).toBeNull()
    expect(resolveLyricNoteDeepLink(notes, 'nonexistent-id')).toBeNull()
    expect(resolveLyricNoteDeepLink(notes, null)).toBeNull()
  })
})
