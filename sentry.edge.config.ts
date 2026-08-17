// ─── Sentry edge-runtime SDK init (R5, D-01) ───────────────────────────
// Loaded from instrumentation.ts's register() when NEXT_RUNTIME === 'edge'
// (docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup, CITED —
// 32-RESEARCH.md Pattern 1). Mirrors sentry.server.config.ts's env-gated
// no-op, sampling, and scrubbing behavior — the edge runtime uses the same
// @sentry/nextjs Sentry.init entry point, auto-resolved to the edge build
// by the package's own runtime detection. scrubKnownSensitiveKeys is a
// pure, I/O-free module (lib/observability/scrub.ts), so it is safe to run
// under the edge runtime's restricted API surface.
import * as Sentry from '@sentry/nextjs'
import { scrubKnownSensitiveKeys } from '@/lib/observability/scrub'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // D-02: 100% traces in preview, ~15% in prod.
    tracesSampleRate: process.env.VERCEL_ENV === 'preview' ? 1.0 : 0.15,
    // sendDefaultPii stays false/unset — all scrubbing happens via
    // beforeSend, not Sentry's own PII capture (32-RESEARCH.md Anti-Patterns).
    sendDefaultPii: false,
    // beforeSend => lib/observability/scrub.ts (Plan 02) — same scrub
    // module as sentry.server.config.ts, one shared call site's logic.
    beforeSend(event) {
      return scrubKnownSensitiveKeys(event as unknown as Record<string, unknown>) as unknown as typeof event
    },
    // No replaysSessionSampleRate / replaysOnErrorSampleRate / replay
    // integration configured — session replay OFF by default (D-03).
  })
}
