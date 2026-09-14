'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'
import { clearTextDraft, readTextDraft, writeTextDraft } from '@/lib/catalogue/local-drafts'
import { clampCarriedSpan, normalizeSpanDrag, spanGeometry, spanNeedsReposition } from '@/lib/catalogue/take-spans'
import { preRollStartMs } from '@/lib/catalogue/take-transport'
import {
  PEAKS_BAR_COUNT,
  REST_BAR_HEIGHT_PERCENT,
  extractPeaksFromUrl,
  isValidPeaksPayload,
} from '@/lib/catalogue/waveform'
import { MicroReactionBar } from './MicroReactionBar'
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
  onPullLyrics?: () => void
  onArchive?: () => Promise<void>
  onRename?: (label: string) => Promise<{ ok: boolean; error?: string }>
  onMakeWorking?: () => Promise<{ ok: boolean; error?: string }>
  recordOverLabel?: string
  draftOwnerId?: string
  /** Percent-height bars (0-100), fixed cardinality 200, computed client-side at take creation; null means not extracted yet — the player backfills it on first open. */
  peaks?: number[] | null
  /** Static-render test seam; production loads canonical comments through the existing version routes. Mirrors VersionComparisonPanel's identical seam. */
  initialComments?: WorkVersionCommentView[]
}

type CommentsResponse = {
  data?: WorkVersionCommentView[]
  participants?: LyricCommentParticipant[]
  carryOffer?: WorkVersionCommentCarryOffer | null
  error?: string
}

// A take's real shape is decoded at most once per version per page: keyed
// by version id so a remount, a refreshToken change, or a second mounted
// player for the same take can never start a second decode (T-39-18).
const backfillsInFlight = new Set<string>()

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
  onPullLyrics,
  onArchive,
  onRename,
  onMakeWorking,
  recordOverLabel = '● Record over this beat',
  draftOwnerId = 'viewer',
  peaks = null,
  initialComments,
}: TimedTrackPlayerProps) {
  const playerRef = useRef<HTMLDivElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [durationMs, setDurationMs] = useState(Math.max(0, Math.round((durationSeconds ?? 0) * 1000)))
  const [positionMs, setPositionMs] = useState(0)
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<WorkVersionCommentView[]>(initialComments ?? [])
  const [participants, setParticipants] = useState<LyricCommentParticipant[]>([])
  const [carryOffer, setCarryOffer] = useState<WorkVersionCommentCarryOffer | null>(null)
  const [reviewingCarry, setReviewingCarry] = useState(false)
  const [selectedCarryIds, setSelectedCarryIds] = useState<string[]>([])
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(initialComments === undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [labelDraft, setLabelDraft] = useState(label ?? '')
  const [takeSaving, setTakeSaving] = useState(false)
  const [takeError, setTakeError] = useState<string | null>(null)
  const [livePeaks, setLivePeaks] = useState<number[] | null>(peaks ?? null)
  const [waveformError, setWaveformError] = useState<string | null>(null)
  // ─── Mark-span mode (D-04) ───
  // A drag never creates a comment on its own — it only becomes a pending
  // span after normalizeSpanDrag accepts it, and only becomes a posted
  // comment after an explicit Confirm.
  const [spanMode, setSpanMode] = useState(false)
  const [dragAnchorMs, setDragAnchorMs] = useState<number | null>(null)
  const [dragPointerMs, setDragPointerMs] = useState<number | null>(null)
  const [pendingSpan, setPendingSpan] = useState<{ startMs: number; endMs: number } | null>(null)
  const spanLayerRef = useRef<HTMLDivElement | null>(null)
  // ─── Review playback (D-05, D-06) ───
  // A ref, not state: read only inside the audio element's onTimeUpdate
  // handler, never rendered, so updating it never needs to trigger a
  // re-render. Cleared whenever the selection changes, the writer seeks
  // manually, or the mode changes.
  const stopPointMsRef = useRef<number | null>(null)
  const [loopEnabled, setLoopEnabled] = useState(false)
  const commentDraftKey = `funun:user:${draftOwnerId}:work:${workId}:version:${versionId}:comment-draft`
  // A payload that fails the shared validator is treated exactly like a
  // missing one — the server and the browser agree on what a peaks array
  // is, and a corrupt array must never be drawn (T-39-19).
  const drawnPeaks = isValidPeaksPayload(livePeaks) ? livePeaks : null

  useEffect(() => {
    const recovered = readTextDraft(commentDraftKey)
    if (recovered?.text) setDraft(recovered.text)
  }, [commentDraftKey])

  useEffect(() => setLabelDraft(label ?? ''), [label])

  useEffect(() => setLivePeaks(peaks ?? null), [peaks])

  // D-03's one-time backfill: a take with no valid stored shape decodes its
  // own audio once, on first open, and heals itself for every future
  // viewer via the PATCH below — never a retry loop within one mount.
  useEffect(() => {
    if (drawnPeaks !== null) return
    if (!playbackUrl) return
    if (backfillsInFlight.has(versionId)) return
    backfillsInFlight.add(versionId)
    let resolved = false
    extractPeaksFromUrl(playbackUrl)
      .then(async nextPeaks => {
        resolved = true
        try {
          await fetch(`/api/works/${workId}/versions/${versionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ peaks: nextPeaks }),
          })
        } catch {
          // Best-effort persistence — the current viewer still sees the
          // real shape even if the write-back failed; the next opener
          // simply triggers another one-time decode.
        }
        setLivePeaks(nextPeaks)
      })
      .catch(() => {
        resolved = true
        setWaveformError("Couldn't read this take's waveform. It'll retry automatically.")
      })
    return () => {
      // Only release the slot if the decode never resolved — a genuinely
      // completed attempt (success or failure) must not retry this mount.
      if (!resolved) backfillsInFlight.delete(versionId)
    }
  }, [drawnPeaks, playbackUrl, versionId, workId])

  // D-04: Esc exits Mark-span mode even while the comment composer holds
  // focus — this is the one key deliberately exempt from the typing-surface
  // suppression that guards every other shortcut, and only while this mode
  // is live. The listener is registered only while spanMode is active and
  // released on mode exit and on unmount, per T-39-26.
  useEffect(() => {
    if (!spanMode) return
    function handleSpanEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setPendingSpan(null)
      setSpanMode(false)
      setDragAnchorMs(null)
      setDragPointerMs(null)
    }
    document.addEventListener('keydown', handleSpanEscape)
    return () => document.removeEventListener('keydown', handleSpanEscape)
  }, [spanMode])

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
    if (initialComments !== undefined) return
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
        window.requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      }
    }
  }, [initialComments, isLatest, versionId, workId])

  useEffect(() => {
    if (initialComments !== undefined) return
    setLoading(true)
    void loadComments()
  }, [initialComments, loadComments, refreshToken])

  const roots = useMemo(
    () => comments.filter(comment => comment.parentCommentId === null).sort((a, b) => a.timestampMs - b.timestampMs),
    [comments]
  )
  const markerGroups = useMemo(() => {
    const groups = new Map<number, WorkVersionCommentView[]>()
    for (const comment of roots) {
      const key = Math.round(comment.timestampMs / 100) * 100
      const group = groups.get(key) ?? []
      group.push(comment)
      groups.set(key, group)
    }
    return Array.from(groups.entries()).map(([timestampMs, groupedComments]) => ({ timestampMs, comments: groupedComments }))
  }, [roots])
  const unresolvedCount = roots.filter(comment => comment.resolvedAt === null).length
  const visibleNoteCount = unresolvedCount > 0 ? unresolvedCount : roots.length
  const selectedRoot = roots.find(comment => comment.id === selectedRootId) ?? null
  const selectedRootIndex = selectedRoot ? roots.findIndex(comment => comment.id === selectedRoot.id) : -1
  const replies = selectedRoot
    ? comments.filter(comment => comment.parentCommentId === selectedRoot.id)
    : []
  const mentionable = participants.filter(person => person.handle)
  const effectiveDurationMs = Math.max(durationMs, positionMs, 1000)
  // D-07: this take's own known duration, or null before audio metadata has
  // loaded — spanNeedsReposition/clampCarriedSpan both treat null duration
  // as "unknown, don't flag," never as zero.
  const carryTargetDurationMs = durationMs > 0 ? durationMs : null

  function seek(nextMs: number) {
    const clamped = Math.max(0, Math.min(effectiveDurationMs, nextMs))
    setPositionMs(clamped)
    // A manual seek always clears the stop point — a writer dragging the
    // scrubber has taken over from the pre-roll/play-once behaviour.
    stopPointMsRef.current = null
    if (audioRef.current) audioRef.current.currentTime = clamped / 1000
  }

  // The single review-seek helper: every entry point that opens a comment
  // (selectComment below, and the keyboard bindings plan 39-10 adds) routes
  // through here, so pre-roll, the play-once stop point, and the loop reset
  // all happen exactly once, in exactly one place.
  function reviewSeekTo(comment: WorkVersionCommentView) {
    const targetMs = comment.timestampMs
    setPositionMs(targetMs)
    if (audioRef.current) audioRef.current.currentTime = preRollStartMs(targetMs) / 1000
    setLoopEnabled(false)
    if (comment.endTimestampMs != null) {
      stopPointMsRef.current = comment.endTimestampMs
      void audioRef.current?.play().catch(() => setError('Playback could not start. Try again.'))
    } else {
      stopPointMsRef.current = null
    }
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

  // ─── Mark-span mode (D-04) ───
  // A single pointer-event code path serves both touch and mouse, which is
  // what makes the one-interaction-model requirement real: the same three
  // handlers below run whether the drag came from a finger or a cursor.
  function msFromClientX(clientX: number): number {
    const rect = spanLayerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * effectiveDurationMs
  }

  function enterSpanMode() {
    setPendingSpan(null)
    setDragAnchorMs(null)
    setDragPointerMs(null)
    stopPointMsRef.current = null
    setSpanMode(true)
  }

  function exitSpanMode() {
    setSpanMode(false)
    setDragAnchorMs(null)
    setDragPointerMs(null)
  }

  function confirmSpan() {
    if (!pendingSpan) return
    // Show the new-comment composer, not a previously open thread — a
    // confirmed span is always a new top-level comment.
    setSelectedRootId(null)
    setReplyingToId(null)
    setOpen(true)
    exitSpanMode()
  }

  function cancelSpan() {
    setPendingSpan(null)
    exitSpanMode()
  }

  // D-07: a carried span whose in-point no longer fits this take is never
  // silently dropped or collapsed to a point. Reposition re-enters the same
  // Mark-span mode Task 1 built — no second span-editing path — pre-seeded
  // near the clamped edge so the writer isn't hunting for where it landed.
  // The carry decision itself never changes: this only pre-fills a fresh
  // span for the writer to confirm as a new comment.
  function repositionComment(comment: WorkVersionCommentView) {
    if (comment.endTimestampMs == null) return
    const clamped = clampCarriedSpan({
      startMs: comment.timestampMs,
      endMs: comment.endTimestampMs,
      targetDurationMs: carryTargetDurationMs,
    })
    const seedEndMs = clamped.endMs ?? Math.min(effectiveDurationMs, clamped.startMs + 1)
    enterSpanMode()
    setDragAnchorMs(clamped.startMs)
    setDragPointerMs(seedEndMs)
    setPendingSpan(normalizeSpanDrag(clamped.startMs, seedEndMs, effectiveDurationMs))
  }

  function handleSpanPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const ms = msFromClientX(event.clientX)
    setDragAnchorMs(ms)
    setDragPointerMs(ms)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleSpanPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragAnchorMs === null) return
    setDragPointerMs(msFromClientX(event.clientX))
  }

  function handleSpanPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (dragAnchorMs === null || dragPointerMs === null) return
    const normalized = normalizeSpanDrag(dragAnchorMs, dragPointerMs, effectiveDurationMs)
    setDragAnchorMs(null)
    setDragPointerMs(null)
    // A drag shorter than MIN_SPAN_MS snaps back with no confirm affordance
    // at all — normalizeSpanDrag returning null is the whole guard, so
    // there is no second minimum-span check here.
    if (normalized) setPendingSpan(normalized)
  }

  // The band a writer currently sees: a live drag in progress, or a
  // confirmed-but-not-yet-posted span persisting (at higher opacity, via
  // the pendingSpan-and-not-spanMode branch below) while the composer is
  // open.
  const dragBand = dragAnchorMs !== null && dragPointerMs !== null
    ? { startMs: Math.min(dragAnchorMs, dragPointerMs), endMs: Math.max(dragAnchorMs, dragPointerMs) }
    : pendingSpan
  const dragBandGeometry = dragBand ? spanGeometry(dragBand.startMs, dragBand.endMs, effectiveDurationMs) : null

  function selectComment(comment: WorkVersionCommentView) {
    setOpen(true)
    setSelectedRootId(comment.id)
    setReplyingToId(null)
    reviewSeekTo(comment)
  }

  function viewNotes() {
    const first = roots.find(comment => comment.resolvedAt === null) ?? roots[0]
    if (!first) return
    selectComment(first)
  }

  function stepSelectedNote(direction: -1 | 1) {
    if (roots.length === 0) return
    const nextIndex = selectedRootIndex < 0
      ? 0
      : (selectedRootIndex + direction + roots.length) % roots.length
    selectComment(roots[nextIndex]!)
  }

  function insertMention(handle: string) {
    setDraft(current => `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${handle} `)
  }

  async function submitComment() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    setError(null)
    // With no pending span this sends the playhead position and no end,
    // exactly as before span marking existed. A reply never carries a
    // span — a reply is a message in a thread, not a second span.
    const spanForPost = !replyingToId ? pendingSpan : null
    const timestampMs = spanForPost ? spanForPost.startMs : Math.round(positionMs)
    const endTimestampMs = spanForPost ? spanForPost.endMs : undefined
    const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, timestampMs, endTimestampMs, parentCommentId: replyingToId }),
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
    setPendingSpan(null)
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
    <div ref={playerRef} className="rounded-[11px] border border-hair bg-card px-3 py-3">
      <audio
        ref={audioRef}
        src={playbackUrl}
        preload="metadata"
        onLoadedMetadata={event => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds) && seconds >= 0) setDurationMs(Math.round(seconds * 1000))
        }}
        onTimeUpdate={event => {
          const currentMs = Math.round(event.currentTarget.currentTime * 1000)
          setPositionMs(currentMs)
          const stopMs = stopPointMsRef.current
          if (stopMs !== null && currentMs >= stopMs) {
            // Play once and stop is the default; looping is an explicit
            // seek-back so the stop point stays the single authority —
            // the native media loop property is never used.
            if (loopEnabled && selectedRoot) {
              event.currentTarget.currentTime = preRollStartMs(selectedRoot.timestampMs) / 1000
            } else {
              event.currentTarget.pause()
            }
          }
        }}
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
          <span className="mt-0.5 flex items-center gap-1 text-[9px] text-lavdim">
            {isAiTagged ? <span>AI noted ·</span> : null}
            {roots.length > 0 ? (
              <button type="button" onClick={viewNotes} className="font-semibold text-brandindigo underline decoration-brandindigo/40 underline-offset-2 hover:text-white">
                View {visibleNoteCount} {unresolvedCount > 0 ? 'unresolved ' : ''}{visibleNoteCount === 1 ? 'comment' : 'comments'}
              </button>
            ) : <span>0 unresolved comments</span>}
          </span>
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

      <div
        className={`relative mt-3 h-[58px]${spanMode ? ' ring-2 ring-brandfuchsia/50' : ''}`}
        aria-label={`Timeline for ${display}`}
      >
        {/* At the `sm` breakpoint and above the hairline gap is exactly the
            UI contract's existing treatment, but below it PEAKS_BAR_COUNT
            (200) one-pixel bars plus 199 one-pixel gaps need 399px, which a
            320-390px viewport cannot give — the container's own
            overflow-hidden would silently clip the tail of every take on a
            phone. Mobile is a primary case for this surface, so the
            hairline collapses (gap-0) below `sm` rather than the take. */}
        {/* Committed range-comment bands render underneath the bars — indigo
            means "a saved comment," never "currently marking" (that's
            fuchsia, see the in-progress/pending band below). One marker
            pill per span, at its start, is rendered later in markerGroups —
            no separate end-marker here. */}
        {roots
          .filter((comment): comment is WorkVersionCommentView & { endTimestampMs: number } => comment.endTimestampMs != null)
          .map(comment => {
            const geometry = spanGeometry(comment.timestampMs, comment.endTimestampMs, effectiveDurationMs)
            return (
              <span
                key={`span-${comment.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute top-0 h-9 border-x border-brandindigo/40 bg-brandindigo/15"
                style={{ left: `${geometry.leftPercent}%`, width: `${geometry.widthPercent}%` }}
              />
            )
          })}
        <div
          aria-hidden="true"
          className={`absolute inset-x-0 top-0 flex h-9 items-center gap-0 sm:gap-px overflow-hidden${drawnPeaks === null ? ' animate-pulse' : ''}`}
        >
          {drawnPeaks !== null
            ? drawnPeaks.map((height, index) => (
                <span
                  key={index}
                  className={`min-w-px flex-1 rounded-full ${index / drawnPeaks.length <= positionMs / effectiveDurationMs ? 'bg-brandindigo' : 'bg-lavdim/35'}`}
                  style={{ height: `${height}%` }}
                />
              ))
            : // Uniform and flat is the point — a rest-state bar is
              // structurally impossible to read as data, never a dimmer
              // version of a real shape, and draws no progress fill because
              // there is no real shape for a playhead to sweep across.
              Array.from({ length: PEAKS_BAR_COUNT }, (_, index) => (
                <span
                  key={index}
                  className="min-w-px flex-1 rounded-full bg-lavdim/20"
                  style={{ height: `${REST_BAR_HEIGHT_PERCENT}%` }}
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
          disabled={spanMode}
          aria-label={`Seek ${display}`}
          className="absolute inset-x-0 top-0 h-9 w-full cursor-pointer opacity-0"
        />
        {spanMode && (
          <div
            ref={spanLayerRef}
            onPointerDown={handleSpanPointerDown}
            onPointerMove={handleSpanPointerMove}
            onPointerUp={handleSpanPointerUp}
            onPointerCancel={handleSpanPointerUp}
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-9 w-full cursor-crosshair"
            style={{ touchAction: 'none' }}
          />
        )}
        {dragBand && dragBandGeometry && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 h-9 border-x border-brandfuchsia/60 ${pendingSpan && !spanMode ? 'bg-brandfuchsia/25' : 'bg-brandfuchsia/20'}`}
            style={{ left: `${dragBandGeometry.leftPercent}%`, width: `${dragBandGeometry.widthPercent}%` }}
          />
        )}
        {selectedRoot ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-9 w-px bg-brandindigo/80"
            style={{ left: `${Math.max(1, Math.min(99, (selectedRoot.timestampMs / effectiveDurationMs) * 100))}%` }}
          />
        ) : null}
        {markerGroups.map(group => {
          // A range's marker pill sits at its start only (no second,
          // end-side pill) — extend the label to name both ends when a
          // grouped comment carries a span, matching the existing
          // point-marker label pattern.
          const rangeComment = group.comments.find(comment => comment.endTimestampMs != null)
          const commentWord = group.comments.length === 1 ? 'comment' : 'comments'
          const label = rangeComment
            ? `Range comment, ${formatTrackTimestamp(rangeComment.timestampMs)} to ${formatTrackTimestamp(rangeComment.endTimestampMs!)}, ${group.comments.length} ${commentWord}`
            : `${group.comments.length} ${commentWord} at ${formatTrackTimestamp(group.timestampMs)}`
          // D-07: a carried comment whose in-point no longer fits this take
          // recolors amber instead of indigo — hygiene, warmer than legal,
          // never the rose/red reserved for genuine errors.
          const isFlagged = group.comments.some(comment => comment.needsReposition)
          const isSelected = group.comments.some(comment => comment.id === selectedRootId)
          const toneClass = isFlagged ? 'border-amber-400/70 text-amber-400' : 'border-brandindigo/70 text-brandindigo'
          const selectedClass = isSelected
            ? (isFlagged ? 'ring-2 ring-amber-400/30' : 'text-white ring-2 ring-brandindigo/30')
            : ''
          return (
            <button
              key={group.timestampMs}
              type="button"
              onClick={() => {
                const selectedInGroup = group.comments.findIndex(comment => comment.id === selectedRootId)
                selectComment(group.comments[(selectedInGroup + 1) % group.comments.length]!)
              }}
              aria-label={label}
              className={`absolute top-7 flex min-h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full border bg-card px-1 text-[9px] font-bold shadow-md ${toneClass} ${selectedClass}`}
              style={{ left: `${Math.max(1, Math.min(99, (group.timestampMs / effectiveDurationMs) * 100))}%` }}
            >
              {group.comments.length}
            </button>
          )
        })}
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
          <button
            type="button"
            onClick={() => (spanMode ? exitSpanMode() : enterSpanMode())}
            aria-pressed={spanMode}
            className={spanMode
              ? 'inline-flex min-h-[44px] items-center justify-center rounded-full bg-brandfuchsia px-2 py-1 text-[9px] font-bold text-ink sm:min-h-0'
              : 'inline-flex min-h-[44px] items-center text-[10px] font-semibold text-brandfuchsia hover:text-white sm:min-h-0'}
          >
            {spanMode ? (
              <>Marking span<span className="hidden sm:inline"> — Esc to exit</span></>
            ) : 'Mark span'}
          </button>
          {pendingSpan && spanMode && (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmSpan}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-grad px-3 text-[10px] font-bold text-white sm:min-h-0 sm:px-2 sm:py-1"
              >
                Confirm span
              </button>
              <button
                type="button"
                onClick={cancelSpan}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-hairstrong px-3 text-[10px] text-lavdim hover:text-white sm:min-h-0 sm:border-0 sm:px-0 sm:py-0"
              >
                Cancel
              </button>
            </span>
          )}
          {onPullLyrics && (
            <button type="button" onClick={onPullLyrics} aria-label={`Use Lyric Lift to pull lyrics from ${display}`} className="text-[10px] font-semibold text-brandindigo hover:text-white">
              Lyric Lift
            </button>
          )}
          {downloadUrl && <a href={downloadUrl} download aria-label={`Download ${display} ${description}`} className="text-[10px] text-lavdim hover:text-white">Download</a>}
          {onRename && <button type="button" disabled={takeSaving} onClick={() => { setTakeError(null); setRenaming(current => !current) }} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">Name</button>}
          {!isWorking && onMakeWorking && <button type="button" disabled={takeSaving} onClick={() => void makeWorkingTake()} className="text-[10px] text-lavdim hover:text-brandindigo disabled:opacity-40">Make working</button>}
          {onArchive && <button type="button" onClick={() => void onArchive()} className="text-[10px] text-lavdim hover:text-white">Archive</button>}
        </div>
        {roots.length > 0 && <span className="text-[9px] text-lavdim">Click a marker to open its thread</span>}
      </div>
      {takeError && <p role="alert" className="mt-2 text-[10px] text-red-300">{takeError}</p>}
      {/* A take with simply no peaks yet shows no error at all — that state
          is expected and self-healing (D-03). Only the backfill decode
          itself throwing surfaces this copy. */}
      {waveformError && <p role="alert" className="mt-2 text-[10px] text-red-300">{waveformError}</p>}

      {isLatest && carryOffer && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-[11px] font-semibold text-white">Bring comments forward from {carryOffer.sourceVersionDisplay}?</p>
          <p className="mt-1 text-[10px] leading-4 text-lavdim">Choose unresolved comments to copy here, or start this take fresh. Nothing moves automatically.</p>
          {!reviewingCarry ? (
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" onClick={() => setReviewingCarry(true)} className="text-[10px] font-semibold text-brandindigo hover:text-white">
                Review {carryOffer.comments.length} {carryOffer.comments.length === 1 ? 'comment' : 'comments'}
              </button>
              <button type="button" disabled={saving} onClick={() => void saveCarryChoice([])} className="text-[10px] text-lavdim hover:text-white disabled:opacity-50">
                Start fresh
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {carryOffer.comments.map(comment => {
                // D-07: still offered and still checked by default even when
                // flagged — never silently dropped, never collapsed to a
                // point. Showing the clamped bounds here is what lets the
                // writer see what the span will become before they commit.
                const needsReposition = spanNeedsReposition({ timestampMs: comment.timestampMs, durationMs: carryTargetDurationMs })
                const clamped = comment.endTimestampMs != null
                  ? clampCarriedSpan({ startMs: comment.timestampMs, endMs: comment.endTimestampMs, targetDurationMs: carryTargetDurationMs })
                  : null
                return (
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
                      <b className={needsReposition ? 'text-amber-400' : 'text-white'}>{formatTrackTimestamp(comment.timestampMs)}</b> · {comment.body}
                      {needsReposition && (
                        <span className="mt-1 block text-[9px] text-amber-400">
                          Needs a new position in this take
                          {clamped && clamped.endMs !== null && (
                            <> — will land at {formatTrackTimestamp(clamped.startMs)} to {formatTrackTimestamp(clamped.endMs)}</>
                          )}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
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
                <div className="mb-2 flex items-center justify-between gap-3 border-b border-hair pb-2 text-[9px] text-lavdim">
                  <span>Comment {selectedRootIndex + 1} of {roots.length}</span>
                  <span className="flex items-center gap-3">
                    {roots.length > 1 && (
                      <>
                        <button type="button" onClick={() => stepSelectedNote(-1)} className="font-semibold hover:text-white">← Previous</button>
                        <button type="button" onClick={() => stepSelectedNote(1)} className="font-semibold hover:text-white">Next →</button>
                      </>
                    )}
                    {/* Opening a range comment always plays its span once
                        and stops; this toggle is the only way to repeat it
                        — it starts off every time a thread opens (see
                        reviewSeekTo's setLoopEnabled(false)). */}
                    <button
                      type="button"
                      onClick={() => setLoopEnabled(current => !current)}
                      aria-pressed={loopEnabled}
                      className={loopEnabled ? 'font-semibold text-brandindigo' : 'text-lavdim hover:text-white'}
                    >
                      Loop ⟲
                    </button>
                  </span>
                </div>
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
                    <span className="shrink-0 rounded-full border border-hair px-2 py-1 text-[8px] text-lavdim">Carried from {selectedRoot.carriedFromVersionDisplay}</span>
                  )}
                  {selectedRoot.needsReposition && (
                    <span className="shrink-0 rounded-full border border-amber-400/70 px-2 py-1 text-[8px] text-amber-400">Needs a new position in this take</span>
                  )}
                </div>
                <div className="mt-2"><CommentText comment={selectedRoot} /></div>
                <MicroReactionBar workId={workId} source="audio" noteId={selectedRoot.id} reactions={selectedRoot.reactions ?? []} onChanged={() => void loadComments()} />
                <div className="mt-2 flex flex-wrap gap-3 border-t border-hair pt-2">
                  {!selectedRoot.resolvedAt && (
                    <button type="button" onClick={() => { setPendingSpan(null); setReplyingToId(selectedRoot.id) }} className="text-[9px] text-lavdim hover:text-white">Reply</button>
                  )}
                  {selectedRoot.needsReposition && selectedRoot.endTimestampMs != null && (
                    <button type="button" onClick={() => repositionComment(selectedRoot)} className="text-[9px] font-semibold text-amber-400 hover:text-white">Reposition</button>
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
                  <MicroReactionBar workId={workId} source="audio" noteId={reply.id} reactions={reply.reactions ?? []} onChanged={() => void loadComments()} />
                </div>
              ))}
            </div>
          ) : roots.length > 0 ? (
            <p className="text-[10px] text-lavdim">Choose a marker, or leave a new comment at {formatTrackTimestamp(positionMs)}.</p>
          ) : (
            <p className="text-[10px] text-lavdim">No timed comments yet. Play or seek to the moment you want to discuss.</p>
          )}

          {replyingToId && (
            <div className="mt-3 flex items-center justify-between gap-2 text-[9px] text-lavdim">
              <span>Replying to the comment at {formatTrackTimestamp(selectedRoot?.timestampMs ?? positionMs)}</span>
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
            placeholder={replyingToId ? 'Reply to this thread' : `Leave a comment at ${formatTrackTimestamp(positionMs)}`}
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
