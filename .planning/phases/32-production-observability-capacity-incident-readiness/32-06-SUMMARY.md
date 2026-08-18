---
phase: 32-production-observability-capacity-incident-readiness
plan: 06
subsystem: observability
tags: [sentry, error-monitoring, nextjs, instrumentation, pii-scrub, source-maps]

# Dependency graph
requires:
  - phase: 32-02
    provides: "scrubKnownSensitiveKeys (lib/observability/scrub.ts) — the shared beforeSend PII/secret scrubber"
provides:
  - "Env-gated Sentry server + edge + browser error/trace monitoring wired into the Next.js 15 App Router (R5)"
  - "instrumentation.ts register() + onRequestError = Sentry.captureRequestError (automatic server-error capture, no per-route try/catch)"
  - "beforeSend => scrubKnownSensitiveKeys on every runtime — no password/JWT/cookie/auth-header/API-key/Supabase-token/legal-name/contract/signature/royalty value egresses to Sentry"
  - "next.config.mjs withSentryConfig wrap: DSN inlined to the client under a server-named variable (no browser-visible prefix); SENTRY_AUTH_TOKEN build-time-only, never inlined"
  - "__tests__/no-public-monitoring-secret.test.ts — repo-wide grep-gate against any browser-prefixed monitoring secret + the env-gated-no-op/scrub/no-replay behavior assertions"
affects: [deployment, incident-response, "32-10 runbook (correlation-ID ↔ Sentry event)"]

# Tech tracking
tech-stack:
  added: ["@sentry/nextjs ^10.70.0"]
  patterns:
    - "Env-gated no-op SDK init (unset SENTRY_DSN ⇒ zero Sentry.init ⇒ zero data egress) — mirrors lib/email/index.ts's unset⇒no-op"
    - "Monitoring secret named without a browser-visible prefix, inlined via next.config.mjs `env` key (Sentry Vercel-Marketplace default deliberately NOT used)"

key-files:
  created:
    - instrumentation.ts
    - instrumentation-client.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - __tests__/no-public-monitoring-secret.test.ts
  modified:
    - package.json
    - next.config.mjs

key-decisions:
  - "@sentry/nextjs ^10.70.0 approved at the blocking-human legitimacy checkpoint (Task 1) and installed — the SUS flag was a version-recency heuristic; legitimacy signals strong (official getsentry org, 9.28M weekly downloads)."
  - "DSN reaches the browser via next.config.mjs's `env` key under the server-named SENTRY_DSN variable — NOT a NEXT_PUBLIC_ prefix and NOT the Sentry Vercel Marketplace integration (which auto-injects a browser-prefixed DSN the SPEC prohibits). The prohibition is about the variable NAME, not the unavoidable browser delivery of a client SDK's DSN."
  - "tracesSampleRate = 1.0 in preview, ~0.15 in prod (D-02); sendDefaultPii off; NO session-replay integration or sample rate anywhere (D-03)."
  - "Task 3 (live-exception verification) DEFERRED as a tracked owner UAT — owner decision 2026-08-18. It needs a live Sentry project + Vercel env vars + a deploy, none of which exist yet on this branch."

patterns-established:
  - "First monitoring SDK in the repo — env-gated no-op init is the template for any future vendor SDK."
  - "beforeSend delegates to the one shared scrub module at every runtime call site (server/edge/client) rather than re-implementing redaction per config."

requirements-completed: [R5]

coverage:
  - id: D1
    description: "Server + edge + browser Sentry init is env-gated: unset SENTRY_DSN ⇒ Sentry.init is never called (zero data egress); when set, beforeSend delegates to the shared scrub module and no session-replay is configured."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "__tests__/no-public-monitoring-secret.test.ts#sentry.server.config.ts — env-gated no-op init (4 assertions: no-init-when-unset, init-once-when-set, beforeSend===scrub, no replay)"
        status: pass
    human_judgment: false
  - id: D2
    description: "No monitoring DSN/token carries a browser-visible (NEXT_PUBLIC_) prefix anywhere in repo source/env; the manual server-named-DSN inlining is actually wired in next.config.mjs."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "__tests__/no-public-monitoring-secret.test.ts#no browser-prefixed monitoring secret (repo-wide grep + next.config.mjs wiring assertions)"
        status: pass
      - kind: other
        ref: "grep -rn NEXT_PUBLIC_SENTRY --include=*.ts --include=*.tsx --include=*.mjs --include=*.env* (excl node_modules/__tests__/.next) → 0 matches"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live end-to-end verification (Task 3): a real server exception AND a real browser exception land in Sentry with release + source-map resolution and no PII/secrets in the payload, session replay confirmed off."
    requirement: "R5"
    verification:
      - kind: manual_procedural
        ref: "owner: create Sentry org/project → set SENTRY_DSN/AUTH_TOKEN/ORG/PROJECT as server-side Vercel env vars (NOT the Marketplace integration) → deploy → trigger a controlled server + browser exception → confirm both resolve scrubbed with source maps. Tracked: .planning/todos/pending/2026-08-18-sentry-live-exception-verify-post-deploy.md"
        status: unknown
    human_judgment: true
    rationale: "Requires a live Sentry project, real Vercel env vars, and a deployed build — none of which exist on feat/lane1-catalogue-menu-help yet. Owner-deferred 2026-08-18; the code side is complete and cannot self-verify an external SaaS round-trip."

# Metrics
duration: close-out pass (~15 min; Task 1+2 code committed in an earlier session)
completed: 2026-08-18
status: complete
---

# Phase 32 Plan 06: Sentry Error Monitoring (wiring + scrubbing) Summary

**Env-gated, PII-scrubbed `@sentry/nextjs` server + edge + browser monitoring wired into the Next.js 15 App Router with release/source-map correlation and a browser-prefix guard test — code complete and green; the live-exception round-trip is a deferred owner UAT.**

## Performance

- **Duration:** close-out pass (~15 min); Tasks 1–2 code was committed in an earlier session
- **Completed:** 2026-08-18T03:31:00Z
- **Tasks:** 2 of 3 complete (Task 3 deferred as owner UAT)
- **Files:** 5 created, 2 modified

## Accomplishments
- **Task 1 (legitimacy checkpoint) — resolved:** `@sentry/nextjs` verified (official getsentry org, 9.28M weekly downloads) and installed at `^10.70.0`. The SUS flag was a version-recency heuristic only.
- **Task 2 (wiring + scrubbing + guard test) — complete + verified green:**
  - `instrumentation.ts` — `register()` dynamically imports the runtime-specific config; `onRequestError = Sentry.captureRequestError` captures every server route/action/component/middleware error automatically.
  - `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation-client.ts` — env-gated no-op init (unset `SENTRY_DSN` ⇒ no `Sentry.init`), `tracesSampleRate` 1.0 preview / ~0.15 prod (D-02), `sendDefaultPii` off, **`beforeSend` → `scrubKnownSensitiveKeys`** (Plan 02), **no session replay** (D-03).
  - `next.config.mjs` — `withSentryConfig` wrap; DSN inlined to the client via the `env` key under the **server-named** `SENTRY_DSN` (no `NEXT_PUBLIC_` prefix); `SENTRY_AUTH_TOKEN` kept build-time-only, never inlined; `silent: true` so unset-env local/CI builds stay quiet.
  - `__tests__/no-public-monitoring-secret.test.ts` — repo-wide grep-gate + the env-gated-no-op/scrub/no-replay behavior assertions.

## Task Commits

Code was committed atomically in an earlier session (RED → GREEN):

1. **Task 2 (RED): failing test for env-gated Sentry wiring + client-prefix guard** — `0c90d0b` (test)
2. **Task 2 (GREEN): wire env-gated Sentry SDK with scrubbing and client-prefix guard** — `f97dad5` (feat)

_(Task 1 was a human-verify checkpoint — no code commit; its resolution is the `^10.70.0` install in `f97dad5`.)_

## Verification (this close-out pass)
- `npx jest __tests__/no-public-monitoring-secret.test.ts` → **4/4 pass** (0.7s).
- `grep -rn NEXT_PUBLIC_SENTRY` across source/config (excl node_modules/__tests__/.next) → **0 matches**.
- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **succeeds (exit 0)** — the `withSentryConfig` wrap builds end-to-end with the Sentry env unset (no-op source-map upload).
- Read-review confirmed: `beforeSend` delegates to the shared scrub module at all three runtimes; `sendDefaultPii` off; no replay integration/sample rate present.

## Deferred — needs owner (tracked)
**Task 3 — Sentry project setup + live-exception verification** (a `blocking` human-verify checkpoint) is intentionally **not done** and is tracked at
[`.planning/todos/pending/2026-08-18-sentry-live-exception-verify-post-deploy.md`](../../todos/pending/2026-08-18-sentry-live-exception-verify-post-deploy.md).

Exact owner action (also in [32-OWNER-SETUP.md](./32-OWNER-SETUP.md) §3), doable once this branch deploys:
1. Create the Sentry org/project; copy the DSN + create a source-map auth token.
2. In **Vercel** set `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as **server-side** env vars — **not** the Sentry Vercel Marketplace integration (it injects a browser-prefixed DSN; remove it if previously added).
3. Deploy; trigger a controlled **server** exception and a controlled **browser** exception.
4. Confirm **both** appear in Sentry with release + source maps resolved, **no** secret/PII in the payload, and session replay off. Reply with the plan's resume signal to flip coverage D3 → pass.

## Decisions Made
None beyond the plan — the wiring follows 32-RESEARCH.md's CITED patterns exactly. The only owner decision this pass was to **defer Task 3** (no live Sentry project / deploy yet) and close the code side.

## Deviations from Plan
None in the code. Process deviation: the plan was executed **draft-first / code-first** across two sessions — Tasks 1–2 shipped earlier; this pass verified them green and wrote the SUMMARY. Task 3 remains a tracked owner UAT rather than a completed checkpoint.

## Issues Encountered
None. All four automated gates (jest, grep, tsc, build) pass on the committed code as-is.

## User Setup Required
**Yes — one deferred owner item** (Task 3, above). Until it's done, Sentry is a safe env-gated **no-op** in every environment: shipping the code changes nothing at runtime until `SENTRY_DSN` is set. See [32-OWNER-SETUP.md](./32-OWNER-SETUP.md) §3.

## Next Phase Readiness
- Code-side R5 monitoring is complete and green; the correlation-ID ↔ Sentry-event link is available for the 32-10 runbook.
- **Phase 32 is NOT complete:** 32-09 (k6 capacity harness — owner load run pending) and 32-10 (incident runbook — owner tabletop pending) remain owner-gated drafts.
- 32-06's own live-exception UAT (D3) is on the books for deploy time.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Plan: 32-06*
*Completed (code): 2026-08-18 — Task 3 live-verify deferred as tracked owner UAT*

## Self-Check: PASSED
- FOUND: instrumentation.ts, instrumentation-client.ts, sentry.server.config.ts, sentry.edge.config.ts, __tests__/no-public-monitoring-secret.test.ts, next.config.mjs (withSentryConfig), package.json (@sentry/nextjs ^10.70.0)
- CONFIRMED: jest 4/4, grep-guard 0 matches, tsc exit 0, npm run build exit 0
- DEFERRED (tracked): Task 3 live-exception verify → 2026-08-18-sentry-live-exception-verify-post-deploy.md (coverage D3, human_judgment)
