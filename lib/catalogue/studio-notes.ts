import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'
import type {
  LyricBlockComment,
  LyricCommentParticipant,
  StudioNoteContext,
  StudioNoteMessageView,
  StudioNoteReactionView,
  StudioNoteSource,
  StudioNoteThreadView,
  WorkNoteReaction,
  WorkStudioNote,
  WorkVersionComment,
} from '@/types/catalogue'

type PresentStudioNotesInput = {
  songNotes: WorkStudioNote[]
  audioNotes: WorkVersionComment[]
  lyricNotes: LyricBlockComment[]
  profiles: Map<string, LyricCommentParticipant>
  versionLabels: Map<string, string>
  blockLabels: Map<string, string>
  viewerUserId: string
  viewerIsOwner: boolean
  viewerCanAdminister: boolean
  reactions: WorkNoteReaction[]
}

type NormalizedRow = {
  id: string
  source: StudioNoteSource
  parentId: string | null
  authorUserId: string | null
  body: string
  recipientUserIds: string[]
  resolvedAt: string | null
  resolvedByUserId: string | null
  createdAt: string
  context: StudioNoteContext
}

function canResolveThread(
  authorUserId: string | null,
  viewerUserId: string,
  viewerIsOwner: boolean,
  viewerCanAdminister: boolean
): boolean {
  return authorUserId === viewerUserId || viewerIsOwner || viewerCanAdminister
}

function profileList(ids: string[], profiles: Map<string, LyricCommentParticipant>) {
  return ids
    .map(id => profiles.get(id))
    .filter((profile): profile is LyricCommentParticipant => Boolean(profile))
}

function toView(
  row: NormalizedRow,
  profiles: Map<string, LyricCommentParticipant>,
  canResolve: boolean,
  reactions: StudioNoteReactionView[]
): StudioNoteMessageView {
  return {
    id: row.id,
    source: row.source,
    parentId: row.parentId,
    body: row.body,
    author: row.authorUserId ? profiles.get(row.authorUserId) ?? null : null,
    recipients: profileList(row.recipientUserIds, profiles),
    resolvedAt: row.resolvedAt,
    resolvedByName: row.resolvedByUserId ? profiles.get(row.resolvedByUserId)?.name ?? null : null,
    createdAt: row.createdAt,
    context: row.context,
    canResolve,
    reactions,
  }
}

function reactionsForNote(
  row: NormalizedRow,
  reactionsByNote: Map<string, WorkNoteReaction[]>,
  profiles: Map<string, LyricCommentParticipant>,
  viewerUserId: string
): StudioNoteReactionView[] {
  const matching = reactionsByNote.get(`${row.source}:${row.id}`) ?? []
  const grouped = new Map<WorkNoteReaction['reaction'], WorkNoteReaction[]>()
  for (const reaction of matching) {
    const group = grouped.get(reaction.reaction) ?? []
    group.push(reaction)
    grouped.set(reaction.reaction, group)
  }
  return Array.from(grouped.entries()).map(([reaction, rows]) => ({
    reaction,
    count: rows.length,
    reactedByViewer: rows.some(item => item.user_id === viewerUserId),
    people: profileList(rows.map(item => item.user_id), profiles),
  }))
}

export function presentNoteReactionGroups({
  source,
  noteId,
  reactions,
  profiles,
  viewerUserId,
}: {
  source: StudioNoteSource
  noteId: string
  reactions: WorkNoteReaction[]
  profiles: Map<string, LyricCommentParticipant>
  viewerUserId: string
}): StudioNoteReactionView[] {
  const grouped = new Map<string, WorkNoteReaction[]>()
  for (const reaction of reactions) {
    const key = `${reaction.source}:${reaction.note_id}`
    const rows = grouped.get(key) ?? []
    rows.push(reaction)
    grouped.set(key, rows)
  }
  return reactionsForNote(
    { id: noteId, source } as NormalizedRow,
    grouped,
    profiles,
    viewerUserId
  )
}

function normalizeSongNote(row: WorkStudioNote): NormalizedRow {
  return {
    id: row.id,
    source: 'song',
    parentId: row.parent_note_id,
    authorUserId: row.author_user_id,
    body: row.body,
    recipientUserIds: row.mentioned_user_ids,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at,
    context: { kind: 'song', label: 'Whole song' },
  }
}

function normalizeAudioNote(row: WorkVersionComment, versionLabels: Map<string, string>): NormalizedRow {
  const versionLabel = versionLabels.get(row.version_id) ?? 'Recording'
  return {
    id: row.id,
    source: 'audio',
    parentId: row.parent_comment_id,
    authorUserId: row.author_user_id,
    body: row.body,
    recipientUserIds: row.mentioned_user_ids,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at,
    context: {
      kind: 'audio',
      label: `${versionLabel} · ${formatTrackTimestamp(row.timestamp_ms)}`,
      versionId: row.version_id,
      timestampMs: row.timestamp_ms,
    },
  }
}

function normalizeLyricNote(row: LyricBlockComment, blockLabels: Map<string, string>): NormalizedRow {
  return {
    id: row.id,
    source: 'lyrics',
    parentId: row.parent_comment_id,
    authorUserId: row.author_user_id,
    body: row.body,
    recipientUserIds: row.mentioned_user_ids,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    createdAt: row.created_at,
    context: {
      kind: 'lyrics',
      label: blockLabels.get(row.block_id) ?? 'Lyric section',
      blockId: row.block_id,
    },
  }
}

/**
 * Presents the three authoritative note stores as one Writer's Room feed.
 * Rows are never copied between stores: this is a read-time facade only.
 */
export function presentStudioNotes(input: PresentStudioNotesInput): StudioNoteThreadView[] {
  const rows: NormalizedRow[] = [
    ...input.songNotes.map(normalizeSongNote),
    ...input.audioNotes.map(row => normalizeAudioNote(row, input.versionLabels)),
    ...input.lyricNotes.map(row => normalizeLyricNote(row, input.blockLabels)),
  ]
  const roots = rows.filter(row => row.parentId === null)
  const repliesByRoot = new Map<string, NormalizedRow[]>()
  const reactionsByNote = new Map<string, WorkNoteReaction[]>()

  for (const reaction of input.reactions) {
    const key = `${reaction.source}:${reaction.note_id}`
    const reactions = reactionsByNote.get(key) ?? []
    reactions.push(reaction)
    reactionsByNote.set(key, reactions)
  }

  for (const reply of rows) {
    if (!reply.parentId) continue
    const replies = repliesByRoot.get(reply.parentId) ?? []
    replies.push(reply)
    repliesByRoot.set(reply.parentId, replies)
  }

  return roots
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(root => ({
      ...toView(
        root,
        input.profiles,
        canResolveThread(
          root.authorUserId,
          input.viewerUserId,
          input.viewerIsOwner,
          input.viewerCanAdminister
        ),
        reactionsForNote(root, reactionsByNote, input.profiles, input.viewerUserId)
      ),
      parentId: null,
      replies: (repliesByRoot.get(root.id) ?? [])
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(reply => toView(
          reply,
          input.profiles,
          false,
          reactionsForNote(reply, reactionsByNote, input.profiles, input.viewerUserId)
        )),
    }))
}

export function studioNoteMatchesFilter(
  note: StudioNoteThreadView,
  filter: 'all' | 'mine' | 'open' | 'resolved',
  viewerUserId: string
): boolean {
  if (filter === 'all') return true
  if (filter === 'open') return note.resolvedAt === null
  if (filter === 'resolved') return note.resolvedAt !== null
  return note.recipients.some(recipient => recipient.userId === viewerUserId)
    || note.replies.some(reply => reply.recipients.some(recipient => recipient.userId === viewerUserId))
}

// ─── source-scoped selectors (Studio Notes scoped-by-kind) ─────────────

/**
 * Returns only the song-kind threads from a mixed three-kind list, order
 * preserved. The Studio Notes module lists song notes only; this is the
 * single place that subset is derived.
 */
export function selectSongStudioNotes(notes: StudioNoteThreadView[]): StudioNoteThreadView[] {
  return notes.filter(note => note.source === 'song')
}

/**
 * Unresolved audio-root count per version, restricted to the versions the
 * caller actually renders. Zero-count versions are omitted so callers can
 * derive both a per-row number and a total that can never disagree.
 */
export function countUnresolvedAudioNotesByVersion(
  notes: StudioNoteThreadView[],
  versionIds: Iterable<string>
): Record<string, number> {
  const allowed = new Set(versionIds)
  const counts: Record<string, number> = {}
  for (const note of notes) {
    if (note.context.kind !== 'audio') continue
    if (note.resolvedAt !== null) continue
    if (!allowed.has(note.context.versionId)) continue
    counts[note.context.versionId] = (counts[note.context.versionId] ?? 0) + 1
  }
  return counts
}

/**
 * Total unresolved audio-root count across the allowed versions. Derived
 * from `countUnresolvedAudioNotesByVersion` so the header total and the
 * per-row numbers it is built from can never drift apart.
 */
export function countUnresolvedAudioNotes(
  notes: StudioNoteThreadView[],
  versionIds: Iterable<string>
): number {
  const byVersion = countUnresolvedAudioNotesByVersion(notes, versionIds)
  return Object.values(byVersion).reduce((sum, count) => sum + count, 0)
}

/**
 * Unresolved lyric-root count per block. Zero-count blocks are omitted so a
 * block's own Comments control only ever shows a number it can back up.
 */
export function countUnresolvedLyricNotesByBlock(
  notes: StudioNoteThreadView[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const note of notes) {
    if (note.context.kind !== 'lyrics') continue
    if (note.resolvedAt !== null) continue
    counts[note.context.blockId] = (counts[note.context.blockId] ?? 0) + 1
  }
  return counts
}

/**
 * Resolves a historical `?studioNote=<id>` id to the lyric block it belongs
 * to, matching either a thread's root id or any of its reply ids. Returns
 * null for a song or audio id, an id that matches nothing, or a missing id —
 * the only cases where the old deep-link form should do nothing.
 */
export function resolveLyricNoteDeepLink(
  notes: StudioNoteThreadView[],
  noteId: string | null | undefined
): { blockId: string; label: string } | null {
  if (!noteId) return null
  for (const note of notes) {
    const matches = note.id === noteId || note.replies.some(reply => reply.id === noteId)
    if (!matches) continue
    if (note.context.kind !== 'lyrics') return null
    return { blockId: note.context.blockId, label: note.context.label }
  }
  return null
}
