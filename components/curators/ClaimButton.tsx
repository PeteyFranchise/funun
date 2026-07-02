'use client'

import { useState } from 'react'

// ─── ClaimButton ──────────────────────────────────────────────────────
// Small client island for the public claim page (app/curators/claim/[token]
// /page.tsx stays a server component that decides token validity — this is
// the one piece of the page that needs interactivity: POST the claim, then
// flip to a "check your email" confirmation without a full page reload).

export function ClaimButton({ token, children }: { token: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function claim() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch(`/api/curators/claim/${token}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong — please try again.')
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setError('Something went wrong — please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <p className="text-sm text-white/70">
        Check your email — we sent you a sign-in link to your curator profile.
      </p>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={claim}
        disabled={status === 'loading'}
        className="w-full rounded-lg bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'loading' ? 'Claiming…' : children}
      </button>
      {error && <p className="mt-3 text-center text-xs text-rose-300">{error}</p>}
    </div>
  )
}
