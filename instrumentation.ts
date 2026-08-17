// ─── Next.js instrumentation entry point (R5, D-01) ────────────────────
// The only supported wiring point for App Router server-error capture
// (requires @sentry/nextjs >= 8.28.0; this repo's resolved ^10.70.0
// satisfies that). Source: docs.sentry.io/platforms/javascript/guides/
// nextjs/manual-setup (CITED — 32-RESEARCH.md Pattern 1). Dynamically
// imports the runtime-specific config file so sentry.server.config.ts
// (Node runtime) and sentry.edge.config.ts (Edge runtime) each stay
// env-gated no-ops independently — importing here does not itself call
// Sentry.init; that only happens inside the imported config file when
// SENTRY_DSN is set.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures every server-side route handler / server action / server
// component / middleware error automatically, with no per-route
// try/catch required. A no-op when Sentry was never initialized (unset
// SENTRY_DSN), matching the env-gated no-op contract above.
export const onRequestError = Sentry.captureRequestError
