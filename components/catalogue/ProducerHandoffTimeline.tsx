'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  buildProducerHandoffRecap,
  formatTechnicalDuration,
  formatTechnicalSize,
  producerHandoffAttention,
  producerHandoffStage,
  type ProducerFeedbackResponse,
  type ProducerFeedbackSnapshot,
  type ProducerHandoffStage,
} from '@/lib/catalogue/producer-handoff'

export type ProducerHandoffTimelineReturn = {
  returnId: string
  versionId: string
  versionDisplay: string
  label: string
  roundLabel: string | null
  note: string | null
  returnedAt: string
  playbackUrl: string | null
  downloadUrl: string | null
  audioExt: string
  audioSize: number | null
  durationSeconds: number | null
  feedbackResponses: ProducerFeedbackResponse[]
  review: { outcome: 'made_working' | 'kept_current'; reviewedAt: string } | null
}

export type ProducerHandoffTimelineItem = {
  id: string
  workId: string
  songTitle: string
  senderId: string
  senderName: string
  recipientId: string | null
  recipientName: string
  viewerIsSender: boolean
  viewerIsRecipient: boolean
  sentAt: string
  acknowledgedAt: string | null
  workingAt: string | null
  canNudge: boolean
  roundLabel: string | null
  bpm: number | null
  musicalKey: string | null
  referenceUrl: string | null
  direction: string | null
  feedback: ProducerFeedbackSnapshot[]
  rough: {
    versionId: string
    versionDisplay: string
    label: string
    playbackUrl: string | null
    downloadUrl: string | null
    audioExt: string
    audioSize: number | null
    durationSeconds: number | null
  }
  vocalDownloadUrl: string | null
  vocalSize: number | null
  returns: ProducerHandoffTimelineReturn[]
  activities: { actorName: string; kind: 'listened' | 'compared'; versionDisplay: string | null; lastAt: string }[]
}

const STAGES: { key: ProducerHandoffStage; label: string }[] = [
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'returned', label: 'Mix returned' },
  { key: 'reviewed', label: 'Reviewed' },
]

const STAGE_RANK: Record<ProducerHandoffStage, number> = {
  sent: 0,
  received: 1,
  working: 1,
  returned: 2,
  reviewed: 3,
}

const FEEDBACK_STATUS_LABELS: Record<ProducerFeedbackResponse['status'], string> = {
  done: 'Done',
  tried: 'Tried another way',
  discuss: 'Let’s discuss',
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function timestampLabel(timestampMs: number): string {
  const seconds = Math.max(0, Math.floor(timestampMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function responseFor(feedbackId: string, responses: ProducerFeedbackResponse[]): ProducerFeedbackResponse | null {
  return responses.find(response => response.feedbackId === feedbackId) ?? null
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
}

function HandoffCard({
  item,
  emphasized,
  onCompare,
}: {
  item: ProducerHandoffTimelineItem
  emphasized: boolean
  onCompare: (handoffId: string, versionId: string) => void
}) {
  const router = useRouter()
  const [acknowledgedAt, setAcknowledgedAt] = useState(item.acknowledgedAt)
  const [workingAt, setWorkingAt] = useState(item.workingAt)
  const [nudgeCoolingDown, setNudgeCoolingDown] = useState(!item.canNudge)
  const [saving, setSaving] = useState<'acknowledge' | 'working' | 'nudge' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const recordedActivity = useRef(new Set<string>())
  const reviewCount = item.returns.filter(returned => returned.review).length
  const unreviewedReturnCount = item.returns.length - reviewCount
  const stage = producerHandoffStage({ acknowledgedAt, workingAt, returnCount: item.returns.length, reviewCount })
  const attention = producerHandoffAttention({
    isRecipient: item.viewerIsRecipient,
    stage,
    unreviewedReturnCount,
    recipientName: item.recipientName,
  })
  const newestReturn = item.returns[0] ?? null

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

  function compare(versionId: string) {
    recordActivity('compared', versionId)
    onCompare(item.id, versionId)
  }

  async function postAction(action: 'acknowledge' | 'working' | 'nudge') {
    if (saving) return
    setSaving(action)
    setError(null)
    const endpoint = action === 'acknowledge' ? 'acknowledge' : action === 'working' ? 'working' : 'nudge'
    try {
      const response = await fetch(`/api/producer-handoffs/${item.id}/${endpoint}`, { method: 'POST' })
      if (!response.ok) throw new Error(await responseError(response, `Could not ${action} this handoff.`))
      const body = (await response.json()) as { data?: { acknowledged_at?: string; working_at?: string; created_at?: string } }
      if (action === 'acknowledge') setAcknowledgedAt(body.data?.acknowledged_at ?? new Date().toISOString())
      if (action === 'working') {
        setWorkingAt(body.data?.working_at ?? new Date().toISOString())
        setAcknowledgedAt(current => current ?? new Date().toISOString())
      }
      if (action === 'nudge') setNudgeCoolingDown(true)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this producer handoff.')
    } finally {
      setSaving(null)
    }
  }

  async function copyRecap() {
    if (!navigator.clipboard) {
      setError('Copy is unavailable in this browser.')
      return
    }
    try {
      await navigator.clipboard.writeText(buildProducerHandoffRecap({
        songTitle: item.songTitle,
        senderName: item.senderName,
        recipientName: item.recipientName,
        stage,
        roundLabel: item.roundLabel,
        bpm: item.bpm,
        musicalKey: item.musicalKey,
        referenceUrl: item.referenceUrl,
        direction: item.direction,
        feedbackCount: item.feedback.length,
      }))
      setCopied(true)
    } catch {
      setError('Could not copy the handoff recap.')
    }
  }

  const mobileAction = item.viewerIsRecipient && !acknowledgedAt
    ? { label: saving === 'acknowledge' ? 'Saving…' : 'I got it', action: () => postAction('acknowledge') }
    : item.viewerIsRecipient && !workingAt && item.returns.length === 0
      ? { label: saving === 'working' ? 'Sharing…' : 'Working on it', action: () => postAction('working') }
      : newestReturn
        ? { label: 'Compare latest return', action: () => compare(newestReturn.versionId) }
        : item.viewerIsSender && !nudgeCoolingDown
          ? { label: saving === 'nudge' ? 'Sending…' : 'Nudge producer', action: () => postAction('nudge') }
          : null

  return (
    <article id={`handoff-${item.id}`} className={`rounded-[12px] border bg-card p-4 ${emphasized ? 'border-brandindigo/60' : 'border-hair'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-brandindigo">Producer handoff{item.roundLabel ? ` · ${item.roundLabel}` : ''}</p>
          <h3 className="mt-1 text-[14px] font-semibold text-white">{item.senderName} → {item.recipientName}</h3>
          <p className="mt-1 text-[10px] text-lavdim">{dateLabel(item.sentAt)} · {attention}</p>
        </div>
        <button type="button" onClick={() => void copyRecap()} className="text-[10px] text-lavdim hover:text-white">{copied ? 'Copied recap ✓' : 'Copy recap'}</button>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1" aria-label={`Handoff status: ${stage}`}>
        {STAGES.map((step, index) => {
          const complete = index <= STAGE_RANK[stage]
          return <div key={step.key} className="min-w-0"><span className={`block h-1 rounded-full ${complete ? 'bg-brandindigo' : 'bg-hairstrong'}`} /><span className={`mt-1 block truncate text-[8px] ${complete ? 'text-lav' : 'text-lavdim'}`}>{step.label}</span></div>
        })}
      </div>
      {workingAt && stage === 'working' && <p className="mt-2 text-[9px] text-emerald-300">● {item.recipientName} marked this round Working on it · {dateLabel(workingAt)}</p>}

      {(item.bpm || item.musicalKey || item.referenceUrl) && <div className="mt-3 flex flex-wrap items-center gap-2 text-[9px] text-lavdim">{item.bpm && <span>{item.bpm} BPM</span>}{item.musicalKey && <span>· {item.musicalKey}</span>}{item.referenceUrl && <a href={item.referenceUrl} target="_blank" rel="noreferrer" className="font-semibold text-brandindigo hover:text-white">↗ Reference track</a>}</div>}
      {item.direction && <p className="mt-3 whitespace-pre-wrap rounded-[8px] border border-hair bg-card2 px-3 py-2 text-[10px] leading-4 text-lav">“{item.direction}”</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[9px] border border-hair bg-card2 p-3">
          <p className="text-[10px] font-semibold text-white">{item.rough.versionDisplay} · {item.rough.label}</p>
          <p className="mt-1 text-[9px] text-lavdim">{item.rough.audioExt.toUpperCase()} · {formatTechnicalDuration(item.rough.durationSeconds)} · {formatTechnicalSize(item.rough.audioSize)}</p>
          {item.rough.playbackUrl && <audio controls preload="metadata" src={item.rough.playbackUrl} onPlay={() => recordActivity('listened', item.rough.versionId)} aria-label={`Play ${item.rough.versionDisplay} rough mix`} className="mt-2 h-8 w-full" />}
          <div className="mt-2 flex gap-3">{item.rough.downloadUrl && <a href={item.rough.downloadUrl} download className="text-[9px] font-semibold text-brandindigo hover:text-white">↓ Rough mix</a>}{item.vocalDownloadUrl && <a href={item.vocalDownloadUrl} download className="text-[9px] font-semibold text-brandindigo hover:text-white">↓ Dry vocal · WAV · 0:00 · {formatTechnicalSize(item.vocalSize)}</a>}</div>
        </div>
        <div className="rounded-[9px] border border-hair bg-card2 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Version lineage</p>
          <p className="mt-2 text-[10px] leading-5 text-lav">{item.rough.versionDisplay} rough{item.returns.map(returned => ` → ${returned.versionDisplay}${returned.roundLabel ? ` ${returned.roundLabel}` : ''}`).join('')}</p>
          <p className="mt-1 text-[9px] text-lavdim">Every round remains a separate take.</p>
        </div>
      </div>

      {item.feedback.length > 0 && <div className="mt-3"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Timed production feedback</p><div className="mt-2 space-y-1.5">{item.feedback.map(feedback => {
        const latestResponse = newestReturn ? responseFor(feedback.feedbackId, newestReturn.feedbackResponses) : null
        return <a key={feedback.feedbackId} href={`/vault/works/${item.workId}?version=${feedback.versionId}&comment=${feedback.feedbackId}&t=${feedback.timestampMs}`} className="flex flex-wrap items-start justify-between gap-2 rounded-[8px] border border-hair px-2.5 py-2 text-[9px] text-lav hover:border-brandindigo"><span><b className="text-brandindigo">{feedback.versionDisplay} · {timestampLabel(feedback.timestampMs)}</b> · {feedback.body}</span>{latestResponse && <span className="font-semibold text-emerald-300">{FEEDBACK_STATUS_LABELS[latestResponse.status]}</span>}</a>
      })}</div><p className="mt-1.5 text-[8px] text-lavdim">Optional prompts—never a delivery gate.</p></div>}

      {item.returns.length > 0 && <div className="mt-3 space-y-2 border-t border-hair pt-3"><p className="text-[9px] font-semibold uppercase tracking-[.1em] text-lavdim">Returned mixes</p>{item.returns.map(returned => <div key={returned.returnId} className="rounded-[9px] border border-hair bg-card2 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] font-semibold text-white">{returned.versionDisplay} · {returned.roundLabel ?? returned.label}</p><p className="mt-1 text-[9px] text-lavdim">{returned.audioExt.toUpperCase()} · {formatTechnicalDuration(returned.durationSeconds)} · {formatTechnicalSize(returned.audioSize)} · {dateLabel(returned.returnedAt)}</p></div><div className="flex gap-3">{returned.downloadUrl && <a href={returned.downloadUrl} download className="text-[9px] font-semibold text-brandindigo hover:text-white">Download</a>}<button type="button" onClick={() => compare(returned.versionId)} className="text-[9px] font-semibold text-brandindigo hover:text-white">Compare</button></div></div>{returned.note && <p className="mt-2 text-[9px] text-lav">“{returned.note}”</p>}{returned.playbackUrl && <audio controls preload="metadata" src={returned.playbackUrl} onPlay={() => recordActivity('listened', returned.versionId)} aria-label={`Play returned ${returned.versionDisplay}`} className="mt-2 h-8 w-full" />}{returned.review && <p className="mt-2 text-[9px] text-emerald-300">Reviewed · {returned.review.outcome === 'made_working' ? 'made working take' : 'kept current working take'} · not master approval</p>}</div>)}</div>}

      {item.activities.length > 0 && <div className="mt-3 border-t border-hair pt-2"><p className="text-[9px] text-lavdim">{item.activities.slice(0, 3).map(activity => `${activity.actorName} ${activity.kind}${activity.versionDisplay ? ` to ${activity.versionDisplay}` : ''} · ${dateLabel(activity.lastAt)}`).join('  ·  ')}</p></div>}

      <div className="mt-3 hidden flex-wrap items-center gap-3 border-t border-hair pt-3 md:flex">
        {item.viewerIsRecipient && !acknowledgedAt && <button type="button" disabled={Boolean(saving)} onClick={() => void postAction('acknowledge')} className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{saving === 'acknowledge' ? 'Saving…' : 'I got it'}</button>}
        {item.viewerIsRecipient && !workingAt && item.returns.length === 0 && <button type="button" disabled={Boolean(saving)} onClick={() => void postAction('working')} className="text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{saving === 'working' ? 'Sharing…' : 'Working on it'}</button>}
        {item.viewerIsSender && item.returns.length === 0 && <button type="button" disabled={Boolean(saving) || nudgeCoolingDown} onClick={() => void postAction('nudge')} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">{saving === 'nudge' ? 'Sending…' : nudgeCoolingDown ? 'Reminder sent recently' : 'Nudge producer'}</button>}
      </div>
      {mobileAction && <button type="button" disabled={Boolean(saving)} onClick={() => void mobileAction.action()} className="mt-3 w-full rounded-[9px] border border-brandindigo/45 bg-brandindigo/10 px-3 py-2.5 text-[10px] font-semibold text-brandindigo disabled:opacity-40 md:hidden">{mobileAction.label}</button>}
      {error && <p role="alert" className="mt-2 text-[10px] text-red-300">{error}</p>}
      <p className="mt-2 text-[8px] text-lavdim">Status here tracks the creative handoff only—not master approval, rights, splits, or release readiness.</p>
    </article>
  )
}

export function ProducerHandoffTimeline({
  items,
  highlightedHandoffId = null,
  onCompare,
}: {
  items: ProducerHandoffTimelineItem[]
  highlightedHandoffId?: string | null
  onCompare: (handoffId: string, versionId: string) => void
}) {
  if (items.length === 0) return null
  const current = highlightedHandoffId
    ? items.find(item => item.id === highlightedHandoffId) ?? items[0]!
    : items[0]!
  const earlier = items.filter(item => item.id !== current.id)
  const unreviewed = items.reduce((count, item) => count + item.returns.filter(returned => !returned.review).length, 0)

  return (
    <section aria-labelledby="producer-handoffs-title" className="mt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[9px] font-semibold uppercase tracking-[.14em] text-brandindigo">Production workspace</p><h2 id="producer-handoffs-title" className="mt-1 text-[15px] font-semibold text-white">Producer handoffs</h2></div><p className="text-[10px] text-lavdim">{unreviewed > 0 ? `${unreviewed} ${unreviewed === 1 ? 'mix needs' : 'mixes need'} a listen` : `${items.length} ${items.length === 1 ? 'round' : 'rounds'} on record`}</p></div>
      <HandoffCard item={current} emphasized onCompare={onCompare} />
      {earlier.length > 0 && <details className="mt-3 rounded-[10px] border border-hair bg-card/60 px-3 py-2"><summary className="cursor-pointer text-[10px] font-semibold text-lavdim">Earlier handoffs ({earlier.length})</summary><div className="mt-3 space-y-3 border-t border-hair pt-3">{earlier.map(item => <HandoffCard key={item.id} item={item} emphasized={item.id === highlightedHandoffId} onCompare={onCompare} />)}</div></details>}
    </section>
  )
}
