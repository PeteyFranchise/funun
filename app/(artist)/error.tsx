'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// ─── Artist segment error boundary ─────────────────────────────────────────
// Mirrors app/(admin)/error.tsx, which existed while the artist side had
// nothing. Without this file a crash on ANY artist page bubbles to
// global-error.tsx, and global-error REPLACES the whole document — sidebar,
// every working page, the way out, all gone. Staff got a graceful failure;
// artists got a black screen whose only escape was the back button. An artist
// hit exactly that on /messages (2026-08-26) and there was no way to tell what
// had happened.
//
// This boundary renders INSIDE (artist)/layout.tsx, so the nav survives and
// one broken page does not lock someone out of their own vault.
//
// error.digest is shown on purpose. React strips the real error message before
// it reaches the browser in production, so the digest is the ONLY handle for
// correlating what a person saw with the full Sentry / Vercel log entry.
// Without it on screen, diagnosing a report means guessing — which is what the
// /messages crash cost. It is a random-looking hash, not sensitive, and safe to
// paste into a bug report.
//
// TWO recovery buttons, and the split is deliberate:
//   - reset() re-renders the segment. It fixes a transient failure — a query
//     that timed out, a race on first paint.
//   - A hard reload fetches the CURRENT build. It is the fix for the failure
//     reset() CANNOT touch: a tab left open across a deploy, whose client
//     router then asks for JS chunks that no longer exist. reset() re-runs the
//     same doomed fetch; only a reload gets the new build. This is the leading
//     explanation for the /messages report, so offering reset() alone would
//     have shipped a "Try again" button that could never work.
//
// Sentry capture is env-gated (no-op until SENTRY_DSN is set), same as
// global-error.tsx — this adds no behavior until Sentry is live.
export default function ArtistError({
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
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-lg font-semibold text-white">This page didn&apos;t load</p>
      <p className="mt-2 max-w-md text-sm text-white/50">
        Something went wrong here. The rest of Funūn still works — use the menu to keep
        going, or try one of these.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
        >
          Reload the page
        </button>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-white/30">
          Error ref: {error.digest}
        </p>
      )}
      <p className="mt-1 max-w-md text-[11px] text-white/25">
        If it keeps happening, send us that error ref with{' '}
        <span className="text-white/40">Report a problem</span> in the menu — it tells us
        exactly what broke.
      </p>
    </div>
  )
}
