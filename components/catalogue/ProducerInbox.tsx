'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AUDIO_FILE_ACCEPT } from '@/lib/catalogue/audio-mime'
import {
  buildProducerHandoffRecap,
  formatTechnicalDuration,
  formatTechnicalSize,
  producerHandoffStage,
  producerInboxStatus,
  producerReturnLabel,
  PRODUCER_HANDOFF_NOTE_MAX,
  type ProducerFeedbackResponse,
  type ProducerFeedbackSnapshot,
  type ProducerFeedbackStatus,
} from '@/lib/catalogue/producer-handoff'
import { uploadWorkVersion } from '@/lib/catalogue/version-upload-client'

export type ProducerInboxReturn = {
  id: string
  versionId: string
  label: string
  note: string | null
  createdAt: string
  playbackUrl: string | null
  downloadUrl: string | null
  roundLabel: string | null
  feedbackResponses: ProducerFeedbackResponse[]
  audioExt: string
  audioSize: number | null
  durationSeconds: number | null
}

export type ProducerInboxItem = {
  id: string
  workId: string
  workTitle: string
  senderName: string
  note: string | null
  sentAt: string
  acknowledgedAt: string | null
  workingAt: string | null
  roundLabel: string | null
  bpm: number | null
  musicalKey: string | null
  referenceUrl: string | null
  feedback: ProducerFeedbackSnapshot[]
  roughVersionId: string
  roughLabel: string
  roughUrl: string | null
  roughDownloadUrl: string | null
  roughAudioExt: string
  roughAudioSize: number | null
  roughDurationSeconds: number | null
  vocalUrl: string | null
  vocalDownloadUrl: string | null
  vocalSize: number | null
  returns: ProducerInboxReturn[]
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?'
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
}

function ProducerInboxCard({ item, highlighted }: { item: ProducerInboxItem; highlighted: boolean }) {
  const router = useRouter()
  const [acknowledgedAt, setAcknowledgedAt] = useState(item.acknowledgedAt)
  const [workingAt, setWorkingAt] = useState(item.workingAt)
  const [acknowledging, setAcknowledging] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [roundLabel, setRoundLabel] = useState('')
  const [feedbackResponses, setFeedbackResponses] = useState<Record<string, ProducerFeedbackStatus | ''>>({})
  const [uploading, setUploading] = useState(false)
  const [markingWorking, setMarkingWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stage, setStage] = useState('Upload next mix')
  const [error, setError] = useState<string | null>(null)
  const recordedActivity = useRef(new Set<string>())
  const status = producerInboxStatus({ acknowledgedAt, workingAt, returnCount: item.returns.length })
  const stageName = producerHandoffStage({
    acknowledgedAt,
    workingAt,
    returnCount: item.returns.length,
    reviewCount: 0,
  })

  function recordActivity(kind: 'listened' | 'compared', versionId: string) {
    const key = `${kind}:${versionId}`
    if (recordedActivity.current.has(key)) return
    recordedActivity.current.add(key)
    void fetch(`/api/producer-handoffs/${item.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, versionId }),
    }).catch(() => undefined)
  }

  async function markWorking() {
    if (markingWorking || workingAt) return
    setMarkingWorking(true)
    setError(null)
    const response = await fetch(`/api/producer-handoffs/${item.id}/working`, { method: 'POST' })
    if (!response.ok) setError(await responseError(response, 'Could not share that progress update.'))
    else {
      const body = (await response.json()) as { data?: { working_at?: string } }
      setWorkingAt(body.data?.working_at ?? new Date().toISOString())
      setAcknowledgedAt(current => current ?? new Date().toISOString())
      router.refresh()
    }
    setMarkingWorking(false)
  }

  async function copyRecap() {
    if (!navigator.clipboard) {
      setError('Copy is unavailable in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(buildProducerHandoffRecap({
        songTitle: item.workTitle,
        senderName: item.senderName,
        recipientName: 'You',
        stage: stageName,
        roundLabel: item.roundLabel,
        bpm: item.bpm,
        musicalKey: item.musicalKey,
        referenceUrl: item.referenceUrl,
        direction: item.note,
        feedbackCount: item.feedback.length,
      }))
      setCopied(true)
    } catch {
      setError('Could not copy the handoff recap.')
    }
  }

  async function acknowledge() {
    if (acknowledging || acknowledgedAt) return
    setAcknowledging(true)
    setError(null)
    const response = await fetch(`/api/producer-handoffs/${item.id}/acknowledge`, { method: 'POST' })
    if (!response.ok) setError(await responseError(response, 'Could not acknowledge this handoff.'))
    else {
      const body = (await response.json()) as { data?: { acknowledged_at?: string } }
      setAcknowledgedAt(body.data?.acknowledged_at ?? new Date().toISOString())
      router.refresh()
    }
    setAcknowledging(false)
  }

  async function returnMix() {
    if (!file || uploading) return
    setUploading(true)
    setError(null)
    let versionId: string | null = null
    try {
      const version = await uploadWorkVersion({
        workId: item.workId,
        file,
        fileName: file.name,
        source: 'upload',
        label: label.trim() || producerReturnLabel(file.name),
        onPhase: phase => setStage(phase === 'preparing' ? 'Preparing…' : phase === 'uploading' ? 'Uploading mix…' : 'Saving take…'),
      })
      versionId = version.id
      setStage('Linking to handoff…')
      const response = await fetch(`/api/producer-handoffs/${item.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: version.id,
          note: note.trim() || null,
          roundLabel: roundLabel.trim() || null,
          feedbackResponses: Object.entries(feedbackResponses).flatMap(([feedbackId, responseStatus]) =>
            responseStatus ? [{ feedbackId, status: responseStatus }] : []
          ),
        }),
      })
      if (!response.ok) throw new Error(await responseError(response, 'The mix saved, but could not be linked to the handoff.'))
      setFile(null)
      setLabel('')
      setNote('')
      setRoundLabel('')
      setFeedbackResponses({})
      setUploadOpen(false)
      setAcknowledgedAt(current => current ?? new Date().toISOString())
      router.refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not return this mix.'
      setError(versionId ? `${message} The audio is still safely saved as a take in the Writer’s Room.` : message)
    } finally {
      setUploading(false)
      setStage('Upload next mix')
    }
  }

  return (
    <article id={`handoff-${item.id}`} className={`rounded-card border bg-card p-5 ${highlighted ? 'border-brandindigo ring-1 ring-brandindigo/30' : 'border-hair'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brandindigo/15 text-[12px] font-bold text-brandindigo">{initials(item.senderName)}</span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-white">{item.workTitle}</p>
            <p className="mt-0.5 text-[11px] text-lavdim">From {item.senderName} · {dateLabel(item.sentAt)}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] ${item.returns.length > 0 ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300' : acknowledgedAt ? 'border-hairstrong bg-lav/[.05] text-lav' : 'border-brandindigo/40 bg-brandindigo/10 text-brandindigo'}`}>{status}</span>
      </div>

      {(item.roundLabel || item.bpm || item.musicalKey) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.roundLabel && <span className="rounded-full border border-brandindigo/35 bg-brandindigo/10 px-2.5 py-1 text-[9px] font-semibold text-brandindigo">{item.roundLabel}</span>}
          {item.bpm && <span className="rounded-full border border-hairstrong px-2.5 py-1 text-[9px] text-lav">{item.bpm} BPM</span>}
          {item.musicalKey && <span className="rounded-full border border-hairstrong px-2.5 py-1 text-[9px] text-lav">{item.musicalKey}</span>}
        </div>
      )}
      {item.note && <div className="mt-4 rounded-[10px] border border-hair bg-card2 px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">What we’re changing</p><p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-lav">“{item.note}”</p></div>}
      {item.referenceUrl && <a href={item.referenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[10px] font-semibold text-brandindigo hover:text-white">↗ Open reference track</a>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[11px] border border-hair bg-card2 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-lavdim">Rough mix · {item.roughLabel}</p>
          <p className="mt-1 text-[9px] text-lavdim">{item.roughAudioExt.toUpperCase()} · {formatTechnicalDuration(item.roughDurationSeconds)} · {formatTechnicalSize(item.roughAudioSize)}</p>
          {item.roughUrl ? <audio aria-label={`Play ${item.workTitle} rough mix`} controls preload="metadata" src={item.roughUrl} onPlay={() => recordActivity('listened', item.roughVersionId)} className="mt-2 h-9 w-full" /> : <p className="mt-2 text-[10px] text-lavdim">Audio unavailable.</p>}
          {item.roughDownloadUrl && <a href={item.roughDownloadUrl} className="mt-2 inline-block text-[10px] font-semibold text-brandindigo hover:text-white">↓ Download rough</a>}
        </div>
        <div className="rounded-[11px] border border-brandindigo/25 bg-brandindigo/[.04] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-brandindigo">Dry vocal · aligned from 0:00</p>
          <p className="mt-1 text-[9px] text-lavdim">WAV · starts at 0:00 · {formatTechnicalSize(item.vocalSize)}</p>
          {item.vocalUrl ? <audio aria-label={`Play ${item.workTitle} dry vocal`} controls preload="metadata" src={item.vocalUrl} onPlay={() => recordActivity('listened', item.roughVersionId)} className="mt-2 h-9 w-full" /> : <p className="mt-2 text-[10px] text-lavdim">Audio unavailable.</p>}
          {item.vocalDownloadUrl && <a href={item.vocalDownloadUrl} className="mt-2 inline-block text-[10px] font-semibold text-brandindigo hover:text-white">↓ Download dry vocal</a>}
        </div>
      </div>

      {item.feedback.length > 0 && (
        <div className="mt-4 rounded-[10px] border border-hair bg-card2 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-lavdim">Production feedback · optional checklist</p>
          <div className="mt-2 space-y-2">
            {item.feedback.map(feedback => (
              <a key={feedback.feedbackId} href={`/vault/works/${item.workId}?version=${feedback.versionId}&comment=${feedback.feedbackId}&t=${feedback.timestampMs}`} className="flex items-start gap-2 rounded-[8px] border border-hair px-2.5 py-2 text-[10px] leading-4 text-lav hover:border-brandindigo hover:text-white">
                <b className="shrink-0 text-brandindigo">{feedback.versionDisplay} · {Math.floor(feedback.timestampMs / 60000)}:{String(Math.floor(feedback.timestampMs / 1000) % 60).padStart(2, '0')}</b>
                <span>{feedback.body}</span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-lavdim">These are creative prompts, not requirements. A mix can be returned with any or none addressed.</p>
        </div>
      )}

      {item.returns.length > 0 && (
        <div className="mt-4 border-t border-hair pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-lavdim">Returned to the room</p>
          <div className="mt-2 space-y-2">
            {item.returns.map(returned => (
              <div key={returned.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-hair bg-card2 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold text-white">{returned.roundLabel ? `${returned.roundLabel} · ` : ''}{returned.label}</p>
                  <p className="text-[9px] text-lavdim">{returned.audioExt.toUpperCase()} · {formatTechnicalDuration(returned.durationSeconds)} · {formatTechnicalSize(returned.audioSize)} · {dateLabel(returned.createdAt)}{returned.note ? ` · ${returned.note}` : ''}</p>
                  {returned.feedbackResponses.length > 0 && <p className="mt-1 text-[9px] text-emerald-300">{returned.feedbackResponses.length} feedback {returned.feedbackResponses.length === 1 ? 'item' : 'items'} updated</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {returned.downloadUrl && <a href={returned.downloadUrl} download className="text-[10px] font-semibold text-brandindigo hover:text-white">↓ Download</a>}
                  {returned.playbackUrl && <audio aria-label={`Play ${returned.label}`} controls preload="metadata" src={returned.playbackUrl} onPlay={() => recordActivity('listened', returned.versionId)} className="h-8 w-[210px] max-w-full" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {uploadOpen && (
        <div className="mt-4 rounded-[11px] border border-brandindigo/30 bg-card2 p-3">
          <p className="text-[11px] font-semibold text-white">Return the next mix</p>
          <p className="mt-1 text-[10px] leading-4 text-lavdim">It will become a normal named take in this Writer’s Room and stay linked to this handoff.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Audio file<input type="file" accept={AUDIO_FILE_ACCEPT} disabled={uploading} onChange={event => { const next = event.target.files?.[0] ?? null; setFile(next); if (next) setLabel(producerReturnLabel(next.name)) }} className="mt-1.5 block w-full text-[10px] normal-case tracking-normal text-lav file:mr-3 file:rounded-[8px] file:border file:border-hairstrong file:bg-card file:px-3 file:py-2 file:text-[10px] file:font-semibold file:text-white" /></label>
            <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Take name<input type="text" value={label} maxLength={200} disabled={uploading} onChange={event => setLabel(event.target.value)} placeholder="Producer mix — drums up" className="mt-1.5 w-full rounded-[8px] border border-hairstrong bg-card px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-white outline-none placeholder:text-lavdim focus:border-brandindigo" /></label>
            <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim sm:col-span-2">Round name (optional)<input type="text" value={roundLabel} maxLength={80} disabled={uploading} onChange={event => setRoundLabel(event.target.value)} placeholder="Vocal-up revision" className="mt-1.5 w-full rounded-[8px] border border-hairstrong bg-card px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-white outline-none placeholder:text-lavdim focus:border-brandindigo" /></label>
            <label className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim sm:col-span-2">Note (optional)<textarea value={note} maxLength={PRODUCER_HANDOFF_NOTE_MAX} disabled={uploading} onChange={event => setNote(event.target.value)} rows={2} placeholder="What changed in this mix?" className="mt-1.5 w-full resize-none rounded-[8px] border border-hairstrong bg-card px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-white outline-none placeholder:text-lavdim focus:border-brandindigo" /></label>
            {item.feedback.length > 0 && (
              <fieldset className="rounded-[9px] border border-hair bg-card p-3 sm:col-span-2">
                <legend className="px-1 text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Feedback update (optional)</legend>
                <div className="space-y-3">
                  {item.feedback.map(feedback => (
                    <label key={feedback.feedbackId} className="grid gap-1 text-[10px] text-lav sm:grid-cols-[1fr_170px] sm:items-center">
                      <span><b className="text-white">{feedback.versionDisplay} · {Math.floor(feedback.timestampMs / 60000)}:{String(Math.floor(feedback.timestampMs / 1000) % 60).padStart(2, '0')}</b> · {feedback.body}</span>
                      <select value={feedbackResponses[feedback.feedbackId] ?? ''} disabled={uploading} onChange={event => setFeedbackResponses(current => ({ ...current, [feedback.feedbackId]: event.target.value as ProducerFeedbackStatus | '' }))} className="rounded-[8px] border border-hairstrong bg-card2 px-2 py-2 text-[10px] text-white outline-none focus:border-brandindigo">
                        <option value="">No update</option>
                        <option value="done">Done</option>
                        <option value="tried">Tried another way</option>
                        <option value="discuss">Let’s discuss</option>
                      </select>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-3">
            <button type="button" disabled={uploading} onClick={() => setUploadOpen(false)} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">Cancel</button>
            <button type="button" disabled={!file || uploading} onClick={() => void returnMix()} className="rounded-[9px] bg-grad px-4 py-2 text-[10px] font-semibold text-white shadow-cta disabled:opacity-40">{uploading ? stage : 'Upload & return mix'}</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-[10px] leading-4 text-red-300">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-3">
        <Link href={`/vault/works/${item.workId}`} className="text-[10px] font-semibold text-lav hover:text-white">Open Writer’s Room →</Link>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void copyRecap()} className="text-[10px] text-lavdim hover:text-white">{copied ? 'Copied recap ✓' : 'Copy recap'}</button>
          {!acknowledgedAt && <button type="button" disabled={acknowledging} onClick={() => void acknowledge()} className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{acknowledging ? 'Acknowledging…' : 'I got it'}</button>}
          {!workingAt && item.returns.length === 0 && <button type="button" disabled={markingWorking} onClick={() => void markWorking()} className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{markingWorking ? 'Sharing…' : 'Working on it'}</button>}
          <button type="button" disabled={uploading} onClick={() => setUploadOpen(current => !current)} className="w-full rounded-[9px] border border-brandindigo/40 bg-brandindigo/10 px-3 py-2 text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40 sm:w-auto">{uploadOpen ? 'Close upload' : 'Upload next mix'}</button>
        </div>
      </div>
    </article>
  )
}

export function ProducerInbox({ items, highlightedHandoffId = null }: { items: ProducerInboxItem[]; highlightedHandoffId?: string | null }) {
  if (items.length === 0) {
    return (
      <div className="rounded-card border border-hair bg-card px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-white">No producer handoffs yet</p>
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-lavdim">When someone sends you a rough mix and aligned vocal from a Writer’s Room, it will land here.</p>
        <Link href="/vault" className="mt-5 inline-block text-[11px] font-semibold text-brandindigo hover:text-white">Back to the Sound Vault</Link>
      </div>
    )
  }
  const highlighted = highlightedHandoffId ? items.find(item => item.id === highlightedHandoffId) : undefined
  const orderedItems = highlighted
    ? [highlighted, ...items.filter(item => item.id !== highlighted.id)]
    : items
  return <div className="space-y-4">{orderedItems.map(item => <ProducerInboxCard key={item.id} item={item} highlighted={item.id === highlightedHandoffId} />)}</div>
}
