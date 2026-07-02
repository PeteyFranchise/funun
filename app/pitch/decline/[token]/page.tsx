'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import AuthLayout from '@/app/(auth)/layout'

// Public page — no auth required, same convention as /pitch/accept/[token].
export const dynamic = 'force-dynamic'

// ─── /pitch/decline/[token] ───────────────────────────────────────────
// Decline lands on an optional-reason page before confirming (D-12).
// Leaving the textarea empty and clicking Decline IS the skip — there is
// no separate Skip button.
export default function DeclinePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'expired' | 'error'>('idle')

  async function decline() {
    setStatus('loading')
    try {
      const res = await fetch(`/api/pitch/decline/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      })
      if (res.status === 410) {
        setStatus('expired')
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
        {status === 'done' ? (
          <p className="text-sm text-white/70">You&apos;ve declined this pitch.</p>
        ) : status === 'expired' ? (
          <p className="text-sm text-white/50">This pitch was already responded to.</p>
        ) : (
          <>
            <h1 className="text-lg font-extrabold text-white">Decline this pitch?</h1>
            <p className="mt-2 text-sm text-white/70">
              No hard feelings — let the artist know why if you&apos;d like, or just decline.
            </p>
            <div className="mt-6">
              <label htmlFor="decline-reason" className="block text-left text-xs text-white/70">
                Let the artist know why (optional)
              </label>
              <textarea
                id="decline-reason"
                aria-label="Reason for declining (optional)"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Not a fit for our playlist right now"
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={decline}
                disabled={status === 'loading'}
                className="mt-4 w-full rounded-lg bg-white px-5 py-3 text-[15px] font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Declining…' : 'Decline'}
              </button>
            </div>
            {status === 'error' && (
              <p className="mt-3 text-center text-xs text-rose-300">
                Something went wrong — please try again.
              </p>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  )
}
