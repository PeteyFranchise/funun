'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import {
  accountWorkspaceForUser,
  accountWorkspaceHome,
  accountWorkspaceLabel,
  beginAccountSwitch,
  clearTabIdentity,
  type AccountWorkspace,
} from '@/lib/auth/session-identity'
import { callbackErrorMessage, publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'
import { authCopyWithReference, validAuthCorrelationId } from '@/lib/auth/diagnostics'
import {
  AUTH_CTA,
  AUTH_ERROR_PANEL,
  AUTH_FOOT,
  AUTH_FOOT_LINK,
  AUTH_H1,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_SUB,
} from '@/app/(auth)/auth-ui'

function SignInForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const inviteToken = searchParams.get('invite')
  const switchToRaw = searchParams.get('switchTo')
  const switchTo: AccountWorkspace | null =
    switchToRaw === 'personal' || switchToRaw === 'team' ? switchToRaw : null
  const supabase = createClient()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(() => {
    const copy = callbackErrorMessage(searchParams.get('error'))
    const reference = validAuthCorrelationId(searchParams.get('ref'))
    return copy && reference ? authCopyWithReference(copy, reference) : copy
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    let hasNewSession = false

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError || !data.user) {
        setError(reportBrowserAuthFailure(
          {
            eventCode: 'sign_in_failed',
            surface: 'signin',
            workspaceIntent: switchTo,
          },
          publicAuthError('sign-in', signInError)
        ))
        return
      }
      hasNewSession = true

      const signedInContext = accountWorkspaceForUser(data.user)
      if (switchTo && signedInContext !== switchTo) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (!signOutError) {
          clearTabIdentity()
          hasNewSession = false
        }
        setError(reportBrowserAuthFailure(
          {
            eventCode: 'sign_in_failed',
            surface: 'signin',
            workspaceIntent: switchTo,
          },
          switchTo === 'team'
            ? 'That login is not a Funūn Team account. Sign in with your Team Member credentials.'
            : 'That login is a Funūn Team account. Sign in with your personal Member credentials.'
        ))
        return
      }

      if (inviteToken) {
        const claimResponse = await fetch('/api/claim-collaborators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteToken }),
        })
        if (!claimResponse.ok) {
          const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
          if (!signOutError) {
            clearTabIdentity()
            hasNewSession = false
          }
          setError(reportBrowserAuthFailure(
            {
              eventCode: 'invitation_claim_failed',
              surface: 'signin',
              workspaceIntent: switchTo,
            },
            'This invitation could not be completed. Ask the sender for a new invite and try again.'
          ))
          return
        }
      }

      // Never persist identity returned by signInWithPassword. The destination
      // layout writes its own server-validated marker. A fresh, non-identifying
      // intent allows an explicit account switch; ordinary sign-in clears any
      // stale marker before the hard navigation.
      if (switchTo) beginAccountSwitch(switchTo)
      else clearTabIdentity()

      // Role-aware landing (25-11): staff → admin surface, others → vault; an
      // explicit same-origin ?next= deep link wins. postSignInPath guards against
      // off-site open redirects the prior raw router.push(next) allowed.
      // Account credentials can replace an existing browser session. A hard
      // navigation guarantees the next server-rendered layout reads the newly
      // written auth cookie instead of retaining state from the prior workspace.
      window.location.assign(
        switchTo
          ? accountWorkspaceHome(switchTo)
          : postSignInPath({ user: data.user, next })
      )
    } catch {
      if (hasNewSession) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (!signOutError) clearTabIdentity()
      }
      setError(reportBrowserAuthFailure(
        {
          eventCode: 'sign_in_failed',
          surface: 'signin',
          workspaceIntent: switchTo,
        },
        publicAuthError('sign-in', null)
      ))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <h1 className={AUTH_H1}>
        {switchTo ? `Switch to ${accountWorkspaceLabel(switchTo)}` : 'Welcome back'}
      </h1>
      <p className={AUTH_SUB}>
        {switchTo
          ? `Sign in with your ${switchTo === 'team' ? 'Funūn Team Member' : 'personal Member'} credentials.`
          : 'Sign in to your vault.'}
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
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className={AUTH_LABEL}>
              Password
            </label>
            <Link href="/forgot-password" className="text-[11px] text-lavdim hover:text-white hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={AUTH_INPUT}
          />
        </div>

        {error && <p className={AUTH_ERROR_PANEL}>{error}</p>}

        <button type="submit" disabled={submitting} className={AUTH_CTA}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className={AUTH_FOOT}>
        New here?{' '}
        <Link href="/signup" className={AUTH_FOOT_LINK}>
          Create an account
        </Link>
      </p>
    </>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
