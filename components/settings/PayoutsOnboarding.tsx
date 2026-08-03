'use client'

import { useEffect, useState } from 'react'

type OnboardingStatus = {
  status: 'not_started' | 'in_progress' | 'complete'
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  stale?: boolean
  error?: string
}

// ─── Payouts onboarding (D-17a) ───────────────────────────────────────────
// Artist-facing state for Stripe Connect Express onboarding, framed in
// artist terms: this is how an artist's net from a sync deal reaches their
// bank, and Funūn takes its commission before the transfer (D-20) —
// consistent with "Still your song. Still your money." Renders three
// states (not started / in progress with a resume action / complete)
// driven by a REAL status check against GET /api/settings/payouts, never
// assumed-success-after-redirect.
export function PayoutsOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/settings/payouts')
      .then(res => res.json())
      .then((data: OnboardingStatus) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load payout status.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function startOrResume() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/payouts', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start onboarding.')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start onboarding.')
      setStarting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-white/50">Checking payout status…</p>
  }

  const state = status?.status ?? 'not_started'

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Payouts</h2>
      <p className="mt-1 text-sm text-white/60">
        This is how your net from a sync deal reaches your bank. Funūn takes its commission
        before the transfer — still your song, still your money.
      </p>

      <div className="mt-4">
        {state === 'complete' && (
          <p className="text-sm text-emerald-400">Connected — your account is ready to receive payouts.</p>
        )}
        {state === 'in_progress' && (
          <p className="text-sm text-amber-400">
            Onboarding started but not finished yet — resume it to receive payouts.
          </p>
        )}
        {state === 'not_started' && (
          <p className="text-sm text-white/60">You haven't connected a payout account yet.</p>
        )}

        {status?.stale && (
          <p className="mt-2 text-xs text-white/40">
            Showing your last-known status — Stripe couldn't be reached just now.
          </p>
        )}

        {state !== 'complete' && (
          <button
            type="button"
            onClick={startOrResume}
            disabled={starting}
            className="mt-4 rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
          >
            {starting ? 'Redirecting…' : state === 'in_progress' ? 'Resume onboarding' : 'Connect payouts'}
          </button>
        )}

        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  )
}
