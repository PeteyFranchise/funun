// ─── Sentry server SDK init (R5, D-01) ─────────────────────────────────
// Loaded from instrumentation.ts's register() when NEXT_RUNTIME === 'nodejs'
// (docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup, CITED —
// 32-RESEARCH.md Pattern 1). Env-gated no-op: unset SENTRY_DSN => zero
// Sentry.init call, zero data egress — the per-integration off-switch the
// SPEC's disablement constraint requires, mirroring lib/email/index.ts's
// unset ⇒ no-op philosophy rather than lib/email's throw-on-missing-config.
import * as Sentry from '@sentry/nextjs'
import { scrubKnownSensitiveKeys } from '@/lib/observability/scrub'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // D-02: 100% traces in preview, ~15% in prod (the sampled band's
    // discretion point — 15% is Claude's discretion within D-02's "~15%").
    tracesSampleRate: process.env.VERCEL_ENV === 'preview' ? 1.0 : 0.15,
    // sendDefaultPii stays false/unset — the opposite of R5's scrubbing
    // requirement (32-RESEARCH.md Anti-Patterns). All scrubbing happens via
    // beforeSend below, not via Sentry's own PII capture.
    sendDefaultPii: false,
    // beforeSend => lib/observability/scrub.ts (Plan 02) — one scrub
    // module, this call site. Strips cookies/headers/query_string and
    // redacts any key matching SENSITIVE_KEY_PATTERNS (passwords, JWTs,
    // auth headers, API keys, Supabase tokens, legal names, contracts,
    // signatures, royalties) before the event leaves the process.
    beforeSend(event) {
      return scrubKnownSensitiveKeys(event as unknown as Record<string, unknown>) as unknown as typeof event
    },
    // No replaysSessionSampleRate / replaysOnErrorSampleRate / replay
    // integration configured anywhere in this file — session replay is
    // OFF by default (D-03); enabling it is a separate, deferred privacy
    // decision, not a Phase 32 deliverable.
  })
}
