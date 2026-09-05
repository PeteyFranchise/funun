import { presentStudioNotes, studioNoteMatchesFilter } from './studio-notes'
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
