'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FirstSignInWelcome as WelcomeModel } from '@/lib/onboarding/first-sign-in'

export function FirstSignInWelcome({ welcome }: { welcome: WelcomeModel }) {
  const router = useRouter()
  const [busyHref, setBusyHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function completeAndGo(href: string) {
    if (busyHref) return
    setBusyHref(href)
    setError(null)

    try {
      const response = await fetch('/api/onboarding/complete', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Could not finish setup. Please try again.')
        setBusyHref(null)
        return
      }

      router.push(href)
      router.refresh()
    } catch {
      setError('Could not finish setup. Check your connection and try again.')
      setBusyHref(null)
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-card border border-hair bg-card" aria-labelledby="first-sign-in-title">
      <div className={`grid gap-6 px-6 py-6 ${welcome.sharedWork ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]' : ''}`}>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-lav">
            {welcome.eyebrow}
          </p>
          <h2 id="first-sign-in-title" className="mt-2 text-[23px] font-extrabold tracking-[-.01em] text-white">
            {welcome.title}
          </h2>
          <p className="mt-2 max-w-[650px] text-[14px] leading-6 text-lavdim">{welcome.body}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busyHref !== null}
              onClick={() => completeAndGo(welcome.primary.href)}
              className="rounded-[10px] bg-white px-5 py-3 text-[13.5px] font-bold text-ink transition hover:bg-white/90 disabled:opacity-50"
            >
              {busyHref === welcome.primary.href ? 'Opening…' : welcome.primary.label}
            </button>
            {welcome.secondary && (
              <button
                type="button"
                disabled={busyHref !== null}
                onClick={() => completeAndGo(welcome.secondary!.href)}
                className="rounded-[10px] border border-hairstrong px-4 py-3 text-[13px] font-bold text-lav transition hover:text-white disabled:opacity-50"
              >
                {busyHref === welcome.secondary.href ? 'Opening…' : welcome.secondary.label}
              </button>
            )}
            <button
              type="button"
              disabled={busyHref !== null}
              onClick={() => completeAndGo('/vault')}
              className="px-2 py-3 text-[13px] font-semibold text-lavdim transition hover:text-white disabled:opacity-50"
            >
              Enter my vault
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-rose-300">
              {error}
            </p>
          )}
        </div>

        {welcome.sharedWork && (
          <div className="flex items-center gap-3 border-t border-hair pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lav/[.12] text-lg text-lav" aria-hidden="true">
              ♪
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-lavdim">Shared with you</p>
              <p className="mt-1 truncate text-[14px] font-bold text-white">{welcome.sharedWork.title}</p>
              <p className="mt-0.5 text-[12px] text-lavdim">Writer&apos;s Room</p>
            </div>
            <button
              type="button"
              disabled={busyHref !== null}
              onClick={() => completeAndGo(welcome.sharedWork!.href)}
              className="shrink-0 rounded-[9px] border border-hairstrong px-3 py-2 text-[12px] font-bold text-lav transition hover:text-white disabled:opacity-50"
            >
              {busyHref === welcome.sharedWork.href ? 'Opening…' : 'Open song'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
