'use client'

import { useEffect, useRef, useState } from 'react'
import {
  LYRIC_LIFT_BLOCK_TYPES,
  formatLyricLiftTimestamp,
  lyricLiftSectionLabel,
  type LyricLiftSection,
  type LyricLiftView,
} from '@/lib/catalogue/lyric-lift'

type SourceVersion = {
  display: string
  description: string
  playbackUrl: string | null
}

type LyricLiftPanelProps = {
  workId: string
  lift: LyricLiftView
  sourceVersion: SourceVersion | null
  hasExistingLyrics: boolean
  onChange: (lift: LyricLiftView) => void
  onApplied: (lift: LyricLiftView, importedCount: number) => void
  onDiscarded: () => void
}

const TYPE_LABELS: Record<(typeof LYRIC_LIFT_BLOCK_TYPES)[number], string> = {
  verse: 'Verse',
  pre_chorus: 'Pre-chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  intro: 'Intro',
  outro: 'Outro',
  hook: 'Hook',
  custom: 'Custom',
}

export function LyricLiftPanel({
  workId,
  lift,
  sourceVersion,
  hasExistingLyrics,
  onChange,
  onApplied,
  onDiscarded,
}: LyricLiftPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [draftSections, setDraftSections] = useState(lift.sections)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setDraftSections(lift.sections), [lift.sections])

  useEffect(() => {
    if (lift.status !== 'queued' && lift.status !== 'processing') return
    let stopped = false
    const poll = async () => {
      const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}`, { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { data?: LyricLiftView }
      if (!stopped && response.ok && body.data) onChange(body.data)
    }
    const timer = setInterval(() => void poll(), 3000)
    void poll()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [lift.id, lift.status, onChange, workId])

  function updateLocal(sectionId: string, patch: Partial<LyricLiftSection>) {
    setDraftSections(current => current.map(section =>
      section.id === sectionId ? { ...section, ...patch } : section
    ))
  }

  async function saveSection(sectionId: string, patch: {
    text?: string
    blockType?: LyricLiftSection['blockType']
    customLabel?: string | null
    included?: boolean
  }) {
    setSavingIds(current => new Set(current).add(sectionId))
    setError(null)
    const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}/sections/${sectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const body = (await response.json().catch(() => ({}))) as { data?: LyricLiftView; error?: string }
    if (!response.ok || !body.data) setError(body.error ?? 'Could not save that lyric section.')
    else onChange(body.data)
    setSavingIds(current => {
      const next = new Set(current)
      next.delete(sectionId)
      return next
    })
  }

  async function move(sectionId: string, direction: -1 | 1) {
    const ordered = [...draftSections].sort((left, right) => left.position - right.position)
    const index = ordered.findIndex(section => section.id === sectionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length || busy) return
    ;[ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!]
    const optimistic = ordered.map((section, position) => ({ ...section, position }))
    setDraftSections(optimistic)
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: optimistic.map(section => ({ id: section.id, position: section.position })) }),
    })
    const body = (await response.json().catch(() => ({}))) as { data?: LyricLiftView; error?: string }
    if (!response.ok || !body.data) {
      setDraftSections(lift.sections)
      setError(body.error ?? 'Could not move that section.')
    } else onChange(body.data)
    setBusy(false)
  }

  function playFrom(section: LyricLiftSection) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = section.startMs / 1000
    void audio.play().catch(() => setError('Playback could not start. Try again.'))
  }

  async function retry() {
    if (busy) return
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}/retry`, { method: 'POST' })
    const body = (await response.json().catch(() => ({}))) as { data?: LyricLiftView; error?: string }
    if (!response.ok || !body.data) setError(body.error ?? 'Could not retry Lyric Lift.')
    else onChange(body.data)
    setBusy(false)
  }

  async function applyDraft() {
    if (busy || savingIds.size > 0) return
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: hasExistingLyrics ? 'append' : 'empty_only' }),
    })
    const body = (await response.json().catch(() => ({}))) as {
      data?: LyricLiftView
      importedCount?: number
      error?: string
    }
    if (!response.ok || !body.data) setError(body.error ?? 'Could not add the reviewed lyrics.')
    else onApplied(body.data, body.importedCount ?? 0)
    setBusy(false)
  }

  async function discardDraft() {
    if (busy) return
    const confirmed = window.confirm(
      'Discard this lyric draft? Your source recording and anything already in Lyric Blocks will stay untouched.'
    )
    if (!confirmed) return
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/works/${workId}/lyric-lifts/${lift.id}`, { method: 'DELETE' })
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    if (!response.ok) setError(body.error ?? 'Could not discard this lyric draft.')
    else onDiscarded()
    setBusy(false)
  }

  const includedCount = draftSections.filter(section => section.included).length
  const reviewCount = draftSections.filter(section => section.included && section.needsReview).length
  const sourceLabel = sourceVersion
    ? `${sourceVersion.display} ${sourceVersion.description}`.trim()
    : 'uploaded recording'

  return (
    <section aria-label="Lyric Lift" className="mt-4 rounded-[12px] border border-brandindigo/40 bg-card px-4 py-4">
      {sourceVersion?.playbackUrl && <audio ref={audioRef} src={sourceVersion.playbackUrl} preload="metadata" className="hidden" />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-brandindigo">Lyric Lift</p>
          <h2 className="mt-1 text-[14px] font-semibold text-white">
            {lift.status === 'review' ? 'Your lyric draft is ready to review' : `Pulling lyrics from ${sourceLabel}`}
          </h2>
          <p className="mt-1 max-w-[650px] text-[11px] leading-5 text-lavdim">
            {lift.status === 'review'
              ? 'Listen from any section, fix the words, and choose what belongs in Lyric Blocks. Nothing moves into the song until you approve it.'
              : lift.status === 'failed'
                ? 'The recording is still safe. Fix the issue below and try the transcription again.'
                : 'You can leave the room. The recording is processing in the background and this draft will be here when you return.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => void discardDraft()} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">
            {lift.status === 'queued' || lift.status === 'processing' ? 'Cancel' : 'Discard draft'}
          </button>
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${
            lift.status === 'review'
              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
              : lift.status === 'failed'
                ? 'border-red-400/40 bg-red-400/10 text-red-300'
                : 'border-brandindigo/40 bg-brandindigo/10 text-brandindigo'
          }`}>
            {lift.status === 'queued' ? 'In line' : lift.status === 'processing' ? 'Listening' : lift.status}
          </span>
        </div>
      </div>

      {(lift.status === 'queued' || lift.status === 'processing') && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-card2">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-brandindigo" />
        </div>
      )}

      {lift.status === 'failed' && (
        <div className="mt-4 rounded-[10px] border border-red-400/25 bg-red-400/[.06] px-3 py-3">
          <p role="alert" className="text-[11px] leading-5 text-red-200">
            {lift.errorMessage ?? 'Lyric transcription did not finish.'}
          </p>
          <button type="button" disabled={busy} onClick={() => void retry()} className="mt-2 text-[11px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">
            {busy ? 'Starting…' : 'Try again'}
          </button>
        </div>
      )}

      {lift.status === 'review' && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-lavdim">
            <span>{draftSections.length} detected {draftSections.length === 1 ? 'section' : 'sections'}</span>
            {lift.language && <span>· Language: {lift.language.toUpperCase()}</span>}
            {reviewCount > 0 && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-amber-200">{reviewCount} to check closely</span>}
          </div>

          <div className="mt-3 space-y-3">
            {[...draftSections].sort((left, right) => left.position - right.position).map((section, index) => (
              <article key={section.id} className={`rounded-[10px] border p-3 ${section.included ? 'border-hairstrong bg-card2' : 'border-hair bg-card2/40 opacity-65'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-[10px] text-lavdim">
                      <input
                        type="checkbox"
                        checked={section.included}
                        onChange={event => {
                          const included = event.target.checked
                          updateLocal(section.id, { included })
                          void saveSection(section.id, { included })
                        }}
                      />
                      Add
                    </label>
                    <button type="button" disabled={!sourceVersion?.playbackUrl} onClick={() => playFrom(section)} className="rounded-full border border-hairstrong px-2 py-1 text-[9px] font-semibold text-brandindigo hover:text-white disabled:text-lavdim">
                      ▶ {formatLyricLiftTimestamp(section.startMs)}
                    </button>
                    {section.needsReview && <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[8px] font-semibold uppercase tracking-[.08em] text-amber-200">Check this</span>}
                    {section.repeatOfSectionId && <span className="rounded-full bg-brandindigo/10 px-2 py-1 text-[8px] font-semibold text-brandindigo">↺ linked repeat</span>}
                  </div>
                  <span className="text-[9px] text-lavdim">{savingIds.has(section.id) ? 'Saving…' : lyricLiftSectionLabel(section)}</span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr]">
                  <div>
                    <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">
                      Section
                      <select
                        value={section.blockType}
                        onChange={event => {
                          const blockType = event.target.value as LyricLiftSection['blockType']
                          updateLocal(section.id, { blockType, customLabel: blockType === 'custom' ? 'Section' : null, repeatOfSectionId: null })
                          void saveSection(section.id, { blockType })
                        }}
                        className="mt-1.5 w-full rounded-[8px] border border-hairstrong bg-card px-2 py-2 text-[11px] normal-case tracking-normal text-white outline-none"
                      >
                        {LYRIC_LIFT_BLOCK_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                      </select>
                    </label>
                    {section.blockType === 'custom' && (
                      <input
                        value={section.customLabel ?? ''}
                        maxLength={80}
                        aria-label="Custom section name"
                        onChange={event => updateLocal(section.id, { customLabel: event.target.value })}
                        onBlur={() => void saveSection(section.id, { customLabel: section.customLabel?.trim() || 'Section' })}
                        className="mt-2 w-full rounded-[8px] border border-hairstrong bg-card px-2 py-2 text-[11px] text-white outline-none"
                      />
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" disabled={index === 0 || busy} onClick={() => void move(section.id, -1)} className="text-[9px] text-lavdim hover:text-white disabled:opacity-25">↑ Earlier</button>
                      <button type="button" disabled={index === draftSections.length - 1 || busy} onClick={() => void move(section.id, 1)} className="text-[9px] text-lavdim hover:text-white disabled:opacity-25">↓ Later</button>
                    </div>
                  </div>
                  <textarea
                    value={section.text}
                    rows={Math.max(3, Math.min(9, section.text.split('\n').length + 1))}
                    maxLength={20000}
                    disabled={!section.included}
                    aria-label={`${lyricLiftSectionLabel(section)} transcription`}
                    onChange={event => updateLocal(section.id, {
                      text: event.target.value,
                      needsReview: false,
                      repeatOfSectionId: null,
                    })}
                    onBlur={() => void saveSection(section.id, { text: section.text })}
                    className="w-full resize-y rounded-[9px] border border-hairstrong bg-card px-3 py-2 text-[12px] leading-5 text-white outline-none focus:border-brandindigo disabled:opacity-60"
                  />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-[10px] border border-hair bg-card2/60 px-3 py-3">
            <p className="text-[10px] leading-5 text-lavdim">
              {hasExistingLyrics
                ? 'Your current lyrics stay exactly where they are. These sections will be added after them.'
                : 'These will become the song’s first Lyric Blocks.'}{' '}
              The source recording stays linked, and writer credit remains unassigned until the room confirms who wrote the words.
            </p>
            <button
              type="button"
              disabled={busy || savingIds.size > 0 || includedCount === 0}
              onClick={() => void applyDraft()}
              className="mt-3 rounded-[9px] border border-brandindigo/60 bg-brandindigo/15 px-4 py-2 text-[11px] font-semibold text-white hover:bg-brandindigo/25 disabled:opacity-40"
            >
              {busy ? 'Adding…' : `Add ${includedCount} ${includedCount === 1 ? 'section' : 'sections'} to Lyric Blocks`}
            </button>
          </div>
        </>
      )}

      {error && <p role="alert" className="mt-3 text-[10px] leading-5 text-red-300">{error}</p>}
    </section>
  )
}
