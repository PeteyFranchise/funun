'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'
import { authCopyWithReference, validAuthCorrelationId } from '@/lib/auth/diagnostics'
import {
  AUTH_CTA,
  AUTH_ERROR_PANEL,
  AUTH_FOOT,
  AUTH_FOOT_LINK,
  AUTH_H1,
  AUTH_INLINE_LINK,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_SUB,
} from '@/app/(auth)/auth-ui'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(() => {
    if (searchParams.get('error') !== 'recovery') return null
    const copy = 'That reset link is invalid or has expired. Request a new link and try again.'
    const reference = validAuthCorrelationId(searchParams.get('ref'))
    return reference ? authCopyWithReference(copy, reference) : copy
  })
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    // Base URL comes from env in production (stable across preview/prod) and
    // falls back to the current origin for local dev. The recovery link routes
    // through /auth/callback, which exchanges the code for a session and then
    // forwards to /update-password.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${baseUrl}/auth/callback?next=/update-password`,
        }
      )

      if (recoveryError) {
        setError(reportBrowserAuthFailure(
          {
            eventCode: 'recovery_request_failed',
            surface: 'forgot_password',
            workspaceIntent: null,
          },
          publicAuthError('password-recovery', recoveryError)
        ))
        return
      }

      // Do NOT reveal whether the email is registered — Supabase returns the
      // same successful result and this page keeps the confirmation neutral.
      setSent(true)
    } catch {
      setError(reportBrowserAuthFailure(
        {
          eventCode: 'recovery_request_failed',
          surface: 'forgot_password',
          workspaceIntent: null,
        },
        publicAuthError('password-recovery', null)
      ))
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <h1 className={AUTH_H1}>Check your email</h1>
        <p className={AUTH_SUB}>
          If an account exists for <span className="text-white">{email}</span>, we&apos;ve sent a
          reset link. Click it to choose a new password.
        </p>
        <Link href="/signin" className={`mt-6 inline-block ${AUTH_INLINE_LINK}`}>
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      <h1 className={AUTH_H1}>Reset your password</h1>
      <p className={AUTH_SUB}>
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className={AUTH_LABEL}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={AUTH_INPUT}
          />
        </div>

        {error && <p className={AUTH_ERROR_PANEL}>{error}</p>}

        <button type="submit" disabled={submitting} className={AUTH_CTA}>
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className={AUTH_FOOT}>
        Remembered it?{' '}
        <Link href="/signin" className={AUTH_FOOT_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  )
}
