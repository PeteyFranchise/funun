'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import AuthLayout from '@/app/(auth)/layout'

// Public page — no auth required. /pitch is intentionally absent from
// middleware.ts's isProtected list, same convention as /approve, /join, and
// /curators/claim elsewhere in this codebase. A client component page (not
// a server component) because the accept/already-responded/error copy can
// only be resolved once the POST lands — useParams() reads the dynamic
// [token] segment client-side without needing React 19's use() (this
// project is pinned to React 18.3).
export const dynamic = 'force-dynamic'

// ─── /pitch/accept/[token] ────────────────────────────────────────────
// Curator response entry point (PITCH-06). Bare-click confirmation (D-11) —
// a single focusable, keyboard-activatable button, no form.
export default function AcceptPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'expired' | 'error'>('idle')

  async function accept() {
    setStatus('loading')
    try {
      const res = await fetch(`/api/pitch/accept/${token}`, { method: 'POST' })
      if (res.status === 410) {
        setStatus('expired')
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-[18px] border border-white/10 bg-card p-6 text-center">
        {status === 'done' ? (
          <p className="text-sm text-white/70">
            You&apos;ve accepted this pitch — the artist has been notified.
          </p>
        ) : status === 'expired' ? (
          <p className="text-sm text-white/50">This pitch was already responded to.</p>
        ) : (
          <>
            <h1 className="text-lg font-extrabold text-white">Accept this pitch?</h1>
            <p className="mt-2 text-sm text-white/70">
              Let the artist know you&apos;re interested in featuring this track.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={accept}
                disabled={status === 'loading'}
                className="w-full rounded-lg bg-grad px-5 py-3 text-[15px] font-bold text-white shadow-cta transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Accepting…' : 'Accept pitch'}
              </button>
            </div>
            {status === 'error' && (
              <p className="mt-3 text-center text-xs text-rose-300">
                Something went wrong — please try again.
              </p>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  )
}
