'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // null = still checking, true/false = recovery session present or not.
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true

    // The normal path: /auth/callback already exchanged the recovery code for a
    // session, so getSession() resolves truthy on mount. The onAuthStateChange
    // listener is a fallback for hash-fragment recovery links (#access_token=…)
    // that Supabase parses client-side and emits as PASSWORD_RECOVERY.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setHasSession(true)
      else if (active) setHasSession(prev => (prev === true ? true : false))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
    // Give the user a moment to read the confirmation, then land them in the app.
    setTimeout(() => {
      router.push('/vault')
      router.refresh()
    }, 1800)
  }

  if (done) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Password updated</h1>
        <p className="mt-2 text-sm text-white/60">
          You&apos;re all set. Taking you to your vault…
        </p>
        <Link href="/signin" className="mt-6 inline-block text-sm text-white hover:underline">
          Or sign in manually
        </Link>
      </div>
    )
  }

  // Recovery link expired or opened without a recovery session.
  if (hasSession === false) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Reset link expired</h1>
        <p className="mt-2 text-sm text-white/60">
          This password reset link is invalid or has expired. Request a fresh one to continue.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-sm text-white hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold text-white">Set a new password</h1>
      <p className="mt-1 text-sm text-white/50">Choose a password for your account.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white/80">
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-white/80">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Re-enter your password"
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
          disabled={submitting || hasSession === null}
          className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
