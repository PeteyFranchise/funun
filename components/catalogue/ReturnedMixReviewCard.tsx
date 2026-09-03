'use client'

import { useState } from 'react'
import { returnedMixReviewAction, type ReturnedMixReviewOutcome } from '@/lib/catalogue/returned-mix-review'

export type ReturnedMixReviewItem = {
  returnId: string
  versionId: string
  versionDisplay: string
  versionLabel: string
  producerName: string
  note: string | null
  returnedAt: string
  isWorking: boolean
}

type Props = {
  items: ReturnedMixReviewItem[]
  canCompare: boolean
  hasWorkingTake: boolean
  onCompare: (versionId: string) => void
  onReview: (returnId: string, outcome: ReturnedMixReviewOutcome) => Promise<{ ok: boolean; error?: string }>
}

function dateLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently returned'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
}

export function ReturnedMixReviewCard({ items, canCompare, hasWorkingTake, onCompare, onReview }: Props) {
  const [handledIds, setHandledIds] = useState<string[]>([])
  const [later, setLater] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = items.find(candidate => !handledIds.includes(candidate.returnId))
  if (!item || later) return null

  const actions = returnedMixReviewAction({ isWorking: item.isWorking, hasWorkingTake })
  const activeReturnId = item.returnId

  async function review(outcome: ReturnedMixReviewOutcome) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await onReview(activeReturnId, outcome)
      if (result.ok) setHandledIds(current => [...current, activeReturnId])
      else setError(result.error ?? 'Could not save this review.')
    } catch {
      setError('Could not save this review. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="returned-mix-review-title" className="mt-4 rounded-[12px] border border-brandindigo/35 bg-brandindigo/[.05] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-brandindigo">Producer return · {item.versionDisplay}</p>
          <h2 id="returned-mix-review-title" className="mt-1 text-[15px] font-semibold text-white">{item.producerName} brought back “{item.versionLabel}”</h2>
          <p className="mt-1 text-[10px] text-lavdim">{dateLabel(item.returnedAt)}{items.length - handledIds.length > 1 ? ` · ${items.length - handledIds.length} returns waiting` : ''}</p>
        </div>
        <button type="button" disabled={saving} onClick={() => setLater(true)} className="text-[10px] text-lavdim hover:text-white disabled:opacity-40">Later</button>
      </div>
      {item.note && <p className="mt-3 whitespace-pre-wrap rounded-[9px] border border-hair bg-card2 px-3 py-2 text-[11px] leading-5 text-lav">“{item.note}”</p>}
      <p className="mt-3 text-[10px] leading-4 text-lavdim">Listen or decide whenever the room is ready. This never blocks writing, recording, comments, or another upload—and it is not master approval.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-brandindigo/20 pt-3">
        {canCompare && <button type="button" disabled={saving} onClick={() => onCompare(item.versionId)} className="rounded-[8px] border border-hairstrong bg-card2 px-3 py-2 text-[10px] font-semibold text-brandindigo hover:border-brandindigo hover:text-white disabled:opacity-40">⇄ {hasWorkingTake ? 'Compare with working take' : 'Compare with another take'}</button>}
        <button type="button" disabled={saving} onClick={() => void review('made_working')} className="rounded-[8px] border border-brandindigo/45 bg-brandindigo/10 px-3 py-2 text-[10px] font-semibold text-brandindigo hover:text-white disabled:opacity-40">{saving ? 'Saving…' : actions.primary}</button>
        {actions.secondary && <button type="button" disabled={saving} onClick={() => void review('kept_current')} className="text-[10px] font-semibold text-lav hover:text-white disabled:opacity-40">{actions.secondary}</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-[10px] text-red-300">{error}</p>}
    </section>
  )
}
