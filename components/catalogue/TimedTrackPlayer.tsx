'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'
import { clearTextDraft, readTextDraft, writeTextDraft } from '@/lib/catalogue/local-drafts'
import type {
  LyricCommentParticipant,
  WorkVersionCommentCarryOffer,
  WorkVersionCommentView,
} from '@/types/catalogue'

type TimedTrackPlayerProps = {
  workId: string
  versionId: string
  display: string
  description: string
  label?: string | null
  playbackUrl: string
  downloadUrl?: string | null
  durationSeconds: number | null
  isLatest: boolean
  isAiTagged: boolean
  isWorking?: boolean
  refreshToken: number
  onActivity: (playing: boolean) => void
  onCommentChanged: () => void
  onRecordOver?: () => void
  onArchive?: () => Promise<void>
  onRename?: (label: string) => Promise<{ ok: boolean; error?: string }>
  onMakeWorking?: () => Promise<{ ok: boolean; error?: string }>
  recordOverLabel?: string
  draftOwnerId?: string
}

type CommentsResponse = {
  data?: WorkVersionCommentView[]
  participants?: LyricCommentParticipant[]
  carryOffer?: WorkVersionCommentCarryOffer | null
  error?: string
}

const WAVE_BARS = [
  35, 52, 74, 43, 88, 61, 38, 79, 55, 91, 66, 47,
  83, 58, 31, 72, 49, 86, 63, 41, 77, 54, 93, 68,
  36, 81, 57, 45, 89, 62, 33, 75, 51, 84, 59, 39,
  78, 53, 90, 65, 42, 82, 56, 34, 73, 48, 87, 60,
]

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function CommentText({ comment }: { comment: WorkVersionCommentView }) {
  const handles = new Set(comment.mentioned.map(person => person.handle?.toLowerCase()).filter(Boolean))
  const parts = comment.body.split(/(@[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*)/g)
  return (
    <p className="whitespace-pre-wrap text-[11px] leading-5 text-lav">
      {parts.map((part, index) => {
        const handle = part.startsWith('@') ? part.slice(1).toLowerCase() : null
        return handle && handles.has(handle) ? (
          <span key={`${part}-${index}`} className="font-semibold text-brandindigo">{part}</span>
        ) : <span key={`${part}-${index}`}>{part}</span>
      })}
    </p>
  )
}

export function TimedTrackPlayer({
  workId,
  versionId,
  display,
  description,
  label = null,
  playbackUrl,
  downloadUrl = null,
  durationSeconds,
  isLatest,
  isAiTagged,
  isWorking = false,
  refreshToken,
  onActivity,
  onCommentChanged,
  onRecordOver,
  onArchive,
  onRename,
  onMakeWorking,
  recordOverLabel = '● Record over this beat',
  draftOwnerId = 'viewer',
}: TimedTrackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(Math.max(0, Math.round((durationSeconds ?? 0) * 1000)))
  const [positionMs, setPositionMs] = useState(0)
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<WorkVersionCommentView[]>([])
  const [participants, setParticipants] = useState<LyricCommentParticipant[]>([])
  const [carryOffer, setCarryOffer] = useState<WorkVersionCommentCarryOffer | null>(null)
  const [reviewingCarry, setReviewingCarry] = useState(false)
  const [selectedCarryIds, setSelectedCarryIds] = useState<string[]>([])
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [labelDraft, setLabelDraft] = useState(label ?? '')
  const [takeSaving, setTakeSaving] = useState(false)
  const [takeError, setTakeError] = useState<string | null>(null)
  const commentDraftKey = `funun:user:${draftOwnerId}:work:${workId}:version:${versionId}:comment-draft`

  useEffect(() => {
    const recovered = readTextDraft(commentDraftKey)
    if (recovered?.text) setDraft(recovered.text)
  }, [commentDraftKey])

  useEffect(() => setLabelDraft(label ?? ''), [label])

  async function saveTakeName() {
    if (!onRename || takeSaving) return
    setTakeSaving(true)
    setTakeError(null)
    const result = await onRename(labelDraft)
    setTakeSaving(false)
    if (!result.ok) setTakeError(result.error ?? 'Could not rename that take.')
    else setRenaming(false)
  }

  async function makeWorkingTake() {
    if (!onMakeWorking || takeSaving || isWorking) return
    setTakeSaving(true)
    setTakeError(null)
    const result = await onMakeWorking()
    setTakeSaving(false)
    if (!result.ok) setTakeError(result.error ?? 'Could not choose that working take.')
  }

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments`, { cache: 'no-store' })
    const body = (await response.json().catch(() => ({}))) as CommentsResponse
    if (!response.ok) {
      setError(body.error ?? 'Could not load comments for this take.')
      setLoading(false)
      return
    }
    const nextComments = Array.isArray(body.data) ? body.data : []
    setComments(nextComments)
    setParticipants(Array.isArray(body.participants) ? body.participants : [])
    setCarryOffer(isLatest ? body.carryOffer ?? null : null)
    setSelectedCarryIds((body.carryOffer?.comments ?? []).map(comment => comment.id))
    setError(null)
    setLoading(false)

    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search)
      if (query.get('version') === versionId) {
        const linkedCommentId = query.get('comment')
        const linked = nextComments.find(comment => comment.id === linkedCommentId)
        const linkedRootId = linked?.parentCommentId ?? linked?.id ?? null
        const linkedPosition = Number(query.get('t'))
        if (Number.isFinite(linkedPosition) && linkedPosition >= 0) setPositionMs(linkedPosition)
        if (linkedRootId) setSelectedRootId(linkedRootId)
        setOpen(true)
      }
    }
  }, [isLatest, versionId, workId])

  useEffect(() => {
    setLoading(true)
    void loadComments()
  }, [loadComments, refreshToken])

  const roots = useMemo(
    () => comments.filter(comment => comment.parentCommentId === null).sort((a, b) => a.timestampMs - b.timestampMs),
    [comments]
  )
  const unresolvedCount = roots.filter(comment => comment.resolvedAt === null).length
  const selectedRoot = roots.find(comment => comment.id === selectedRootId) ?? null
  const replies = selectedRoot
    ? comments.filter(comment => comment.parentCommentId === selectedRoot.id)
    : []
  const mentionable = participants.filter(person => person.handle)
  const effectiveDurationMs = Math.max(durationMs, positionMs, 1000)

  function seek(nextMs: number) {
    const clamped = Math.max(0, Math.min(effectiveDurationMs, nextMs))
    setPositionMs(clamped)
    if (audioRef.current) audioRef.current.currentTime = clamped / 1000
  }

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      await audio.play().catch(() => setError('Playback could not start. Try again.'))
    } else {
      audio.pause()
    }
  }

  function selectComment(comment: WorkVersionCommentView) {
    setOpen(true)
    setSelectedRootId(comment.id)
    setReplyingToId(null)
    seek(comment.timestampMs)
  }

  function insertMention(handle: string) {
    setDraft(current => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${handle} `)
  }

  async function submitComment() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, timestampMs: Math.round(positionMs), parentCommentId: replyingToId }),
    })
    const result = (await response.json().catch(() => ({}))) as { data?: { id?: string }; error?: string }
    if (!response.ok) {
      setError(result.error ?? 'Could not post that timed comment.')
      setSaving(false)
      return
    }
    setDraft('')
    clearTextDraft(commentDraftKey)
    setReplyingToId(null)
    await loadComments()
    if (result.data?.id) setSelectedRootId(replyingToId ?? result.data.id)
    setOpen(true)
    setSaving(false)
    onCommentChanged()
  }

  async function setResolved(comment: WorkVersionCommentView, resolved: boolean) {
    if (saving) return
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments/${comment.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) setError(result.error ?? 'Could not update that thread.')
    else {
      await loadComments()
      onCommentChanged()
    }
    setSaving(false)
  }

  async function saveCarryChoice(sourceCommentIds: string[]) {
    if (saving) return
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments/carry-forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceCommentIds }),
    })
    const result = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      setError(result.error ?? 'Could not save that choice.')
      setSaving(false)
      return
    }
    setCarryOffer(null)
    setReviewingCarry(false)
    await loadComments()
    setOpen(sourceCommentIds.length > 0)
    setSaving(false)
    onCommentChanged()
  }

  return (
    <div className="rounded-[11px] border border-hair bg-card px-3 py-3">
      <audio
        ref={audioRef}
        src={playbackUrl}
        preload="metadata"
        onLoadedMetadata={event => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds) && seconds >= 0) setDurationMs(Math.round(seconds * 1000))
        }}
        onTimeUpdate={event => setPositionMs(Math.round(event.currentTarget.currentTime * 1000))}
        onPlay={() => { setPlaying(true); onActivity(true) }}
        onPause={() => { setPlaying(false); onActivity(false) }}
        onEnded={() => { setPlaying(false); onActivity(false) }}
        className="hidden"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] font-semibold text-white">
            <span className="truncate">{display} {description}</span>
            {isWorking && <span className="rounded-full border border-brandindigo/50 bg-brandindigo/10 px-2 py-0.5 text-[8px] uppercase tracking-[.1em] text-brandindigo">Working take</span>}
          </p>
          <p className="mt-0.5 text-[9px] text-lavdim">
            {isAiTagged ? 'AI noted · ' : ''}{unresolvedCount} unresolved {unresolvedCount === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void togglePlayback()}
          aria-label={`${playing ? 'Pause' : 'Play'} ${display}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairstrong bg-card2 text-[12px] text-white hover:border-brandindigo"
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
      </div>

      {renaming && onRename && (
        <div className="mt-3 rounded-[8px] border border-hair bg-card2 p-2.5">
          <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Take name<input autoFocus type="text" value={labelDraft} maxLength={200} placeholder="Hook idea, Maya’s favorite…" onChange={event => setLabelDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void saveTakeName(); if (event.key === 'Escape') setRenaming(false) }} className="mt-1.5 w-full rounded-[8px] border border-hairstrong bg-card px-2.5 py-2 text-[11px] font-normal normal-case tracking-normal text-white outline-none placeholder:text-lavdim focus:border-brandindigo" /></label>
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" disabled={takeSaving} onClick={() => { setLabelDraft(label ?? ''); setRenaming(false) }} className="text-[9px] text-lavdim hover:text-white disabled:opacity-40">Cancel</button>
            <button type="button" disabled={takeSaving} onClick={() => void saveTakeName()} className="text-[9px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{takeSaving ? 'Saving…' : labelDraft.trim() ? 'Save name' : 'Clear name'}</button>
          </div>
        </div>
      )}

      <div className="relative mt-3 h-[58px]" aria-label={`Timeline for ${display}`}>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-9 items-center gap-px overflow-hidden">
          {WAVE_BARS.map((height, index) => (
            <span
              key={index}
              className={`min-w-px flex-1 rounded-full ${index / WAVE_BARS.length <= positionMs / effectiveDurationMs ? 'bg-brandindigo' : 'bg-lavdim/35'}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={effectiveDurationMs}
          step={100}
          value={Math.min(positionMs, effectiveDurationMs)}
          onChange={event => seek(Number(event.target.value))}
          aria-label={`Seek ${display}`}
          className="absolute inset-x-0 top-0 h-9 w-full cursor-pointer opacity-0"
        />
        {roots.map(comment => (
          <button
            key={comment.id}
            type="button"
            onClick={() => selectComment(comment)}
            aria-label={`${comment.resolvedAt ? 'Resolved' : 'Open'} comment at ${formatTrackTimestamp(comment.timestampMs)}`}
            className={`absolute top-8 -translate-x-1/2 text-[10px] ${comment.resolvedAt ? 'text-lavdim' : 'text-brandindigo'}`}
            style={{ left: `${Math.min(100, (comment.timestampMs / effectiveDurationMs) * 100)}%` }}
          >
            <span className="block text-[11px]">●</span>
          </button>
        ))}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-lavdim">
          <span>{formatTrackTimestamp(positionMs)}</span>
          <span>{formatTrackTimestamp(effectiveDurationMs)}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hair pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(current => !current)}
            className="text-[10px] font-semibold text-brandindigo hover:text-white"
          >
            {open ? 'Hide comments' : `Comment at ${formatTrackTimestamp(positionMs)}`}
          </button>
          <button type="button" onClick={onRecordOver} className="text-[10px] font-semibold text-brandfuchsia hover:text-white">
            {recordOverLabel}
          </button>
          {downloadUrl && <a href={downloadUrl} download aria-label={`Download ${display} ${description}`} className="text-[10px] text-lavdim hover:text-white">Download</a>}
          {onRename && <button type="button" disabled={takeSaving} onClick={() => { setTakeError(null); setRenaming(current => !current) }} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">Name</button>}
          {!isWorking && onMakeWorking && <button type="button" disabled={takeSaving} onClick={() => void makeWorkingTake()} className="text-[10px] text-lavdim hover:text-brandindigo disabled:opacity-40">Make working</button>}
          {onArchive && <button type="button" onClick={() => void onArchive()} className="text-[10px] text-lavdim hover:text-white">Archive</button>}
        </div>
        {roots.length > 0 && <span className="text-[9px] text-lavdim">Click a marker to open its thread</span>}
      </div>
      {takeError && <p role="alert" className="mt-2 text-[10px] text-red-300">{takeError}</p>}

      {isLatest && carryOffer && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-[11px] font-semibold text-white">Bring notes forward from {carryOffer.sourceVersionDisplay}?</p>
          <p className="mt-1 text-[10px] leading-4 text-lavdim">Choose unresolved mix notes to copy here, or start this take fresh. Nothing moves automatically.</p>
          {!reviewingCarry ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" onClick={() => setReviewingCarry(true)} className="text-[10px] font-semibold text-brandindigo hover:text-white">
                Review {carryOffer.comments.length} {carryOffer.comments.length === 1 ? 'note' : 'notes'}
              </button>
              <button type="button" disabled={saving} onClick={() => void saveCarryChoice([])} className="text-[10px] text-lavdim hover:text-white disabled:opacity-50">
                Start fresh
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {carryOffer.comments.map(comment => (
                <label key={comment.id} className="flex cursor-pointer items-start gap-2 rounded-[9px] border border-hair bg-card2 px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={selectedCarryIds.includes(comment.id)}
                    onChange={event => setSelectedCarryIds(current => event.target.checked
                      ? [...current, comment.id]
                      : current.filter(id => id !== comment.id))}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 text-[10px] leading-4 text-lav">
                    <b className="text-white">{formatTrackTimestamp(comment.timestampMs)}</b> · {comment.body}
                  </span>
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button type="button" disabled={saving} onClick={() => void saveCarryChoice(selectedCarryIds)} className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-50">
                  {saving ? 'Copying…' : `Carry ${selectedCarryIds.length} selected`}
                </button>
                <button type="button" disabled={saving} onClick={() => setReviewingCarry(false)} className="text-[10px] text-lavdim hover:text-white disabled:opacity-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 border-t border-hair pt-3">
          {loading ? (
            <p className="text-[10px] text-lavdim">Loading comments…</p>
          ) : selectedRoot ? (
            <div className="space-y-2">
              <div className={`rounded-[9px] border border-hairstrong bg-card2 p-2.5 ${selectedRoot.resolvedAt ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brandindigo/15 text-[9px] font-bold text-brandindigo">
                      {initials(selectedRoot.author?.name ?? 'Former member')}
                    </span>
                    <span className="min-w-0">
                      <b className="block truncate text-[10px] text-white">{selectedRoot.author?.name ?? 'Former member'}</b>
                      <span className="text-[9px] text-lavdim">{formatTrackTimestamp(selectedRoot.timestampMs)} · {formatDate(selectedRoot.createdAt)}</span>
                    </span>
                  </span>
                  {selectedRoot.carriedFromVersionDisplay && (
                    <span className="shrink-0 rounded-full border border-hair px-2 py-1 text-[8px] text-lavdim">From {selectedRoot.carriedFromVersionDisplay}</span>
                  )}
                </div>
                <div className="mt-2"><CommentText comment={selectedRoot} /></div>
                <div className="mt-2 flex flex-wrap gap-3 border-t border-hair pt-2">
                  {!selectedRoot.resolvedAt && (
                    <button type="button" onClick={() => setReplyingToId(selectedRoot.id)} className="text-[9px] text-lavdim hover:text-white">Reply</button>
                  )}
                  {selectedRoot.canResolve && (
                    <button type="button" disabled={saving} onClick={() => void setResolved(selectedRoot, !selectedRoot.resolvedAt)} className="text-[9px] font-semibold text-brandindigo hover:text-white disabled:opacity-50">
                      {selectedRoot.resolvedAt ? 'Reopen thread' : 'Resolve thread'}
                    </button>
                  )}
                </div>
              </div>
              {replies.map(reply => (
                <div key={reply.id} className="ml-4 rounded-[9px] border border-hair bg-card2/70 p-2.5">
                  <p className="text-[9px] text-lavdim"><b className="text-white">{reply.author?.name ?? 'Former member'}</b> · {formatDate(reply.createdAt)}</p>
                  <div className="mt-1"><CommentText comment={reply} /></div>
                </div>
              ))}
            </div>
          ) : roots.length > 0 ? (
            <p className="text-[10px] text-lavdim">Choose a marker, or leave a new note at {formatTrackTimestamp(positionMs)}.</p>
          ) : (
            <p className="text-[10px] text-lavdim">No timed comments yet. Play or seek to the moment you want to discuss.</p>
          )}

          {replyingToId && (
            <div className="mt-3 flex items-center justify-between gap-2 text-[9px] text-lavdim">
              <span>Replying to the note at {formatTrackTimestamp(selectedRoot?.timestampMs ?? positionMs)}</span>
              <button type="button" onClick={() => setReplyingToId(null)} className="hover:text-white">Cancel reply</button>
            </div>
          )}
          <textarea
            value={draft}
            onChange={event => {
              setDraft(event.target.value)
              writeTextDraft(commentDraftKey, event.target.value)
            }}
            rows={2}
            maxLength={2000}
            placeholder={replyingToId ? 'Reply to this thread' : `Leave a note at ${formatTrackTimestamp(positionMs)}`}
            className="mt-3 w-full resize-none rounded-[9px] border border-hair bg-card2 px-3 py-2 text-[11px] leading-5 text-white outline-none placeholder:text-lavdim focus:border-brandindigo"
          />
          {mentionable.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[9px] text-lavdim">Mention:</span>
              {mentionable.map(person => (
                <button key={person.userId} type="button" onClick={() => insertMention(person.handle!)} className="rounded-full border border-hairstrong px-2 py-1 text-[9px] text-lavdim hover:text-white">
                  @{person.handle}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <button type="button" disabled={saving || !draft.trim()} onClick={() => void submitComment()} className="rounded-[8px] border border-hairstrong bg-card2 px-3 py-1.5 text-[10px] font-semibold text-white hover:border-brandindigo disabled:opacity-40">
              {saving ? 'Posting…' : replyingToId ? 'Post reply' : `Post at ${formatTrackTimestamp(positionMs)}`}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[10px] leading-4 text-red-300">{error}</p>}
    </div>
  )
}
