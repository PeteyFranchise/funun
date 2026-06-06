'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/30'

export default function SignUpPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }

    setSent(true)
    setSubmitting(false)
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <h1 className="text-xl font-semibold text-white">Check your email</h1>
        <p className="mt-2 text-sm text-white/60">
          We sent a confirmation link to <span className="text-white">{email}</span>. Click it to
          finish setting up your vault.
        </p>
        <Link
          href="/signin"
          className="mt-6 inline-block text-sm text-white hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
      <h1 className="text-xl font-semibold text-white">Create your account</h1>
      <p className="mt-1 text-sm text-white/50">Start building your Sound Vault.</p>

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
          <label htmlFor="password" className="block text-sm font-medium text-white/80">
            Password
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
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        Already have an account?{' '}
        <Link href="/signin" className="text-white hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
