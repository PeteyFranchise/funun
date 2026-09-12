'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthEvent, reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'

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
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false)
  const [sessionReference, setSessionReference] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    // The normal path: /auth/callback already exchanged the recovery code for a
    // session. Validate it with getUser() rather than trusting locally decoded
    // session storage before enabling a credential change.
    supabase.auth.getUser().then(({ data, error: userError }) => {
      if (!active) return
      if (userError || !data.user) {
        setSessionCheckFailed(Boolean(userError))
        setSessionReference(reportBrowserAuthEvent({
          eventCode: 'recovery_verify_failed',
          surface: 'update_password',
          workspaceIntent: null,
        }))
        setHasSession(false)
        return
      }
      setHasSession(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setSessionCheckFailed(false)
        setHasSession(true)
      }
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

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(reportBrowserAuthFailure(
          {
            eventCode: 'password_update_failed',
            surface: 'update_password',
            workspaceIntent: null,
          },
          publicAuthError('password-update', updateError)
        ))
        return
      }

      // Role-aware landing (23-05 Pitfall 2): a buyer who sets/resets a password
      // must not be dropped on the artist Sound Vault. If identity validation is
      // temporarily unavailable after the successful change, use sign-in as the
      // safe landing rather than guessing a workspace.
      const { data, error: userError } = await supabase.auth.getUser()
      const destination = userError || !data.user
        ? '/signin'
        : postSignInPath({ user: data.user })

      // Recovery should not leave other browser sessions active. This is
      // best-effort because the password change itself is already complete.
      await supabase.auth.signOut({ scope: 'others' })

      setDone(true)
      // Give the user a moment to read the confirmation, then land them in the app.
      setTimeout(() => {
        router.push(destination)
        router.refresh()
      }, 1800)
    } catch {
      setError(reportBrowserAuthFailure(
        {
          eventCode: 'password_update_failed',
          surface: 'update_password',
          workspaceIntent: null,
        },
        publicAuthError('password-update', null)
      ))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Password updated</h1>
        <p className="mt-2 text-sm text-white/60">
          You&apos;re all set. Taking you in…
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
        <h1 className="text-xl font-semibold text-white">
          {sessionCheckFailed ? 'Could not verify this reset link' : 'Reset link expired'}
        </h1>
        <p className="mt-2 text-sm text-white/60">
          {sessionCheckFailed
            ? 'We could not securely verify this recovery session. Request a fresh link and try again.'
            : 'This password reset link is invalid or has expired. Request a fresh one to continue.'}
          {sessionReference ? ` Reference: ${sessionReference}.` : ''}
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
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
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
            minLength={8}
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
