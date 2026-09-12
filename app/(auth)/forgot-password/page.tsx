'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'
import { authCopyWithReference, validAuthCorrelationId } from '@/lib/auth/diagnostics'

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30'

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
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Check your email</h1>
        <p className="mt-2 text-sm text-white/60">
          If an account exists for <span className="text-white">{email}</span>, we&apos;ve sent a
          reset link. Click it to choose a new password.
        </p>
        <Link href="/signin" className="mt-6 inline-block text-sm text-white hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold text-white">Reset your password</h1>
      <p className="mt-1 text-sm text-white/50">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white/80">
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
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        Remembered it?{' '}
        <Link href="/signin" className="text-white hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  )
}
