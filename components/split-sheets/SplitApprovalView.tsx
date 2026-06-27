'use client'

import { useState } from 'react'

// ─── SplitApprovalView ──────────────────────────────────────────────────
// Public approval UI rendered on /approve/[token].
// Lets a collaborator approve a proposed split or submit a counter-proposal.
// Designed to degrade legibly without JavaScript (server-rendered shell).
// No auth required — the 256-bit token is the authorization secret (T-01-10).

type Party = {
  id: string
  name: string
  role: string | null
  split_percentage: number
}

type Props = {
  token: string
  partyId: string
  partyName: string
  partyRole: string | null
  songName: string
  artistName: string
  parties: Party[]
}

type SubmitStatus = 'idle' | 'submitting' | 'approved' | 'countered' | 'error'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

export function SplitApprovalView({
  token,
  partyId,
  partyName,
  songName,
  artistName,
  parties,
}: Props) {
  const [showCounter, setShowCounter] = useState(false)
  const [counterInput, setCounterInput] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleApprove() {
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not submit')
      }
      setStatus('approved')
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? `Could not submit. The link may have expired — ask ${artistName} for a new one.`
          : `Could not submit. The link may have expired — ask ${artistName} for a new one.`
      )
      setStatus('error')
    }
  }

  async function handleCounter() {
    const n = Number(counterInput)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setErrorMsg('Your proposed split must be between 0% and 100%.')
      return
    }
    setStatus('submitting')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'counter', counter_split: n }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? 'Could not submit')
      }
      setStatus('countered')
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? `Could not submit. The link may have expired — ask ${artistName} for a new one.`
          : `Could not submit. The link may have expired — ask ${artistName} for a new one.`
      )
      setStatus('error')
    }
  }

  const isSubmitting = status === 'submitting'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-16">
      {/* Funūn wordmark */}
      <div className="mb-2 text-2xl font-extrabold tracking-tight">
        <span className="gtext">Funūn</span>
      </div>
      <p className="mb-8 text-sm text-white/50">
        Split approval request from <span className="text-white/80">{artistName}</span>
      </p>

      {/* ── Content card ── */}
      <div className="w-full max-w-[480px] rounded-[18px] border border-white/10 bg-card p-6">
        <h1 className="mb-4 text-lg font-extrabold text-white">{songName}</h1>

        {/* Party rows */}
        <div className="mb-4 space-y-1">
          {parties.map(p => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                p.id === partyId ? 'bg-[#1A1838]' : ''
              }`}
            >
              <div>
                <span className="text-sm text-white">{p.name}</span>
                {p.role && (
                  <span className="ml-2 text-xs text-white/40">{p.role}</span>
                )}
                {p.id === partyId && (
                  <span className="ml-2 text-xs text-brandindigo">(you)</span>
                )}
              </div>
              <span className="text-sm font-semibold text-white">{p.split_percentage}%</span>
            </div>
          ))}
        </div>

        {/* Total line */}
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Total</span>
            <span className="font-bold text-emerald-300">100%</span>
          </div>
        </div>
      </div>

      {/* ── Action section ── */}
      <div className="mt-6 w-full max-w-[480px] space-y-4">
        {status === 'approved' && (
          <div className="rounded-[18px] border border-emerald-400/30 bg-emerald-400/10 px-6 py-4 text-center">
            <p className="font-semibold text-emerald-400">Split approved</p>
            <p className="mt-1 text-sm text-white/50">
              {artistName} has been notified.
            </p>
          </div>
        )}

        {status === 'countered' && (
          <div className="rounded-[18px] border border-amber-400/30 bg-amber-400/10 px-6 py-4 text-center">
            <p className="font-semibold text-amber-300">Counter-proposal submitted</p>
            <p className="mt-1 text-sm text-white/50">
              {artistName} has been notified and will review your proposal.
            </p>
          </div>
        )}

        {status !== 'approved' && status !== 'countered' && (
          <>
            {/* Error message */}
            {(status === 'error' || errorMsg) && (
              <p className="text-sm text-rose-400">{errorMsg}</p>
            )}

            {/* Approve button — distinct label (accessibility) */}
            <button
              type="button"
              onClick={handleApprove}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-grad px-4 py-3 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
            >
              {isSubmitting && !showCounter ? 'Submitting…' : 'Approve this split'}
            </button>

            {/* Counter toggle */}
            {!showCounter && (
              <button
                type="button"
                onClick={() => {
                  setShowCounter(true)
                  setErrorMsg('')
                }}
                className="w-full text-center text-sm text-white/50 hover:text-white"
              >
                Propose a different split
              </button>
            )}

            {/* Counter-proposal form */}
            {showCounter && (
              <div className="rounded-[18px] border border-white/10 bg-card p-5 space-y-4">
                <div>
                  <label htmlFor="counter-split" className={labelClass}>
                    Your proposed split
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="counter-split"
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={counterInput}
                      onChange={e => {
                        setCounterInput(e.target.value)
                        setErrorMsg('')
                      }}
                      placeholder="e.g. 40"
                      className={inputClass + ' pr-8'}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-white/40">
                      %
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-white/40">
                    The initiating artist will be notified to review and re-send.
                  </p>
                </div>

                {/* Validation error */}
                {errorMsg && (
                  <p className="text-sm text-rose-400">{errorMsg}</p>
                )}

                <div className="flex gap-3">
                  {/* Distinct label — not "Submit" (accessibility) */}
                  <button
                    type="button"
                    onClick={handleCounter}
                    disabled={isSubmitting}
                    className="flex-1 rounded-lg bg-grad px-4 py-2.5 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
                  >
                    {isSubmitting ? 'Submitting…' : 'Submit counter-proposal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCounter(false)
                      setCounterInput('')
                      setErrorMsg('')
                    }}
                    className="text-sm text-white/50 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-8 text-xs text-white/30">
        Powered by Funūn — rights and registration for independent artists
      </p>
    </div>
  )
}
