'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthEvent, reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'
import {
  AUTH_CTA,
  AUTH_ERROR_PANEL,
  AUTH_H1,
  AUTH_INLINE_LINK,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_SUB,
} from '@/app/(auth)/auth-ui'

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
      <div className="text-center">
        <h1 className={AUTH_H1}>Password updated</h1>
        <p className={AUTH_SUB}>
          You&apos;re all set. Taking you in…
        </p>
        <Link href="/signin" className={`mt-6 inline-block ${AUTH_INLINE_LINK}`}>
          Or sign in manually
        </Link>
      </div>
    )
  }

  // Recovery link expired or opened without a recovery session.
  if (hasSession === false) {
    return (
      <div className="text-center">
        <h1 className={AUTH_H1}>
          {sessionCheckFailed ? 'Could not verify this reset link' : 'Reset link expired'}
        </h1>
        <p className={AUTH_SUB}>
          {sessionCheckFailed
            ? 'We could not securely verify this recovery session. Request a fresh link and try again.'
            : 'This password reset link is invalid or has expired. Request a fresh one to continue.'}
          {sessionReference ? ` Reference: ${sessionReference}.` : ''}
        </p>
        <Link
          href="/forgot-password"
          className={`mt-6 inline-block ${AUTH_INLINE_LINK}`}
        >
          Request a new reset link
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className={AUTH_H1}>Set a new password</h1>
      <p className={AUTH_SUB}>Choose a password for your account.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className={AUTH_LABEL}>
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
            className={AUTH_INPUT}
          />
        </div>
        <div>
          <label htmlFor="confirm" className={AUTH_LABEL}>
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
            className={AUTH_INPUT}
          />
        </div>

        {error && <p className={AUTH_ERROR_PANEL}>{error}</p>}

        <button type="submit" disabled={submitting || hasSession === null} className={AUTH_CTA}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  )
}
