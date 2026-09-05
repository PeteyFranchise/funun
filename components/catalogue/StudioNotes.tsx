'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  LyricCommentParticipant,
  StudioNoteContext,
  StudioNoteSource,
  StudioNoteThreadView,
} from '@/types/catalogue'
import { studioNoteMatchesFilter } from '@/lib/catalogue/studio-notes'
import { clearTextDraft, readTextDraft, writeTextDraft } from '@/lib/catalogue/local-drafts'
import { MicroReactionBar } from './MicroReactionBar'

type NoteFilter = 'all' | 'mine' | 'open' | 'resolved'

type StudioNotesProps = {
  workId: string
  viewerUserId: string
  notes: StudioNoteThreadView[]
  participants: LyricCommentParticipant[]
  versions: { id: string; label: string; durationSeconds: number | null }[]
  lyricBlocks: { id: string; label: string }[]
  composerOpen: boolean
  onComposerOpenChange: (open: boolean) => void
  highlightedNoteId?: string | null
  onChanged: () => void
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatTimestamp(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function parseTimestamp(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3}):([0-5]\d)$/)
  if (!match) return null
  return (Number(match[1]) * 60 + Number(match[2])) * 1000
}

function MentionText({ body, recipients }: { body: string; recipients: LyricCommentParticipant[] }) {
  const handles = new Set(recipients.flatMap(recipient => recipient.handle ? [recipient.handle.toLowerCase()] : []))
  return (
    <>
      {body.split(/(@[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)/g).map((part, index) => {
        const handle = part.startsWith('@') ? part.slice(1).toLowerCase() : ''
        return handle && handles.has(handle)
          ? <strong key={`${part}-${index}`} className="text-brandindigo">{part}</strong>
          : <span key={`${part}-${index}`}>{part}</span>
      })}
    </>
  )
}

function Avatar({ person }: { person: LyricCommentParticipant | null }) {
  const name = person?.name ?? 'Former member'
  return (
    <span
      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brandindigo to-brandfuchsia bg-cover bg-center text-[9px] font-black text-white"
      style={person?.avatarUrl ? { backgroundImage: `url(${JSON.stringify(person.avatarUrl)})` } : undefined}
      aria-hidden="true"
    >
      {!person?.avatarUrl ? initials(name) : null}
    </span>
  )
}

function contextRequest(context: StudioNoteContext) {
  if (context.kind === 'audio') return { versionId: context.versionId, timestampMs: context.timestampMs }
  if (context.kind === 'lyrics') return { blockId: context.blockId }
  return {}
}

function NoteComposer({
  workId,
  participants,
  versions,
  lyricBlocks,
  viewerUserId,
  replyTo,
  onCancel,
  onChanged,
}: {
  workId: string
  participants: LyricCommentParticipant[]
  versions: StudioNotesProps['versions']
  lyricBlocks: StudioNotesProps['lyricBlocks']
  viewerUserId: string
  replyTo: StudioNoteThreadView | null
  onCancel: () => void
  onChanged: () => void
}) {
  const initialSource = replyTo?.source ?? 'song'
  const [source, setSource] = useState<StudioNoteSource>(initialSource)
  const [versionId, setVersionId] = useState(replyTo?.context.kind === 'audio' ? replyTo.context.versionId : versions[0]?.id ?? '')
  const [timestamp, setTimestamp] = useState(replyTo?.context.kind === 'audio' ? formatTimestamp(replyTo.context.timestampMs) : '0:00')
  const [blockId, setBlockId] = useState(replyTo?.context.kind === 'lyrics' ? replyTo.context.blockId : lyricBlocks[0]?.id ?? '')
  const [recipientIds, setRecipientIds] = useState<string[]>(replyTo?.author ? [replyTo.author.userId] : [])
  const draftKey = `funun:user:${viewerUserId}:work:${workId}:studio-note:${replyTo?.id ?? 'new'}`
  const [body, setBody] = useState(() => readTextDraft(draftKey)?.text ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectableParticipants = participants.filter(person => person.userId !== viewerUserId)

  function toggleRecipient(person: LyricCommentParticipant) {
    setRecipientIds(current => current.includes(person.userId)
      ? current.filter(id => id !== person.userId)
      : [...current, person.userId])
    if (person.handle && !body.toLowerCase().includes(`@${person.handle.toLowerCase()}`)) {
      const next = `${body}${body && !/\s$/.test(body) ? ' ' : ''}@${person.handle} `
      setBody(next)
      writeTextDraft(draftKey, next)
    }
  }

  function selectEveryone() {
    const ids = selectableParticipants.map(person => person.userId)
    const allSelected = ids.length > 0 && ids.every(id => recipientIds.includes(id))
    setRecipientIds(allSelected ? [] : ids)
  }

  async function submit() {
    if (!body.trim() || saving) return
    const timestampMs = source === 'audio' ? parseTimestamp(timestamp) : null
    if (source === 'audio' && timestampMs === null) {
      setError('Use a timestamp like 1:45.')
      return
    }
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/studio-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        body: body.trim(),
        recipientUserIds: recipientIds,
        parentId: replyTo?.id ?? null,
        versionId: source === 'audio' ? versionId : null,
        timestampMs,
        blockId: source === 'lyrics' ? blockId : null,
      }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    setSaving(false)
    if (!response.ok) {
      setError(result.error ?? 'Could not leave that note.')
      return
    }
    clearTextDraft(draftKey)
    setBody('')
    onCancel()
    onChanged()
  }

  return (
    <div className="rounded-[11px] border border-brandindigo/35 bg-card2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold text-white">{replyTo ? `Reply to ${replyTo.author?.name ?? 'this note'}` : 'Leave a studio note'}</p>
          <p className="mt-0.5 text-[10px] text-lavdim">Creative context only—nothing here changes the song.</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Close note composer" className="text-lavdim hover:text-white">×</button>
      </div>

      {!replyTo ? (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Attach note to">
          {(['song', 'audio', 'lyrics'] as StudioNoteSource[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setSource(option)}
              aria-pressed={source === option}
              disabled={(option === 'audio' && versions.length === 0) || (option === 'lyrics' && lyricBlocks.length === 0)}
              className={`rounded-full border px-2.5 py-1 text-[10px] disabled:opacity-30 ${source === option ? 'border-brandindigo bg-brandindigo/15 text-white' : 'border-hairstrong text-lavdim hover:text-white'}`}
            >
              {option === 'song' ? 'Whole song' : option === 'audio' ? 'Audio moment' : 'Lyric section'}
            </button>
          ))}
        </div>
      ) : <p className="mt-3 text-[10px] font-semibold text-brandindigo">{replyTo.context.label}</p>}

      {!replyTo && source === 'audio' ? (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_88px] gap-2">
          <select value={versionId} onChange={event => setVersionId(event.target.value)} aria-label="Recording version" className="rounded-[8px] border border-hair bg-card px-2.5 py-2 text-[11px] text-white outline-none">
            {versions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
          </select>
          <input value={timestamp} onChange={event => setTimestamp(event.target.value)} aria-label="Timestamp" placeholder="1:45" className="rounded-[8px] border border-hair bg-card px-2.5 py-2 text-[11px] text-white outline-none" />
        </div>
      ) : null}

      {!replyTo && source === 'lyrics' ? (
        <select value={blockId} onChange={event => setBlockId(event.target.value)} aria-label="Lyric section" className="mt-3 w-full rounded-[8px] border border-hair bg-card px-2.5 py-2 text-[11px] text-white outline-none">
          {lyricBlocks.map(block => <option key={block.id} value={block.id}>{block.label}</option>)}
        </select>
      ) : null}

      {!replyTo && selectableParticipants.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] text-lavdim">For:</span>
          {selectableParticipants.map(person => (
            <button key={person.userId} type="button" onClick={() => toggleRecipient(person)} aria-pressed={recipientIds.includes(person.userId)} className={`rounded-full border px-2 py-1 text-[9px] ${recipientIds.includes(person.userId) ? 'border-brandindigo bg-brandindigo/15 text-white' : 'border-hairstrong text-lavdim hover:text-white'}`}>
              @{person.handle ?? person.name}
            </button>
          ))}
          {selectableParticipants.length > 1 ? <button type="button" onClick={selectEveryone} className="rounded-full border border-hairstrong px-2 py-1 text-[9px] text-lavdim hover:text-white">@everyone</button> : null}
        </div>
      ) : null}

      <textarea
        value={body}
        onChange={event => {
          setBody(event.target.value)
          writeTextDraft(draftKey, event.target.value)
        }}
        rows={3}
        maxLength={2000}
        autoFocus
        placeholder={replyTo ? 'Write a reply…' : 'What should they hear, try, or remember?'}
        className="mt-3 w-full resize-none rounded-[9px] border border-hair bg-card px-3 py-2 text-[11px] leading-5 text-white outline-none placeholder:text-lavdim focus:border-brandindigo"
      />
      {error ? <p role="alert" className="mt-2 text-[10px] text-red-300">{error}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[9px] text-lavdim">Draft saves automatically</span>
        <button type="button" disabled={saving || !body.trim()} onClick={() => void submit()} className="rounded-[8px] bg-grad px-3 py-1.5 text-[10px] font-semibold text-white shadow-cta disabled:opacity-40">
          {saving ? 'Leaving…' : replyTo ? 'Post reply' : 'Leave note'}
        </button>
      </div>
    </div>
  )
}

function NoteThread({
  workId,
  note,
  viewerUserId,
  participants,
  versions,
  lyricBlocks,
  busyKey,
  onBusy,
  onChanged,
  highlightedNoteId,
}: {
  workId: string
  note: StudioNoteThreadView
  viewerUserId: string
  participants: LyricCommentParticipant[]
  versions: StudioNotesProps['versions']
  lyricBlocks: StudioNotesProps['lyricBlocks']
  busyKey: string | null
  onBusy: (key: string | null) => void
  onChanged: () => void
  highlightedNoteId?: string | null
}) {
  const [replying, setReplying] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | null>(null)

  async function resolve() {
    const key = `resolve:${note.source}:${note.id}`
    if (busyKey) return
    onBusy(key)
    setResolutionError(null)
    const response = await fetch(`/api/works/${workId}/studio-notes/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: note.source,
        resolved: note.resolvedAt === null,
        ...contextRequest(note.context),
      }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    onBusy(null)
    if (response.ok) onChanged()
    else setResolutionError(result.error ?? 'Could not update this thread.')
  }

  const addressed = note.recipients.length > 0
    ? `to ${note.recipients.map(person => `@${person.handle ?? person.name}`).join(', ')}`
    : 'for the room'

  return (
    <article id={`studio-note-${note.id}`} className={`rounded-[10px] border bg-card2 p-3 ${highlightedNoteId === note.id ? 'border-brandindigo ring-2 ring-brandindigo/20' : 'border-hair'} ${note.resolvedAt ? 'opacity-65' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar person={note.author} />
          <span className="min-w-0">
            <b className="block truncate text-[11px] text-white">{note.author?.name ?? 'Former member'}</b>
            <span className="block truncate text-[9px] text-lavdim">{addressed} · {timeAgo(note.createdAt)}</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-hair px-2 py-1 text-[8px] font-semibold text-brandindigo">{note.context.label}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-lav"><MentionText body={note.body} recipients={note.recipients} /></p>
      <MicroReactionBar workId={workId} source={note.source} noteId={note.id} reactions={note.reactions} onChanged={onChanged} />

      {note.replies.length > 0 ? (
        <div className="mt-3 space-y-2 border-l border-hair pl-3">
          {note.replies.map(reply => (
            <div id={`studio-note-${reply.id}`} key={reply.id} className={`rounded-[8px] border bg-card px-2.5 py-2 ${highlightedNoteId === reply.id ? 'border-brandindigo ring-2 ring-brandindigo/20' : 'border-transparent'}`}>
              <p className="text-[9px] text-lavdim"><b className="text-white">{reply.author?.name ?? 'Former member'}</b> · {timeAgo(reply.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-[10px] leading-5 text-lav"><MentionText body={reply.body} recipients={reply.recipients} /></p>
              <MicroReactionBar workId={workId} source={reply.source} noteId={reply.id} reactions={reply.reactions} onChanged={onChanged} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-hair pt-2 text-[9px]">
        {!note.resolvedAt ? <button type="button" onClick={() => setReplying(open => !open)} className="text-lavdim hover:text-white">Reply</button> : null}
        {note.canResolve ? (
          <button type="button" disabled={busyKey !== null} onClick={() => void resolve()} className="font-semibold text-brandindigo hover:text-white disabled:opacity-40">
            {busyKey === `resolve:${note.source}:${note.id}` ? 'Saving…' : note.resolvedAt ? 'Reopen' : 'Resolve'}
          </button>
        ) : null}
        {note.context.kind === 'audio' ? <a href={`?version=${note.context.versionId}&comment=${note.id}&t=${note.context.timestampMs}`} className="text-lavdim hover:text-white">▶ Play from {formatTimestamp(note.context.timestampMs)}</a> : null}
        {note.context.kind === 'lyrics' ? <a href={`#lyric-${note.context.blockId}`} className="text-lavdim hover:text-white">Open lyric section</a> : null}
        {note.resolvedAt ? <span className="ml-auto text-lavdim">Resolved{note.resolvedByName ? ` by ${note.resolvedByName}` : ''}</span> : null}
      </div>
      {resolutionError ? <p role="alert" className="mt-2 text-[9px] text-red-300">{resolutionError}</p> : null}

      {replying ? (
        <div className="mt-3">
          <NoteComposer
            workId={workId}
            participants={participants}
            versions={versions}
            lyricBlocks={lyricBlocks}
            viewerUserId={viewerUserId}
            replyTo={note}
            onCancel={() => setReplying(false)}
            onChanged={onChanged}
          />
        </div>
      ) : null}
    </article>
  )
}

export function StudioNotes({
  workId,
  viewerUserId,
  notes,
  participants,
  versions,
  lyricBlocks,
  composerOpen,
  onComposerOpenChange,
  highlightedNoteId = null,
  onChanged,
}: StudioNotesProps) {
  const [filter, setFilter] = useState<NoteFilter>('open')
  const [showAll, setShowAll] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    if (composerOpen) setFilter('open')
  }, [composerOpen])

  useEffect(() => {
    if (!highlightedNoteId) return
    const thread = notes.find(note => note.id === highlightedNoteId || note.replies.some(reply => reply.id === highlightedNoteId))
    if (!thread) return
    setFilter(thread.resolvedAt ? 'resolved' : 'open')
    setShowAll(true)
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`studio-note-${highlightedNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightedNoteId, notes])

  const counts = useMemo(() => ({
    all: notes.length,
    mine: notes.filter(note => studioNoteMatchesFilter(note, 'mine', viewerUserId)).length,
    open: notes.filter(note => note.resolvedAt === null).length,
    resolved: notes.filter(note => note.resolvedAt !== null).length,
  }), [notes, viewerUserId])
  const filtered = notes.filter(note => studioNoteMatchesFilter(note, filter, viewerUserId))
  const visible = showAll ? filtered : filtered.slice(0, 6)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] text-lavdim">Leave direction, ask a question, or mark a moment for the room.</p>
        {!composerOpen ? <button type="button" onClick={() => onComposerOpenChange(true)} className="rounded-[8px] border border-brandindigo/60 bg-brandindigo/15 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-brandindigo/25">＋ Leave a note</button> : null}
      </div>

      {composerOpen ? (
        <div className="mt-3">
          <NoteComposer
            workId={workId}
            participants={participants}
            versions={versions}
            lyricBlocks={lyricBlocks}
            viewerUserId={viewerUserId}
            replyTo={null}
            onCancel={() => onComposerOpenChange(false)}
            onChanged={onChanged}
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filter Studio Notes">
        {(['all', 'mine', 'open', 'resolved'] as NoteFilter[]).map(option => (
          <button key={option} type="button" onClick={() => { setFilter(option); setShowAll(false) }} aria-pressed={filter === option} className={`rounded-full border px-2.5 py-1 text-[9px] ${filter === option ? 'border-brandindigo bg-brandindigo/15 text-white' : 'border-hairstrong text-lavdim hover:text-white'}`}>
            {option === 'all' ? 'All' : option === 'mine' ? 'For me' : option === 'open' ? 'Open' : 'Resolved'} · {counts[option]}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className="mt-3 space-y-2">
          {visible.map(note => (
            <NoteThread
              key={`${note.source}:${note.id}`}
              workId={workId}
              note={note}
              viewerUserId={viewerUserId}
              participants={participants}
              versions={versions}
              lyricBlocks={lyricBlocks}
              busyKey={busyKey}
              onBusy={setBusyKey}
              onChanged={onChanged}
              highlightedNoteId={highlightedNoteId}
            />
          ))}
        </div>
      ) : <p className="mt-4 text-[10px] text-lavdim">No {filter === 'all' ? '' : `${filter} `}notes yet.</p>}

      {filtered.length > 6 ? <button type="button" onClick={() => setShowAll(value => !value)} className="mt-3 text-[10px] font-semibold text-lav hover:text-white">{showAll ? 'Show less' : `Show all ${filtered.length}`}</button> : null}
    </div>
  )
}
