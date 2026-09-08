'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { ReadingState } from '@/lib/playbook/assignments'

export type LearningQueueItem = {
  assignmentId: string
  entryId: string
  title: string
  roomKey: string
  roomLabel: string
  slug: string
  requiredRevision: number
  acknowledgedRevision: number | null
  dueAt: string | null
  required: boolean
  state: ReadingState
  audienceLabel: string
  assignedByLabel: string | null
}

function formatDate(value: string | null): string {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const STATE_LABEL: Record<ReadingState, string> = {
  complete: 'Acknowledged',
  overdue: 'Overdue',
  due: 'Required reading',
  optional: 'Recommended',
  retired: 'Retired',
}

export function LearningQueue({ items }: { items: LearningQueueItem[] }) {
  const router = useRouter()
  const [showComplete, setShowComplete] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const visible = useMemo(
    () => items.filter(item => showComplete || item.state !== 'complete'),
    [items, showComplete]
  )
  const outstanding = items.filter(item => item.state !== 'complete' && item.state !== 'retired').length
  const completed = items.filter(item => item.state === 'complete').length

  async function acknowledge(item: LearningQueueItem) {
    setBusyId(item.assignmentId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/playbook/assignments/${item.assignmentId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomKey: item.roomKey }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Could not record acknowledgement')
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record acknowledgement')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">Outstanding</p>
          <p className="mt-1 text-2xl font-extrabold text-[color:var(--ink)]">{outstanding}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[color:var(--ink-3)]">Acknowledged</p>
          <p className="mt-1 text-2xl font-extrabold text-[#6ee7b7]">{completed}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[12px] text-[color:var(--ink-3)]">Required items are ordered by urgency.</p>
        <label className="flex items-center gap-2 text-[12px] font-bold text-[color:var(--ink-2)]">
          <input type="checkbox" checked={showComplete} onChange={event => setShowComplete(event.target.checked)} />
          Show acknowledged
        </label>
      </div>

      {error && <p role="alert" className="mt-3 text-[12px] text-[#fca5a5]">{error}</p>}
      <div className="mt-3 space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--border)] px-6 py-12 text-center">
            <p className="font-bold text-[color:var(--ink)]">You’re caught up</p>
            <p className="mt-1 text-[13px] text-[color:var(--ink-3)]">No Playbook reading is waiting for you.</p>
          </div>
        ) : visible.map(item => (
          <article key={item.assignmentId} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[.11em] text-[color:var(--ink-3)]">
                  <span>{item.roomLabel}</span><span aria-hidden>·</span><span>{item.audienceLabel}</span>
                </div>
                <h2 className="mt-1 text-[16px] font-extrabold text-[color:var(--ink)]">{item.title}</h2>
                <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">
                  {STATE_LABEL[item.state]} · Revision {item.requiredRevision} · {formatDate(item.dueAt)}
                  {item.assignedByLabel ? ` · Assigned by ${item.assignedByLabel}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href={`/admin/playbook/${item.roomKey}/${item.slug}`}
                  className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[11px] font-bold text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
                >
                  Read article
                </Link>
                {item.state !== 'complete' && item.state !== 'retired' && (
                  <button
                    type="button"
                    disabled={busyId === item.assignmentId}
                    onClick={() => acknowledge(item)}
                    className="rounded-lg px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
                    style={{ background: 'var(--grad)' }}
                  >
                    {busyId === item.assignmentId ? 'Recording…' : 'I’ve read this'}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-5 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] px-4 py-3 text-[11px] leading-5 text-[color:var(--ink-3)]">
        An acknowledgement records that you say you read this Playbook revision. It is not a signature, agreement, approval, policy acceptance, or legal consent.
      </p>
    </div>
  )
}
