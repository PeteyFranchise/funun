'use client'

import { useState } from 'react'
import Link from 'next/link'
import AuthLayout from '@/app/(auth)/layout'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30'

// ─── /sync/access ──────────────────────────────────────────────────────
// 23-02: moved from app/buyers/access/page.tsx to app/sync/access/page.tsx
// as part of the /buyers/* → /sync/* unification. Dedicated buyer sign-in
// landing (D-11 fully separate login), mirroring the curator claim-page
// pattern (app/curators/claim/page.tsx). This page offers a magic-link
// sign-in form for an already-invited buyer, never self-serve org signup
// on this page — that path is the public /sync landing + its Register
// modal (23-07). This is where the /sync layout's authenticated sub-pages
// send any unauthenticated visitor, never /signin.
//
// Copy revised (23-02): the old "invite-only during beta" framing is stale
// now that public register exists via the /sync landing's modal — this
// page is framed purely as "already have an account? sign in."
export default function SyncAccessPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <AuthLayout>
      <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
        <h1 className="text-lg font-extrabold text-white">Sign in to Funūn Sync</h1>
        <p className="mt-2 text-sm text-white/70">
          Already have an account? Enter your work email and we&apos;ll send you a sign-in link.
        </p>

        {sent ? (
          <p className="mt-6 text-sm text-lav">Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/80">
                Work email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={inputClass}
              />
            </div>

            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {submitting ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}

        <p className="mt-6 text-xs text-white/40">
          New to Funūn Sync?{' '}
          <Link href="/sync" className="text-white/70 underline hover:text-white">
            Visit the Funūn Sync homepage
          </Link>{' '}
          to register or talk to a sales rep.
        </p>
      </div>
    </AuthLayout>
  )
}
