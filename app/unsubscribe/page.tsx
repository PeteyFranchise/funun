'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// D-19 (INVITE-12): broadcast-only opt-out landing, reached from the
// "we've reopened" waitlist broadcast email's unsubscribe link. Reuses the
// dark auth-style card treatment (rounded-xl border border-white/10
// bg-white/[0.03] p-6) from app/(auth)/signup/page.tsx — this route lives
// outside the (auth) route group, so the centering + wordmark shell that
// AuthLayout normally provides is reproduced here directly.
//
// Codex review Blocker B2 (27-CODEX-REVIEW.md): this page used to render
// "You've unsubscribed" on load without ever calling a mutation —
// `unsubscribed_at` was never set, a false opt-out. It now calls
// POST /api/waitlist/unsubscribe on load (a 'checking' state covers the
// round trip) and only shows the confirmation once that call succeeds; a
// missing/invalid token or a failed call falls through to the same 'error'
// state as before.

type UnsubscribeState = 'checking' | 'unsubscribed' | 'resubscribed' | 'error'

function UnsubscribeFlow() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [state, setState] = useState<UnsubscribeState>(token ? 'checking' : 'error')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    let cancelled = false

    async function unsubscribe() {
      try {
        const res = await fetch('/api/waitlist/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (!res.ok) {
          setState('error')
          return
        }
        setState('unsubscribed')
      } catch {
        if (!cancelled) setState('error')
      }
    }

    unsubscribe()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleResubscribe() {
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/waitlist/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.status === 429) {
        setError('Too many requests. Please try again later.')
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        setState('error')
        setSubmitting(false)
        return
      }
      setState('resubscribed')
      setSubmitting(false)
    } catch {
      setError('Something went wrong — try again.')
      setSubmitting(false)
    }
  }

  if (state === 'checking') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Unsubscribing&hellip;</h1>
        <p className="mt-2 text-sm text-white/60">One moment.</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">We couldn&rsquo;t find that link</h1>
        <p className="mt-2 text-sm text-white/60">
          This unsubscribe link is invalid or has already been used.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Rejoin the waiting list
        </Link>
      </div>
    )
  }

  if (state === 'resubscribed') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">
          You&rsquo;re resubscribed — you&rsquo;re back on the list.
        </h1>
        <p className="mt-2 text-sm text-white/60">
          We&rsquo;ll email you the moment a spot opens, including reopen announcements.
        </p>
      </div>
    )
  }

  // state === 'unsubscribed'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold text-white">You&rsquo;ve unsubscribed</h1>
      <p className="mt-2 text-sm text-white/60">
        You won&rsquo;t get Funūn&rsquo;s waiting-list broadcasts anymore.
      </p>

      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/50">
        A personal invite from a collaborator or the Funūn team will still reach you — this only
        turns off the bulk &ldquo;we&rsquo;ve reopened&rdquo; announcements.
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleResubscribe}
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
      >
        {submitting ? 'Resubscribing…' : 'Resubscribe'}
      </button>

      <p className="mt-6 text-center text-sm text-white/50">
        Or{' '}
        <Link href="/signup" className="text-white hover:underline">
          rejoin the waiting list
        </Link>
      </p>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white">
            Funūn
          </Link>
          <p className="mt-1 text-sm text-white/50">The operating system for your music career.</p>
        </div>
        <Suspense>
          <UnsubscribeFlow />
        </Suspense>
      </div>
    </div>
  )
}
