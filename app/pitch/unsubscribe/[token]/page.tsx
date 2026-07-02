'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import AuthLayout from '@/app/(auth)/layout'

// Public page — no auth required, same convention as the other /pitch pages.
export const dynamic = 'force-dynamic'

// ─── /pitch/unsubscribe/[token] ───────────────────────────────────────
// Sets curators.do_not_pitch=true (D-20) — the curator stays in the
// directory, just excluded from future sends. Idempotent, safe to click
// twice.
export default function UnsubscribePage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function unsubscribe() {
    setStatus('loading')
    try {
      const res = await fetch(`/api/pitch/unsubscribe/${token}`, { method: 'POST' })
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
            You won&apos;t receive future pitches from Funūn artists at this address.
            You&apos;ll still appear in the curator directory.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-extrabold text-white">Unsubscribe from pitches?</h1>
            <p className="mt-2 text-sm text-white/70">
              You&apos;ll stop receiving pitch emails from Funūn artists at this address.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={unsubscribe}
                disabled={status === 'loading'}
                className="w-full rounded-lg bg-white px-5 py-3 text-[15px] font-bold text-black transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
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
