'use client'

import { useState } from 'react'
import type { RightsSetupState } from '@/lib/profile/rights-setup'

export function RightsSetupCompanion({
  state,
  onJumpTo,
  onMarkUnaffiliated,
  onMarkSelfPublished,
}: {
  state: RightsSetupState
  onJumpTo: (targetId: string) => void
  onMarkUnaffiliated: () => void
  onMarkSelfPublished: () => void
}) {
  const [reminding, setReminding] = useState(false)
  const [reminderMessage, setReminderMessage] = useState<string | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const firstOpenItem = state.items.find(item => item.status !== 'handled')

  async function remindLater() {
    if (reminding) return
    setReminding(true)
    setReminderError(null)

    try {
      const response = await fetch('/api/rights-setup/remind', { method: 'POST' })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setReminderError(body.error ?? 'Could not set your reminder. Please try again.')
        setReminding(false)
        return
      }
      setReminderMessage('We’ll check in again in 7 days.')
    } catch {
      setReminderError('Could not reach the server. Check your connection and try again.')
    } finally {
      setReminding(false)
    }
  }

  return (
    <section
      className="rounded-card border border-hair bg-card px-5 py-5"
      aria-labelledby="rights-setup-companion-title"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-lav">
            Rights setup companion
          </p>
          <h2 id="rights-setup-companion-title" className="mt-1.5 text-lg font-bold text-white">
            {state.complete ? 'You’re caught up.' : 'Stay on top of the business side.'}
          </h2>
          <p className="mt-1 max-w-[590px] text-xs leading-5 text-lavdim">
            {state.complete
              ? 'Your core profile details are ready to flow into future splits, contracts, and registrations.'
              : 'Nothing here blocks songwriting. Handle what you know now, and come back when the rest is ready.'}
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-lavdim">
          {state.complete
            ? 'All handled'
            : `${state.remainingCount} ${state.remainingCount === 1 ? 'detail' : 'details'} to revisit`}
        </span>
      </div>

      <div className="mt-5 border-t border-hair">
        {state.items.map((item, index) => (
          <div
            key={item.key}
            className="flex flex-wrap items-center gap-3 border-b border-hair py-3"
          >
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                item.status === 'handled'
                  ? 'bg-emerald-400/10 text-emerald-300'
                  : 'bg-white/[.06] text-lavdim'
              }`}
            >
              {item.status === 'handled' ? '✓' : index + 1}
            </span>
            <div className="min-w-[180px] flex-1">
              <p className="text-sm font-semibold text-white">{item.label}</p>
              <p className="mt-0.5 text-xs text-lavdim">{item.detail}</p>
            </div>

            {item.status === 'handled' ? (
              <span className="text-xs font-semibold text-emerald-300">Handled</span>
            ) : item.key === 'pro' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJumpTo(item.targetId)}
                  className="rounded-lg border border-hairstrong px-3 py-2 text-xs font-semibold text-lav transition hover:text-white"
                >
                  Add now
                </button>
                <button
                  type="button"
                  onClick={onMarkUnaffiliated}
                  className="px-2 py-2 text-xs font-semibold text-lavdim transition hover:text-white"
                >
                  Not affiliated yet
                </button>
              </div>
            ) : item.key === 'publishing' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onJumpTo(item.targetId)}
                  className="rounded-lg border border-hairstrong px-3 py-2 text-xs font-semibold text-lav transition hover:text-white"
                >
                  Add now
                </button>
                <button
                  type="button"
                  onClick={onMarkSelfPublished}
                  className="px-2 py-2 text-xs font-semibold text-lavdim transition hover:text-white"
                >
                  I’m self-published
                </button>
              </div>
            ) : item.status === 'waiting' ? (
              <span className="text-xs text-lavdim">Waiting on PRO status</span>
            ) : (
              <button
                type="button"
                onClick={() => onJumpTo(item.targetId)}
                className="rounded-lg border border-hairstrong px-3 py-2 text-xs font-semibold text-lav transition hover:text-white"
              >
                Add now
              </button>
            )}
          </div>
        ))}
      </div>

      {!state.complete && (
        <div className="mt-5">
          <p className="text-[11px] leading-5 text-lavdim">
            Choices made here update the form below. Save changes when you’re done.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {firstOpenItem && (
              <button
                type="button"
                onClick={() => onJumpTo(firstOpenItem.targetId)}
                className="rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-white/90"
              >
                Continue setup
              </button>
            )}
            <button
              type="button"
              disabled={reminding || reminderMessage !== null}
              onClick={remindLater}
              className="px-2 py-2.5 text-xs font-semibold text-lavdim transition hover:text-white disabled:opacity-50"
            >
              {reminding ? 'Setting reminder…' : reminderMessage ? 'Reminder set' : 'Remind me later'}
            </button>
            {reminderMessage && (
              <span className="text-xs text-emerald-300" role="status">
                {reminderMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {reminderError && (
        <p role="alert" className="mt-3 text-xs text-rose-300">
          {reminderError}
        </p>
      )}
    </section>
  )
}
