'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// ─── Global error boundary (R5 / audit #16) ──────────────────────────────
// A render failure in the ROOT layout bypasses every nested error boundary
// AND Next's instrumentation onRequestError hook, so without this file such
// crashes never reach Sentry. Next.js App Router routes them here instead —
// this is the only place a top-level React render failure can be captured.
//
// global-error.tsx REPLACES the root layout when it renders, so it must
// supply its own <html>/<body>, and it cannot rely on the app's Tailwind/CSS
// being present — hence inline styles, which always render even mid-crash.
// Env-gated Sentry (Plan 32-06) means captureException is a safe no-op when
// SENTRY_DSN is unset, so this adds zero behavior until Sentry is live.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          background: '#0a0a0f',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <p style={{ fontSize: '1.25rem', fontWeight: 800 }}>Something went wrong</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', opacity: 0.6 }}>
          An unexpected error occurred. Please refresh the page or try again shortly.
        </p>
      </body>
    </html>
  )
}
