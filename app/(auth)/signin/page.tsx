'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import {
  accountWorkspaceForUser,
  accountWorkspaceHome,
  accountWorkspaceLabel,
  type AccountWorkspace,
} from '@/lib/auth/session-identity'

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const switchToRaw = searchParams.get('switchTo')
  const switchTo: AccountWorkspace | null =
    switchToRaw === 'personal' || switchToRaw === 'team' ? switchToRaw : null
  const accountChanged = searchParams.get('accountChanged') === '1'
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }

    if (switchTo && accountWorkspaceForUser(data.user) !== switchTo) {
      await supabase.auth.signOut({ scope: 'local' })
      setError(
        switchTo === 'team'
          ? 'That login is not a Funūn Team account. Sign in with your Team Member credentials.'
          : 'That login is a Funūn Team account. Sign in with your personal Member credentials.'
      )
      setSubmitting(false)
      return
    }

    // Role-aware landing (25-11): staff → admin surface, others → vault; an
    // explicit same-origin ?next= deep link wins. postSignInPath guards against
    // off-site open redirects the prior raw router.push(next) allowed.
    router.push(
      switchTo
        ? accountWorkspaceHome(switchTo)
        : postSignInPath({ user: data.user, next })
    )
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold text-white">
        {switchTo ? `Switch to ${accountWorkspaceLabel(switchTo)}` : 'Welcome back'}
      </h1>
      <p className="mt-1 text-sm text-white/50">
        {switchTo
          ? `Sign in with your ${switchTo === 'team' ? 'Funūn Team Member' : 'personal Member'} credentials.`
          : 'Sign in to your vault.'}
      </p>

      {accountChanged && (
        <p className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-sm leading-5 text-amber-100">
          Your browser session changed in another tab. Sign in to the account you want to use here.
        </p>
      )}

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
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-white/80">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-white/50 hover:text-white hover:underline">
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        New here?{' '}
        <Link href="/signup" className="text-white hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
