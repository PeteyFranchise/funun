'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'
import {
  clampComparisonPosition,
  comparisonResolutionLabel,
  defaultComparisonIds,
  type ComparisonVersionFacts,
} from '@/lib/catalogue/version-comparison'
import type { WorkVersionCommentView } from '@/types/catalogue'

export type ComparableVersion = ComparisonVersionFacts & {
  description: string
  playbackUrl: string
}

type VersionComparisonPanelProps = {
  workId: string
  versions: ComparableVersion[]
  onClose: () => void
  onActivity: (playing: boolean, display: string) => void
  onCommentChanged: (versionId: string) => void
  refreshToken?: number
  workingVersionId?: string | null
  preferredVersionId?: string | null
  /** Static-render test seam; production loads canonical comments through the existing version routes. */
  initialComments?: Record<string, WorkVersionCommentView[]>
}

const WAVE_BARS = [
  39, 61, 82, 48, 91, 67, 35, 76, 56, 88, 63, 42,
  79, 52, 94, 69, 37, 84, 59, 46, 73, 55, 90, 65,
  40, 81, 57, 33, 75, 50, 86, 62, 44, 78, 54, 92,
  68, 36, 83, 58, 47, 72, 53, 89, 64, 41, 77, 60,
]

function rootComments(comments: WorkVersionCommentView[]): WorkVersionCommentView[] {
  return comments
    .filter(comment => comment.parentCommentId === null)
    .sort((a, b) => a.timestampMs - b.timestampMs)
}

export function VersionComparisonPanel({
  workId,
  versions,
  onClose,
  onActivity,
  onCommentChanged,
  refreshToken = 0,
  workingVersionId = null,
  preferredVersionId = null,
  initialComments,
}: VersionComparisonPanelProps) {
  const defaults = defaultComparisonIds(versions, workingVersionId, preferredVersionId)
  const [sideAId, setSideAId] = useState(defaults?.sideAId ?? versions[0]?.id ?? '')
  const [sideBId, setSideBId] = useState(defaults?.sideBId ?? versions[1]?.id ?? '')
  const [activeSide, setActiveSide] = useState<'a' | 'b'>('a')
  const [positionMs, setPositionMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [durations, setDurations] = useState<Record<string, number>>(() => Object.fromEntries(
    versions.map(version => [version.id, Math.max(0, Math.round((version.durationSeconds ?? 0) * 1000))])
  ))
  const [commentsByVersion, setCommentsByVersion] = useState<Record<string, WorkVersionCommentView[]>>(initialComments ?? {})
  const [selectedComment, setSelectedComment] = useState<{ versionId: string; commentId: string } | null>(null)
  const [loading, setLoading] = useState(initialComments === undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  const sideA = versions.find(version => version.id === sideAId) ?? versions[0]!
  const sideB = versions.find(version => version.id === sideBId) ?? versions[1]!
  const activeVersion = activeSide === 'a' ? sideA : sideB
  const activeDurationMs = Math.max(1000, durations[activeVersion.id] ?? Math.round((activeVersion.durationSeconds ?? 0) * 1000))
  const activeRoots = rootComments(commentsByVersion[activeVersion.id] ?? [])
  const selected = selectedComment
    ? (commentsByVersion[selectedComment.versionId] ?? []).find(comment => comment.id === selectedComment.commentId) ?? null
    : null
  const selectedVersion = selectedComment
    ? versions.find(version => version.id === selectedComment.versionId) ?? null
    : null
  const replies = selected
    ? (commentsByVersion[selected.versionId] ?? []).filter(comment => comment.parentCommentId === selected.id)
    : []

  useEffect(() => {
    if (initialComments !== undefined) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([sideA.id, sideB.id].map(async versionId => {
      const response = await fetch(`/api/works/${workId}/versions/${versionId}/comments`, { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { data?: WorkVersionCommentView[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not load version comments.')
      return [versionId, Array.isArray(body.data) ? body.data : []] as const
    })).then(entries => {
      if (!cancelled) setCommentsByVersion(current => ({ ...current, ...Object.fromEntries(entries) }))
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load version comments.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [initialComments, refreshToken, sideA.id, sideB.id, workId])

  useEffect(() => () => {
    Object.values(audioRefs.current).forEach(audio => audio?.pause())
  }, [])

  function applyPosition(nextMs: number) {
    const next = clampComparisonPosition(nextMs, activeDurationMs / 1000)
    setPositionMs(next)
    for (const version of [sideA, sideB]) {
      const audio = audioRefs.current[version.id]
      if (!audio) continue
      const durationMs = durations[version.id] || Math.round((version.durationSeconds ?? 0) * 1000)
      audio.currentTime = clampComparisonPosition(next, durationMs > 0 ? durationMs / 1000 : null) / 1000
    }
  }

  async function setActive(nextSide: 'a' | 'b') {
    if (nextSide === activeSide) return
    const previousAudio = audioRefs.current[activeVersion.id]
    previousAudio?.pause()
    const nextVersion = nextSide === 'a' ? sideA : sideB
    const nextDuration = durations[nextVersion.id] || Math.round((nextVersion.durationSeconds ?? 0) * 1000)
    const nextPosition = clampComparisonPosition(positionMs, nextDuration > 0 ? nextDuration / 1000 : null)
    const nextAudio = audioRefs.current[nextVersion.id]
    if (nextAudio) nextAudio.currentTime = nextPosition / 1000
    setActiveSide(nextSide)
    setPositionMs(nextPosition)
    if (playing && nextAudio) {
      await nextAudio.play().catch(() => {
        setPlaying(false)
        setError('Playback could not continue automatically. Press play to resume.')
      })
    }
  }

  async function togglePlayback() {
    const audio = audioRefs.current[activeVersion.id]
    if (!audio) return
    if (audio.paused) {
      await audio.play().catch(() => setError('Playback could not start. Try again.'))
    } else {
      audio.pause()
    }
  }

  function changeSide(side: 'a' | 'b', versionId: string) {
    const wasActive = activeSide === side
    const oldVersion = side === 'a' ? sideA : sideB
    audioRefs.current[oldVersion.id]?.pause()
    if (selectedComment?.versionId === oldVersion.id) setSelectedComment(null)
    if (side === 'a') setSideAId(versionId)
    else setSideBId(versionId)
    if (wasActive) {
      setPlaying(false)
      const next = versions.find(version => version.id === versionId)
      setPositionMs(clampComparisonPosition(positionMs, next?.durationSeconds ?? null))
    }
  }

  function chooseMarker(comment: WorkVersionCommentView) {
    setSelectedComment({ versionId: comment.versionId, commentId: comment.id })
    applyPosition(comment.timestampMs)
  }

  async function updateResolution() {
    if (!selected || !selectedVersion || saving) return
    setSaving(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/versions/${selected.versionId}/comments/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: selected.resolvedAt === null }),
    })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) {
      setError(body.error ?? 'Could not update that note.')
      setSaving(false)
      return
    }
    setCommentsByVersion(current => ({
      ...current,
      [selected.versionId]: (current[selected.versionId] ?? []).map(comment => comment.id === selected.id
        ? { ...comment, resolvedAt: selected.resolvedAt ? null : new Date().toISOString() }
        : comment),
    }))
    onCommentChanged(selected.versionId)
    setSaving(false)
  }

  const actionLabel = selected && selectedVersion
    ? comparisonResolutionLabel({
        resolved: selected.resolvedAt !== null,
        commentVersion: selectedVersion,
        listeningVersion: activeVersion,
      })
    : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-comparison-title"
      className="max-h-full w-full max-w-[780px] overflow-y-auto rounded-[14px] border border-hairstrong bg-card p-5 shadow-2xl"
    >
      {[sideA, sideB].map(version => (
        <audio
          key={version.id}
          ref={node => { audioRefs.current[version.id] = node }}
          src={version.playbackUrl}
          preload="metadata"
          onLoadedMetadata={event => {
            const seconds = event.currentTarget.duration
            if (Number.isFinite(seconds) && seconds >= 0) {
              setDurations(current => ({ ...current, [version.id]: Math.round(seconds * 1000) }))
              event.currentTarget.currentTime = clampComparisonPosition(positionMs, seconds) / 1000
            }
          }}
          onTimeUpdate={event => {
            if (version.id === activeVersion.id) setPositionMs(Math.round(event.currentTarget.currentTime * 1000))
          }}
          onPlay={() => {
            setPlaying(true)
            onActivity(true, version.display)
          }}
          onPause={() => {
            setPlaying(false)
            onActivity(false, version.display)
          }}
          onEnded={() => {
            setPlaying(false)
            onActivity(false, version.display)
          }}
          className="hidden"
        />
      ))}

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-brandindigo">A/B listening</p>
          <h2 id="version-comparison-title" className="mt-1 text-[20px] font-bold text-white">Compare two takes</h2>
          <p className="mt-1 text-[11px] leading-5 text-lavdim">One playhead, each take&apos;s own notes. Switching keeps the same elapsed moment.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close version comparison" className="text-[16px] text-lavdim hover:text-white">✕</button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {([['a', sideA, sideB.id], ['b', sideB, sideA.id]] as const).map(([side, version, otherId]) => (
          <div key={side} className={`rounded-[11px] border p-3 ${activeSide === side ? 'border-brandindigo bg-brandindigo/[.05]' : 'border-hair bg-card2'}`}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`comparison-${side}`} className="text-[10px] font-semibold uppercase tracking-[.12em] text-lavdim">Side {side.toUpperCase()}</label>
              {activeSide === side && <span className="text-[9px] font-semibold text-brandindigo">Listening</span>}
            </div>
            <select
              id={`comparison-${side}`}
              value={version.id}
              onChange={event => changeSide(side, event.target.value)}
              className="mt-2 w-full rounded-[9px] border border-hairstrong bg-card px-3 py-2 text-[12px] font-semibold text-white outline-none focus:border-brandindigo"
            >
              {versions.map(option => (
                <option key={option.id} value={option.id} disabled={option.id === otherId}>
                  {option.display} · {option.description}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void setActive(side)}
              disabled={activeSide === side}
              className="mt-2 text-[10px] font-semibold text-brandindigo hover:text-white disabled:text-lavdim"
            >
              {activeSide === side ? 'Current side' : `Switch to ${version.display}`}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairstrong bg-card2 text-white hover:border-brandindigo"
          aria-label={`${playing ? 'Pause' : 'Play'} ${activeVersion.display}`}
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-white">Listening to {activeVersion.display} · {activeVersion.description}</p>
          <p className="text-[10px] text-lavdim">{formatTrackTimestamp(positionMs)} / {formatTrackTimestamp(activeDurationMs)}</p>
        </div>
      </div>

      <div className="relative mt-4 h-[76px]" aria-label={`Comparison timeline for ${activeVersion.display}`}>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-11 items-center gap-px overflow-hidden">
          {WAVE_BARS.map((height, index) => (
            <span
              key={index}
              className={`min-w-px flex-1 rounded-full ${index / WAVE_BARS.length <= positionMs / activeDurationMs ? 'bg-brandindigo' : 'bg-lavdim/35'}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={activeDurationMs}
          step={100}
          value={Math.min(positionMs, activeDurationMs)}
          onChange={event => applyPosition(Number(event.target.value))}
          aria-label={`Seek both takes from ${formatTrackTimestamp(positionMs)}`}
          className="absolute inset-x-0 top-0 h-11 w-full cursor-pointer opacity-0"
        />
        {activeRoots.map(comment => (
          <button
            key={comment.id}
            type="button"
            onClick={() => chooseMarker(comment)}
            aria-label={`${comment.resolvedAt ? 'Resolved' : 'Open'} ${activeVersion.display} note at ${formatTrackTimestamp(comment.timestampMs)}`}
            className={`absolute top-10 -translate-x-1/2 text-[11px] ${comment.resolvedAt ? 'text-lavdim' : 'text-brandindigo'}`}
            style={{ left: `${Math.min(100, (comment.timestampMs / activeDurationMs) * 100)}%` }}
          >●</button>
        ))}
      </div>

      <div className="mt-3 border-t border-hair pt-4">
        {loading ? (
          <p className="text-[11px] text-lavdim">Loading timed notes…</p>
        ) : selected && selectedVersion ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-brandindigo">
                  Note from {selectedVersion.display} at {formatTrackTimestamp(selected.timestampMs)}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-white">{selected.body}</p>
                <p className="mt-1 text-[9px] text-lavdim">
                  {selected.author?.name ?? 'Former room member'}{replies.length > 0 ? ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}
                </p>
              </div>
              {selected.canResolve && actionLabel && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void updateResolution()}
                  className="rounded-[9px] border border-brandindigo/40 bg-brandindigo/[.06] px-3 py-2 text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40"
                >
                  {saving ? 'Saving…' : actionLabel}
                </button>
              )}
            </div>
            {selected.versionId !== activeVersion.id && (
              <p className="mt-3 rounded-[9px] border border-hair bg-card2 px-3 py-2 text-[10px] text-lavdim">
                You are hearing {activeVersion.display} at the same moment while reviewing this {selectedVersion.display} note.
              </p>
            )}
          </div>
        ) : activeRoots.length > 0 ? (
          <p className="text-[11px] text-lavdim">Choose a {activeVersion.display} marker, then switch sides to hear whether the note was addressed.</p>
        ) : (
          <p className="text-[11px] text-lavdim">{activeVersion.display} has no timed notes yet. Switch sides or return to the room to add one.</p>
        )}
        {error && <p role="alert" className="mt-3 text-[11px] text-rose-300">{error}</p>}
      </div>
    </div>
  )
}
