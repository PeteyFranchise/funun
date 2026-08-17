// ─── Sentry browser SDK init (R5, D-01) ────────────────────────────────
// Next.js 15's client-side instrumentation hook (docs.sentry.io/platforms/
// javascript/guides/nextjs/manual-setup, CITED). Env-gated no-op: unset
// SENTRY_DSN => zero Sentry.init call in the browser, zero data egress.
//
// process.env.SENTRY_DSN is NOT a NEXT_PUBLIC_-prefixed name, so Next.js
// does not auto-inline it into the client bundle by convention alone —
// next.config.mjs's `env` key explicitly inlines this exact server-named
// variable at build time instead (32-RESEARCH.md Pattern 3). This is the
// deliberate workaround for the Sentry Vercel Marketplace integration's
// default of auto-injecting a browser-visible-prefixed DSN variable,
// which would violate the SPEC's "no monitoring secret carries a
// browser-visible prefix"
// prohibition (32-SPEC.md R5). The DSN still ships in the browser JS
// either way (unavoidable for a client SDK) — the prohibition is about
// the variable NAME, not achievable secrecy of a browser-delivered value.
import * as Sentry from '@sentry/nextjs'
import { scrubKnownSensitiveKeys } from '@/lib/observability/scrub'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // D-02: 100% traces in preview, ~15% in prod. VERCEL_ENV is not
    // NEXT_PUBLIC_-prefixed and Next.js does not auto-inline it to the
    // client, so it is explicitly listed in next.config.mjs's `env` key
    // alongside SENTRY_DSN (same inlining mechanism, no new NEXT_PUBLIC_
    // name introduced).
    tracesSampleRate: process.env.VERCEL_ENV === 'preview' ? 1.0 : 0.15,
    // sendDefaultPii stays false/unset — scrubbing happens via beforeSend.
    sendDefaultPii: false,
    // beforeSend => lib/observability/scrub.ts (Plan 02) — same scrub
    // module as the server/edge configs, one shared call site's logic.
    beforeSend(event) {
      return scrubKnownSensitiveKeys(event as unknown as Record<string, unknown>) as unknown as typeof event
    },
    // No replaysSessionSampleRate / replaysOnErrorSampleRate / replay
    // integration configured — session replay OFF by default (D-03).
  })
}

// Required export for Next.js App Router client-side navigation
// instrumentation (docs.sentry.io CITED) — a no-op function reference
// when Sentry was never initialized above.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
