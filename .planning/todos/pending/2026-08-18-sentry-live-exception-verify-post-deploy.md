---
created: 2026-08-18T03:31:00Z
title: Sentry live-exception verify (Phase 32-06 Task 3) — deferred to deploy time
area: ops
resolves_phase: "32"
files:
  - sentry.server.config.ts
  - instrumentation-client.ts
  - next.config.mjs
  - .planning/phases/32-production-observability-capacity-incident-readiness/32-06-SUMMARY.md
---

## Status (2026-08-18)

32-06's Sentry wiring is **code-complete + green** (jest 4/4, tsc + build clean) and merged as a
safe **env-gated no-op** — with `SENTRY_DSN` unset, `Sentry.init` never runs and nothing egresses,
so shipping it changes nothing at runtime. What's left is the plan's **blocking human-verify
checkpoint (Task 3)**: prove the real round-trip once a live Sentry project + Vercel env vars + a
deploy exist. Owner decision 2026-08-18: close the code, defer the live check. This is coverage
**D3** (`human_judgment: true`) in `32-06-SUMMARY.md`.

## Why deferred (not blocked-on-code)
No live Sentry org/project or Vercel env vars exist yet, and `feat/lane1-catalogue-menu-help` isn't
deployed. The check is an external SaaS round-trip the code cannot self-verify. Same deploy gate as
the Better Stack `/api/health` monitor follow-up (32-07).

## Resume here (post-deploy, ~10 min) — from 32-OWNER-SETUP.md §3
1. Create the Sentry org/project; copy the DSN + create a source-map auth token.
2. In **Vercel** set server-side env vars `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
   `SENTRY_PROJECT`. Do **NOT** install the Sentry Vercel Marketplace integration (it auto-injects a
   browser-prefixed DSN the SPEC forbids); if it was added before, remove that variable.
3. Deploy; trigger a controlled **server** exception and a controlled **browser** exception.
4. Confirm **both** land in Sentry with **release + source maps resolved**, **no PII/secrets** in the
   payload, and **session replay off**.
5. Reply with the plan's resume signal — "server + browser exceptions resolved in Sentry with source
   maps, no PII" — and I'll flip coverage **D3 → pass** in `32-06-SUMMARY.md`.

## Note
This does not gate Phase 32 closure by itself — 32-09 (k6 load run) and 32-10 (runbook tabletop) are
the other two owner-gated items still open. All three are surfaced by `/gsd-verify-work 32` when the
phase reaches verification.
