'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// ─── Admin segment error boundary ──────────────────────────────────────────
// Without this file, a crash in any /admin/* page bubbles to global-error.tsx,
// which REPLACES the whole app with a blank "Something went wrong" screen —
// the sidebar and every other (working) admin page disappear with it. This
// boundary renders INSIDE (admin)/layout.tsx, so the nav persists and staff
// can navigate away from a single broken page instead of being locked out of
// the console.
//
// It also captures to Sentry (env-gated no-op until SENTRY_DSN is set, same as
// global-error.tsx) and surfaces error.digest on-screen — in production the
// error message is stripped before it reaches the client, so the digest is the
// only handle for correlating a crash with its full Sentry / Vercel log entry.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-9 py-[30px] text-center">
      <p className="text-lg font-bold text-[color:var(--ink)]">Something went wrong on this page</p>
      <p className="mt-2 max-w-md text-[13px] text-[color:var(--ink-3)]">
        This page hit an unexpected error. The rest of the console still works — use the
        sidebar to keep going, or try again.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-[color:var(--ink-3)]">Error ref: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-lg border border-[color:var(--border-2)] bg-[color:var(--panel)] px-4 py-2 text-[13px] text-[color:var(--ink)] transition hover:bg-[color:var(--panel-2)]"
      >
        Try again
      </button>
    </div>
  )
}
