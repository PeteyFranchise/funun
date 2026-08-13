# Phase 32: Production Observability, Capacity & Incident Readiness - Research

**Researched:** 2026-08-13
**Domain:** Application/infra observability (Sentry), external uptime (Better Stack), platform alerting (Vercel + Supabase), load testing (k6), incident process
**Confidence:** MEDIUM — vendor mechanics are CITED against current official docs; three items (Vercel plan tier, Supabase direct-Postgres usage, Vercel Observability Plus purchase) are explicitly unknown and gated to the owner/dashboard, not guessable from the repo.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Error monitoring (R5)**
- D-01: Vendor = Sentry (server + browser SDK, source maps, release/regression tracking, affected-user counts). Free/Developer tier to start.
- D-02: Sampling = 100% of errors · ~15% performance traces in prod · 100% traces in preview.
- D-03: Session replay = OFF (locked from SPEC; enabling is the deferred separate privacy decision).
- D-04: Retention = Sentry default (30 days on free tier). Monitoring-data access = founder-only for now.

**External uptime monitoring (R3)**
- D-05: Provider = Better Stack. Start on the free 3-min tier — a documented, deliberate relaxation of the SPEC's 1–2 min target to 3 min; upgrade to the 1-min paid tier (~$25/mo) before a major launch/invite batch. Alert after 2–3 consecutive failures. Enable the public status page (buyer-facing bonus, e.g. status.funun.studio).

**Vercel alerts & spend (R1)**
- D-06: Skip Vercel Observability Plus initially — built-in usage/spend alerts + Sentry cover R1; revisit only if anomaly detection is wanted.
- D-07: Spend auto-pause = NEVER (alerts-only) — locked safe default; changing it is a separate owner decision.
- D-08: Alert destination = email to pete@funun.studio now; Slack fan-out added later once the workspace exists. Alert destinations MUST be extensible — fan-out to multiple sinks + a growable recipient list (add company people as the team grows), never a hardcoded single sink.
- D-09: Monthly spend heads-up threshold = $100 (Vercel's 50/75/100%-of-plan usage alerts fire regardless).

**Central config layer (cross-cutting — R1/R8/R10) — the "one place to adjust as we grow"**
- D-10: All tunable thresholds (spend + the R8 alert thresholds: CPU, latency, 5xx, connections, disk, etc.), the alert-recipient list, and the incident owners live in ONE owner-editable config surface. In Phase 32 this is a MINIMAL code/config-level layer (a typed config module and/or a small config table) — NO UI. It MUST be forward-compatible so the deferred Observability Admin Dashboard becomes a thin UI over it. Recipients + owners are growable.

**Load & capacity testing (R7)**
- D-11: Load-test target = a Vercel Preview deploy pointed at a SEPARATE staging Supabase project (free tier to start), seeded with representative data — never prod Supabase. No production load test without separate written owner authorization (locked).
- D-12: Harness tool = k6.

**Incident ownership (R8/R9)**
- D-13: Primary incident owner = Pete (pete@funun.studio), founder-led. No dedicated backup yet — single-owner risk noted; additional owners/backups are added later via the D-10 config layer (and the deferred dashboard). SEV routing reads the recipient/owner list from that config.

**Capacity budget (R2/R8/R10)**
- D-14: Supabase compute auto-upgrade pre-authorized up to ~$50/mo (the first compute-tier bump); above that requires explicit owner approval. Figure is tunable in the D-10 config layer.
- D-15: Infra-review trigger = $100/mo total (Vercel + Supabase + monitoring) — same value as the D-09 spend heads-up; crossing it flags a capacity/pricing review.

### Claude's Discretion
Exact Sentry trace-sample percentage within the D-02 band; precise shape of the D-10 config module/table (researcher/planner design it); when to prompt the Better Stack paid-tier upgrade; k6 script structure. All within the decisions above.

### Deferred Ideas (OUT OF SCOPE)
**Observability Admin Dashboard → fast-follow phase.** An in-app management UI in the Team Member/admin console to add/edit alert recipients, incident owners + SEV routing, and adjustable thresholds — a thin UI over Phase 32's D-10 config layer. Split out of Phase 32 (owner decision 2026-08-13) to keep this phase lean. Phase 32 must build the config layer forward-compatible for it. Create via `/gsd-phase` when ready.

Also deferred: purchasing Vercel Observability Plus (D-06); Better Stack 1-min paid upgrade (D-05); a named backup incident owner (D-13); connection-pooling work (only if direct-Postgres traffic is later confirmed).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | Vercel usage/spend/anomaly alerts + owned response, `FUNCTION_THROTTLED` urgent | Vercel Spend Management mechanics (opt-in pause switch), native Usage Anomaly/Error Anomaly gating on Observability Plus (Pro/Enterprise), `FUNCTION_THROTTLED` semantics — see Architecture Patterns / Common Pitfalls |
| R2 | Supabase health/capacity review procedure + Advisor | Supabase Reports/Advisor dashboard structure, native alerting gap (no built-in email alerts on CPU/disk thresholds as of this research) — see Common Pitfalls |
| R3 | External uptime monitor, 4 routes, Better Stack | Better Stack check-interval tiers, multi-location consecutive-failure model, status page setup — see Architecture Patterns |
| R4 | `/api/health` read-only, tested | Existing `app/api/waitlist` rate-limit pattern reused; middleware `/api` exclusion; design contract in Code Examples |
| R5 | Sentry server+browser, PII-scrubbed, source maps, release correlation | `@sentry/nextjs` instrumentation.ts/App Router setup, `beforeSend` scrubbing, source-map upload + Vercel integration, env-gated no-op — see Architecture Patterns / Code Examples / Common Pitfalls |
| R6 | Structured logging + correlation ID | Lightweight correlation-ID convention (no pino/winston), reuse of existing ad-hoc `requestId` naming, tie to Sentry via same ID — see Architecture Patterns |
| R7 | Non-prod k6 load harness, 25→500 ramp, capacity report | k6 `ramping-vus` executor + `thresholds`/`abortOnFail` stop conditions — see Architecture Patterns / Code Examples |
| R8 | Baseline-validated thresholds + SEV-1..4 model | Config-layer shape (D-10) carrying thresholds + SEV routing — see Architecture Patterns |
| R9 | Incident runbook, tabletop-tested, no destructive steps | `docs/BREAK-GLASS.md` reconciliation (reference only, no duplication) — see Architecture Patterns |
| R10 | Daily/weekly/pre-launch/monthly cadence with owners | `vercel.json` cron reuse (Hobby-plan daily-frequency ceiling confirmed) — see Architecture Patterns / Common Pitfalls |
</phase_requirements>

## Summary

Funūn has zero production monitoring today (VERIFIED in SPEC's Background) and is adding it on top of a Next.js 15 App Router / Vercel / Supabase Cloud stack that already has three reusable primitives: a `vercel.json` cron mechanism, an in-repo rate-limit helper (`lib/security/rate-limit.ts`, used by `app/api/waitlist`), and a no-op-safe email sender (`lib/email/index.ts`). This phase is less "build new infrastructure" and more "wire together five hosted/native tools (Sentry, Better Stack, Vercel dashboard alerts, Supabase Reports, k6) with a thin layer of Funūn code (`/api/health`, a correlation-ID convention, and a central config module) and a stack of founder-run documentation (checklists, thresholds table, runbook)."

The single most important thing for the planner: **most of R1/R2/R3's "acceptance" work happens in a vendor dashboard, not in this codebase.** Do not plan API-route or migration tasks for turning on Vercel's built-in Usage/Spend notifications, enabling Better Stack monitors, or reading Supabase's Reports page — those are owner click-through configuration steps, verified by a `checkpoint:human-verify`, and documented as a written procedure/table. The code-writing surface is narrower: `/api/health`, the Sentry SDK wiring (`instrumentation.ts` + 3 config files + `next.config.ts` wrapper), a `lib/observability/config.ts` (or a `platform_config` table) holding thresholds/recipients/owners, a `lib/logging/correlation.ts` helper, and a `scripts/load/*.js` k6 harness that never enters the runtime bundle.

Two vendor-specific pitfalls materially change the plan shape and MUST be surfaced early: (1) Sentry's own official Vercel Marketplace integration auto-injects `NEXT_PUBLIC_SENTRY_DSN` — this literally violates the SPEC's Prohibition ("no monitoring secret carries a `NEXT_PUBLIC_` prefix," which explicitly extends to the DSN in R5's Acceptance Criteria) and must NOT be used as-is; the workaround is a differently-named env var inlined via `next.config.ts`'s `env` key (see Common Pitfalls #1). (2) Vercel's Error/Usage Anomaly alerts, and Spend Management's optional project-pause switch, both require the **Pro** plan (Spend Management explicitly requires Owner/Billing role on a Pro team) — but this repo's own STATE.md records that as of Phase 14 planning (2026-07-06) the project was confirmed on the **Hobby** tier, while the Phase 32 SPEC lists the plan as unverified/NEEDS HUMAN. This is a load-bearing unknown for R1 planning (see Assumptions Log A1) and should gate the very first task of the R1 work with a `checkpoint:human-verify` that confirms the live plan tier before any alert-configuration task is written.

**Primary recommendation:** Sequence this phase mostly by requirement (R4/R6 code first since they're prerequisites for R5's request-correlation acceptance criterion; R1/R2/R3 as owner-checkpoint-heavy vendor-dashboard waves; R7 last since it's dev-only tooling with no runtime coupling; R8/R9/R10 as documentation passes that consume the config layer and the baseline data R7 produces).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Error/exception capture (R5) | Browser + API/Backend | — | Sentry SDK runs in both the browser bundle (`instrumentation-client.ts`) and the Next.js server runtime (`instrumentation.ts` + `sentry.server.config.ts`/`sentry.edge.config.ts`) — genuinely dual-tier by SDK design |
| `/api/health` (R4) | API/Backend | Database/Storage (one cheap read) | Lives entirely in `app/api/health/route.ts`; the "one inexpensive read-only Supabase check" is the only cross-tier touch, under a strict timeout |
| Correlation ID (R6) | API/Backend | Browser (propagation only) | Generated/propagated server-side per request; a browser-originated trace (e.g. a client Sentry event) carries the same ID only if explicitly threaded through, which R6's acceptance criterion requires |
| Central config (thresholds/recipients/owners) (D-10, cross-cutting R1/R8/R10) | API/Backend | Database/Storage (if table-backed) | A typed module read server-side by any alert-fan-out/threshold-check code; if table-backed, Database/Storage becomes primary for the table itself but the read/write API stays server-only (service-role, never client-readable) |
| External uptime checks (R3) | CDN/Static (edge-visible routes) | — | Better Stack polls public URLs from outside Funūn's infrastructure entirely — no Funūn tier executes this capability, it is observed from outside |
| Vercel platform alerts (R1) | Vercel platform (outside app tiers) | — | Configured entirely in the Vercel dashboard; no application code path |
| Supabase health review (R2) | Database/Storage (Supabase platform) | — | Read via Supabase's own dashboard Reports/Advisor; no application code path |
| Load harness (R7) | Dev-only tooling (outside runtime tiers) | API/Backend + Database/Storage (target) | k6 scripts run from a developer machine or CI against a Preview deploy + staging Supabase; the harness itself never ships in the Vercel bundle |
| Incident runbook / operating rhythm (R9/R10) | Documentation (outside code tiers) | API/Backend (R10's cron triggers) | Mostly process documents; R10's "daily automated" piece is a `vercel.json` cron hitting a Funūn route |

## Work Split by Requirement (Vendor Dashboard / Code / Documentation)

This is the load-bearing table for planning task shape. A requirement is not "done" the same way across its rows — plans must not collapse a dashboard-only requirement into a code task, and must not skip the documentation deliverable a vendor dashboard alone cannot produce.

| Req | (a) Vendor dashboard (owner clicks) | (b) Funūn code (executor writes) | (c) Documentation deliverable |
|-----|--------------------------------------|-----------------------------------|-------------------------------|
| R1 | Enable Vercel Usage notifications (50/75/100%); enable Spend Management, set $100 threshold, leave "Pause production deployment" **OFF** (D-07); configure notification destination(s) in Vercel's My Notifications; send a forced test notification | None required for the alert wiring itself. Optional: a webhook receiver if Slack fan-out is wired via Vercel's Spend Management webhook rather than native Slack integration (Claude's discretion) | A written table: Vercel signal → owner → response, with `FUNCTION_THROTTLED` marked urgent (R1/R8 AC) |
| R2 | None — review-only; Supabase Reports/Advisor pages are read, not configured, per this research (no native email-alert config surfaced — see Common Pitfalls #5) | None | A Supabase review checklist: metric, where to read it, warning/critical trigger, and an explicit N/A note for pooler items unless direct-Postgres traffic is confirmed |
| R3 | Create Better Stack account/monitors for the 4 routes at the agreed interval; configure 2–3 consecutive-failure alerting; enable the public status page; verify a forced-failure alert delivers | None required (Better Stack is fully hosted) | A short "why external, not Vercel-internal" note (SPEC requires the SPEC/plan to state this); status page URL recorded |
| R4 | None | `app/api/health/route.ts` + tests (healthy/degraded/timeout/secret-redaction) | The status-code contract documented inline (JSDoc) and referenced by R3's monitor config |
| R5 | Create Sentry project/org; obtain DSN + auth token; **do NOT install the Vercel Marketplace Sentry integration as-is** (injects `NEXT_PUBLIC_SENTRY_DSN`, see Common Pitfalls #1) — set env vars manually instead; verify a controlled server + browser exception appear with source maps resolved | `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.ts` `withSentryConfig` wrapper, `beforeSend`/`beforeSendTransaction` scrubbing hook, env-gated no-op | A scrubbing test asserting no secret/PII value is transmitted; a grep/lint asserting no monitoring DSN/token carries `NEXT_PUBLIC_` |
| R6 | None | `lib/logging/correlation.ts` (ID generation/propagation), call-site adoption replacing ad-hoc `requestId` and stray `console.log` | The "critical workflows requiring durable operational evidence" list |
| R7 | Create a separate staging Supabase project (free tier), seed it; create/target a Vercel Preview deploy | `scripts/load/*.js` k6 scenarios (dev-only, never bundled), a rehearsal script for the abort/stop-condition backstop | The capacity report table (25/50/100/250/500 rows × RPS/p50/p95/p99/4xx/5xx/timeouts/Vercel invocations+throttles/Supabase CPU+mem/DB+pooler connections/slow-query deltas/3rd-party failures/est. cost) |
| R8 | None | The D-10 config module/table itself (thresholds, seeded from the brief's proposed values) | The thresholds table (proposed vs. baseline-adjusted) + the SEV-1..4 table (channel/primary owner/backup owner/ack expectation/escalation/resolution per severity) |
| R9 | None | None (unless a lightweight `docs/RUNBOOK.md` is treated as "docs," which it is) | The incident runbook itself, tabletop-tested, referencing (not duplicating) `docs/BREAK-GLASS.md` |
| R10 | None (cron already exists in `vercel.json`) | A new `vercel.json` cron entry for R10's daily automated checks (reusing the existing pattern) + the route it calls | Weekly/monthly/pre-launch checklists naming an owner; one demonstration monthly report |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@sentry/nextjs` | `^10.70.0` (confirmed via `npm view`, published 2026-08-12) [ASSUMED — package name from training knowledge + WebSearch, registry-confirmed but legitimacy check returned `SUS` on a "too-new" heuristic; see Package Legitimacy Audit] | Server + browser error/perf monitoring, Next.js App Router integration | D-01 locked vendor; official first-party Next.js SDK; 9.28M weekly downloads, `github.com/getsentry/sentry-javascript` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| k6 (standalone binary, NOT an npm package) | latest stable (Grafana k6) [ASSUMED — not verified via registry this session; k6 is distributed as a Go binary via Homebrew/apt/Docker, not npm] | Non-production load harness (D-12) | Dev-only, invoked from a developer machine or CI step; scripts live under `scripts/load/`, never imported by `app/` or `lib/`, never added to `package.json` dependencies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sentry | Bugsnag, Rollbar, Vercel's native Error Anomaly alerts alone | D-01 already locks Sentry; native Vercel alerts alone give no source-map/release/affected-user correlation and require Observability Plus (Pro-plan-gated) |
| Better Stack | Checkly, UptimeRobot | D-05 already locks Better Stack; noted here only because the SPEC left this open before discuss-phase — now closed |
| A typed config module | A `platform_config` Postgres table | Both satisfy D-10's "one owner-editable surface, forward-compatible for a dashboard" requirement; a table is more naturally a "thin UI over it" target for the deferred dashboard (a CRUD UI over rows vs. over a code file requiring redeploy to change); a code module is simpler to ship this phase and needs no migration. Recommend: **table-backed for recipients/owners (data that grows), typed-module-backed (with safe defaults) for thresholds (data that's mostly static and benefits from type-checking)** — a hybrid, not an either/or (Claude's discretion per CONTEXT.md) |
| pino/winston structured logger | A minimal hand-rolled correlation-ID + `console.log`-with-JSON-shape convention | CONTEXT.md explicitly asks to avoid a "heavy pino/winston footprint" at founder scale; Vercel's own docs note correlation between custom logs and its platform view is automatic with no special fields required — a heavy logger library is solving a problem Vercel's log pipeline doesn't have here |

**Installation:**
```bash
npm install @sentry/nextjs
# k6 is NOT an npm install — install as a binary:
# brew install k6          (macOS dev machine)
# or run via the official Docker image / GitHub Action in CI
```

**Version verification:** `npm view @sentry/nextjs version` returned `10.70.0`, last published 2026-08-12 (one day before this research session) — this is a very recent minor/patch release of a long-established package (first published years ago; 9.28M weekly downloads), not a slopsquat risk in substance, but it does trip the package-legitimacy tool's "too-new" heuristic literally (see Package Legitimacy Audit). Re-run `npm view @sentry/nextjs version` at implementation time — Sentry ships frequently and pinning to a caret range (`^10.70.0`) is appropriate.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `@sentry/nextjs` | npm | Long-established package; **latest version published 2026-08-12** (1 day before this research) | 9,286,617/week | `github.com/getsentry/sentry-javascript` (official Sentry/getsentry org) | SUS (reason: `too-new` — this is a version-recency heuristic, not a package-age heuristic; the package itself is mature and matches the official Sentry GitHub org + docs.sentry.io) | Flagged — planner must add `checkpoint:human-verify` before `npm install @sentry/nextjs`, confirming the resolved version/tarball against `docs.sentry.io`/npmjs.com immediately before install |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@sentry/nextjs` — flagged only on a "too-new latest release" heuristic; downloads/repo/org signals are all strongly consistent with the legitimate, official Sentry Next.js SDK. Treat as a routine `checkpoint:human-verify` (confirm version on npmjs.com/docs.sentry.io before install), not as a real slopsquat risk.

*k6 is not npm-installed in this phase (dev-only binary), so it is out of scope for this npm-registry-oriented audit; there is no k6 entry to add to `package.json`.*

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────┐
                     │              Better Stack (external)          │
                     │  polls / /signin /sync/catalog /api/health    │
                     │  every 1-3 min from outside Funūn's infra     │
                     └───────────────┬───────────────────────────────┘
                                      │ HTTP GET (unauthenticated)
                                      ▼
┌──────────────┐   request    ┌──────────────────────────────────────┐
│   Browser     │─────────────▶│  Next.js 15 App Router (Vercel)      │
│  (Sentry      │              │                                        │
│   browser SDK)│◀─────────────│  middleware.ts (matcher excludes /api)│
└──────┬────────┘   response   │        │                               │
       │ captureException          ▼                               │
       │ (correlation ID from       app/api/health/route.ts           │
       │  response header,          - liveness check                  │
       │  if propagated)            - ONE cheap read-only Supabase     │
       ▼                            check, strict timeout              │
┌──────────────┐              │      - healthy/degraded body, no writes│
│ Sentry (SaaS) │◀─────────────│                                        │
│  - errors     │  captureException/   app/api/* route handlers        │
│  - perf traces│  captureRequestError │   - correlation-ID generated   │
│  - source maps│  (server, via         │     or propagated per request │
│  - releases   │   instrumentation.ts) │   - lib/logging/correlation.ts│
└──────┬────────┘              │       │   - structured log line       │
       │ same correlation ID   │       │     (same ID as Sentry event) │
       │ appears in Sentry      │       ▼                               │
       │ event + Vercel log      │  lib/observability/config.ts (D-10) │
       │ line (R6 acceptance)    │   - thresholds (CPU/5xx/p95/...)     │
       ▼                        │   - alert-recipient list (growable)  │
┌──────────────┐               │   - incident owners (primary/backup) │
│ Vercel logs   │               └──────────────┬────────────────────────┘
│ (platform)    │                              │ read-only Supabase check
└───────────────┘                              ▼
                                     ┌──────────────────────┐
                                     │   Supabase Cloud       │
                                     │  (prod project)        │
                                     │  - Reports/Advisor      │
                                     │    (owner-reviewed,     │
                                     │     R2, no app code)    │
                                     └──────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  Vercel dashboard (owner-configured, no app code)                │
│  - Usage notifications (50/75/100%)                              │
│  - Spend Management: $100 threshold, notify-only, pause OFF (D-07)│
│  - FUNCTION_THROTTLED treated as urgent (R1)                     │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  k6 harness (dev machine / CI, NEVER the Vercel runtime bundle)  │
│  scripts/load/*.js  --ramping-vus 25→50→100→250→500              │
│       │                                                            │
│       ▼                                                            │
│  Vercel PREVIEW deploy  ──▶  SEPARATE staging Supabase project   │
│  (never production; D-11)     (free tier, seeded)                │
└───────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
instrumentation.ts                    # Sentry server/edge registration + onRequestError
instrumentation-client.ts             # Sentry browser SDK init
sentry.server.config.ts               # Server SDK config (sampling, beforeSend)
sentry.edge.config.ts                 # Edge runtime SDK config
next.config.ts                        # withSentryConfig() wrapper + env{} for DSN (no NEXT_PUBLIC_)
app/
  api/
    health/
      route.ts                        # R4 — read-only, one cheap Supabase check, strict timeout
      route.test.ts
    cron/
      curator-reach/route.ts          # existing
      daily-observability-check/      # NEW — R10 daily automated checks (uptime/error/spend/throttle digest)
        route.ts
lib/
  observability/
    config.ts                         # D-10 — thresholds + recipients + owners (typed module and/or table reader)
    config.test.ts
    scrub.ts                          # shared PII-scrubbing predicate reused by Sentry beforeSend + R6 logging
    scrub.test.ts
  logging/
    correlation.ts                    # R6 — generate/propagate correlation ID
    correlation.test.ts
    logger.ts                         # thin structured-log wrapper (JSON line, no pino/winston)
scripts/
  load/
    catalogue-browse.js               # k6 scenario — public catalogue browsing
    signin-dashboard.js                # k6 scenario — sign-in + authenticated dashboard
    ...                                 # one file per high-traffic route group found by code inspection
    run-ramp.js                        # orchestrates 25→50→100→250→500, emits capacity report
docs/
  RUNBOOK.md                          # R9 — incident runbook, references BREAK-GLASS.md
  OBSERVABILITY-OPERATING-RHYTHM.md   # R10 — daily/weekly/pre-launch/monthly checklists
  THRESHOLDS-AND-SEVERITY.md          # R8 — thresholds table + SEV-1..4 table
```

### Pattern 1: Sentry Next.js 15 App Router instrumentation (R5)

**What:** `instrumentation.ts` conditionally imports server/edge config based on `NEXT_RUNTIME`, and exports `onRequestError = Sentry.captureRequestError` so every server-side route handler/server action/server component/middleware error is captured automatically without per-route try/catch.

**When to use:** This is the only supported wiring point for App Router server-error capture (requires `@sentry/nextjs >= 8.28.0`; this phase's resolved `10.70.0` satisfies that).

**Example:**
```typescript
// Source: docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup (CITED)
// instrumentation.ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
```

### Pattern 2: Env-gated no-op Sentry init (Prohibition: unset ⇒ no-op, zero data egress)

**What:** Guard `Sentry.init()` behind a presence check on the DSN env var so a missing/unset value produces zero SDK activity — the SPEC's per-integration "off-switch without a redeploy" requirement, satisfied here by simply unsetting the env var in Vercel's project settings (no redeploy needed if using runtime env, though Next.js typically requires a redeploy to pick up new env values — document this honestly rather than overclaiming "no redeploy").

**Example:**
```typescript
// sentry.server.config.ts (pattern synthesized from CITED docs.sentry.io setup + the
// SPEC's own explicit "unset ⇒ no-op" prohibition — the conditional guard is Funūn's
// addition, not shown as a canonical Sentry example, since Sentry.init() itself is a
// no-op-ish call with no DSN but does not fully avoid all data collection unless gated).
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.VERCEL_ENV === 'preview' ? 1.0 : 0.15, // D-02
    // replaysSessionSampleRate intentionally omitted — session replay OFF (D-03)
    beforeSend: scrubSensitiveEvent, // shared with lib/observability/scrub.ts
  })
}
```

### Pattern 3: Non-`NEXT_PUBLIC_` browser DSN (works around the Vercel Marketplace integration default)

**What:** Next.js inlines an env var into the client bundle either via the `NEXT_PUBLIC_` prefix convention OR by explicitly listing it in `next.config.ts`'s `env` key — the second path works with any variable name and is what satisfies the SPEC's literal "no `NEXT_PUBLIC_` prefix on any monitoring secret/DSN" prohibition while still shipping the DSN to the browser (which is unavoidable for a client-side SDK, since the value must exist in the shipped JS either way — the prohibition is about the *name*, not achievable secrecy of a browser-delivered value).

**Example:**
```typescript
// next.config.ts
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = {
  env: {
    SENTRY_DSN: process.env.SENTRY_DSN, // inlined at build time, NOT NEXT_PUBLIC_-prefixed
  },
  outputFileTracingIncludes: {
    'app/api/**/*': ['./assets/fonts/**'], // existing, unrelated — kept for reference
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN, // build-time only, real secret, never inlined
  widenClientFileUpload: true,
})
```

### Pattern 4: PII scrubbing (`beforeSend`)

**What:** A single `beforeSend`/`beforeSendTransaction` hook strips cookies, headers, query strings, and named sensitive fields before an event leaves the process — this is Funūn's actual scrubbing mechanism (Sentry's `sendDefaultPii: true` is the OPPOSITE of what this phase wants and must stay `false`/unset).

**Example:**
```typescript
// Source: docs.sentry.io/platforms/javascript/guides/nextjs/data-management/sensitive-data (CITED)
// pattern extended with Funūn's specific sensitive-field list (SPEC Prohibitions)
function scrubSensitiveEvent(event: Sentry.ErrorEvent) {
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.query_string
  }
  // Funūn-specific: legal names, contract/signature/royalty fields, tokens —
  // scrub by key name across event.extra/event.contexts, Unicode-safe (matches
  // non-ASCII identifiers like "Funūn" — SPEC edge coverage, encoding row).
  return scrubKnownSensitiveKeys(event)
}
```

### Pattern 5: k6 ramping-VUs with abort-on-fail stop conditions (R7)

**What:** A `ramping-vus` executor with staged targets (25→50→100→250→500) paired with `thresholds` that set `abortOnFail: true` so an unsafe run (latency/error/DB-pressure/spend breach) halts mid-ramp rather than completing — this is R7's required "stop condition aborts the run mid-ramp" acceptance criterion.

**Example:**
```javascript
// Source: k6.io/docs/using-k6/scenarios/executors/ramping-vus (CITED)
export const options = {
  scenarios: {
    capacity_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 250 },
        { duration: '2m', target: 500 },
      ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true }],
  },
}
```

### Pattern 6: Correlation ID generation/propagation without a heavy logger (R6)

**What:** Generate a UUID per request (server-side, e.g. in a route handler or a thin wrapper) if none was propagated, attach it to the Sentry scope (`Sentry.setTag('correlation_id', id)` or via `Sentry.captureRequestError`'s context) so the SAME ID appears on both the structured log line and the Sentry event — satisfying R6's core acceptance criterion.

**Example:**
```typescript
// lib/logging/correlation.ts — pattern synthesized (no single canonical source;
// combines the CITED Next.js middleware header-set technique with Sentry's
// per-scope tagging, both individually documented) [CITED: partial — middleware
// technique from a Next.js community discussion, not official docs; treat as
// a reasonable pattern rather than a verified canonical one]
import { randomUUID } from 'crypto'

export function getOrCreateCorrelationId(headers: Headers): string {
  return headers.get('x-correlation-id') ?? randomUUID()
}

export function logWithCorrelation(
  correlationId: string,
  fields: { route: string; status: number; durationMs: number; kind: 'user_error' | 'operational_failure' }
) {
  console.log(JSON.stringify({ correlationId, ts: new Date().toISOString(), ...fields }))
}
```

### Anti-Patterns to Avoid

- **Installing the Sentry-Vercel Marketplace integration as the DSN source:** it names the env var `NEXT_PUBLIC_SENTRY_DSN`, which R5's own Acceptance Criteria explicitly forbids by prefix. Set `SENTRY_DSN`/`SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` manually in Vercel project settings instead, and use `next.config.ts`'s `env` key for the client-bundle inlining (Pattern 3).
- **`sendDefaultPii: true`:** this is the literal opposite of R5's scrubbing requirement — leave it `false`/unset and do all scrubbing via `beforeSend`.
- **A pino/winston-class structured logger:** explicitly out of scope per CONTEXT.md's "founder-scale... without a heavy pino/winston footprint" framing; Vercel's own docs note log-to-platform correlation is automatic without special fields.
- **Treating `/api/health`'s Supabase check as a place for retries/backoff:** the strict-timeout requirement (R4) means a single bounded attempt that returns `degraded` on failure, never a retry loop that could turn a 1–2 minute poll into a DB-amplification vector.
- **Enabling "Pause production deployment" under Vercel Spend Management:** it is a separate, explicitly opt-in toggle from the notification thresholds (confirmed via `vercel.com/docs/spend-management` CITED) — D-07 requires this toggle to stay OFF while still configuring the $100 notification threshold.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Error aggregation, regression detection, affected-user counts | A custom Supabase table of caught exceptions | Sentry (D-01) | Regression/release correlation, source-map-resolved stack traces, and affected-user counts are Sentry's core product; reimplementing even a subset is exactly the "custom monitoring platform" the SPEC's Boundaries explicitly rules out |
| External reachability checking | A Vercel cron that pings `/` and emails on failure | Better Stack (D-05) | A cron running ON Vercel cannot detect a Vercel-wide outage — SPEC explicitly requires "independent" monitoring for this reason; this is not a "don't hand-roll for complexity reasons" case but a "cannot possibly work" case |
| Structured operational logging with correlation | pino/winston + a log-shipping pipeline | A ~30-line `lib/logging/correlation.ts` + `console.log` JSON lines | Vercel's log pipeline already ingests stdout; CONTEXT.md explicitly asks to avoid the heavier footprint at this scale |
| Load-test orchestration/reporting | A bespoke Node script driving `fetch()` in a loop | k6 (D-12) | k6's `ramping-vus` executor + built-in `thresholds`/`abortOnFail`/metrics summary is exactly R7's shape (staged ramp, stop conditions, per-stage metrics table) — reimplementing it loses battle-tested percentile calculation and safe abort semantics |

**Key insight:** every "Don't Hand-Roll" row above maps to a SPEC Boundary line item ("no custom in-house monitoring platform/UI"). The temptation in a founder-scale codebase that already has `lib/email`, a rate-limiter, and a cron mechanism is to build "just one more small thing" — resist it for anything Sentry/Better Stack/k6 already do natively; Funūn code should only fill the narrow gaps (health route, correlation ID, config layer) those tools don't cover.

## Common Pitfalls

### Pitfall 1: Sentry's official Vercel integration injects a `NEXT_PUBLIC_` DSN
**What goes wrong:** The one-click Sentry×Vercel Marketplace integration sets `NEXT_PUBLIC_SENTRY_DSN` automatically (CITED: `blog.sentry.io` integration guide). If a plan task says "install the Vercel-Sentry integration," it will directly violate R5's Prohibition and its grep-based Acceptance Criterion.
**Why it happens:** The integration is designed for the common case, where teams don't care whether the DSN (which Sentry itself designs to be safely public/rate-limited) is prefixed `NEXT_PUBLIC_` — this SPEC's Prohibition is stricter than Sentry's own guidance.
**How to avoid:** Set env vars manually (Pattern 3); skip or uninstall the Marketplace integration's auto-injected var if it's already been added.
**Warning signs:** `grep -r NEXT_PUBLIC_SENTRY .env* next.config.ts` returns a hit.

### Pitfall 2: Vercel plan tier gates R1's most "obvious" features
**What goes wrong:** A plan that assumes Observability Plus, Error Anomaly, or Usage Anomaly alerts are simply "turn on in settings" will silently be undeliverable if the project is still on Hobby (STATE.md's Phase 14 note records Hobby as of 2026-07-06; SPEC.md marks the current tier as unverified).
**Why it happens:** Vercel's docs (CITED) state Spend Management and Observability Plus both require a Pro (or Enterprise) team with Owner/Billing role — Hobby has neither.
**How to avoid:** Gate the first R1 task behind a `checkpoint:human-verify` confirming the live plan tier in the Vercel dashboard before writing any Spend Management / Observability Plus task. D-06 already defers Observability Plus purchase, so this mainly affects whether Spend Management (needed for the D-09 $100 threshold) is reachable at all — if still Hobby, the $100 heads-up may need to be a Funūn-built check instead (e.g., a cron reading Vercel's usage API, if such an API exists at Hobby tier — flagged as an Open Question).
**Warning signs:** "Spend Management" toggle absent/greyed out in Vercel's Billing settings.

### Pitfall 3: `middleware.ts`'s matcher excludes `/api` — `/api/health` runs fully unauthenticated by default
**What goes wrong:** A plan that assumes middleware's auth/session logic protects `/api/health` will ship an endpoint with no rate-limit/timeout discipline, since none of `middleware.ts`'s `isProtected`/`isAuthRoute` logic ever runs for it (VERIFIED — `middleware.ts`'s `config.matcher` is `['/((?!_next/static|_next/image|favicon.ico|api).*)']`, an explicit `/api` exclusion).
**Why it happens:** Every other protected surface in this app relies on middleware; `/api/health` is a deliberate, permanent exception (it must be pollable by Better Stack with no auth) — but that means its own route code is the ENTIRE security boundary.
**How to avoid:** Self-guard inside `route.ts`: one cheap bounded read, strict timeout (e.g. `AbortController` + short ms budget), no writes, minimal response body — reuse `lib/security/rate-limit.ts`'s `createRateLimiter()`/`getClientIp()` pattern (VERIFIED reusable, already used by `app/api/waitlist`) if per-IP rate-limiting is judged necessary at 1–2 min polling volume (likely unnecessary given how infrequent legitimate polling is, but SPEC leaves the door open: "cache/rate-limit/monitor auth applied only where justified").
**Warning signs:** A `/api/health` implementation that calls `supabase.auth.getUser()` or reads any session — that's dead code on this route.

### Pitfall 4: k6 is not an npm package — don't add it to `package.json`
**What goes wrong:** `npm install k6` installs an unrelated/wrong package (there is no official `k6` npm package that IS the load-test binary); a plan task phrased as a normal `npm install` step will fail or install the wrong thing.
**Why it happens:** k6 (Grafana/Loadimpact) ships as a compiled Go binary, distributed via Homebrew/apt/Docker/GitHub Releases — not npm.
**How to avoid:** Document install as `brew install k6` (macOS dev) or a CI step pulling the official Docker image / GitHub Action; scripts live under `scripts/load/` and are invoked via `k6 run scripts/load/run-ramp.js`, never `require()`d by app code — CONTEXT.md's own Integration Points note already flags this ("dev-only tooling; MUST NOT enter the runtime bundle").
**Warning signs:** A `k6` entry appears in `package.json` `dependencies`/`devDependencies`.

### Pitfall 5: Supabase's dashboard Reports/Advisor is read-only observability, not an alerting system
**What goes wrong:** A plan that treats R2 as "configure Supabase alerts for CPU/disk/connections" (implying a settings toggle, analogous to Vercel's) may not find an equivalent native email-alert configuration surface — this research found Supabase's Reports/Query Performance Advisor described as dashboards to be manually reviewed, with programmatic alerting requiring the separate Metrics API piped into an external Prometheus-compatible stack (CITED: `supabase.com/blog/metrics-api-observability`), which is explicitly out of this phase's minimal-footprint scope.
**Why it happens:** Supabase's monitoring story is closer to "here are your dashboards" than "here are your alert rules," at least for the free/Pro tiers this project likely uses.
**How to avoid:** Write R2 as a **documented human review procedure** ("go here weekly, look at X, act if Y") per the CONTEXT.md/SPEC framing, not as a code or dashboard-alert-configuration task. If a native alert-config UI IS found live in the Supabase dashboard at plan/execution time (Supabase ships features quickly), that's a pleasant surprise, not a research-time guarantee — flag this explicitly for the executor to re-check.
**Warning signs:** A task phrased "configure Supabase CPU alert to email pete@funun.studio" with no fallback if the toggle doesn't exist for this project's tier.

### Pitfall 6: Vercel Hobby's cron ceiling is once-per-day, per expression
**What goes wrong:** A plan that schedules an R10 "daily" cron more frequently than once/day (e.g. hourly digest) will fail at `vercel.json` deploy time if the project is still on Hobby.
**Why it happens:** CITED — Hobby caps any single cron expression to a minimum once-per-day frequency; Pro allows per-minute.
**How to avoid:** R10's "daily automated" cadence fits Hobby's ceiling exactly (mirrors the existing weekly `curator-reach` cron, which is already well within the daily floor) — keep the new cron entry at daily-or-coarser and this pitfall doesn't bite. Only becomes relevant if the plan considers a finer-grained automated check.
**Warning signs:** A `vercel.json` schedule string with a `*` in the hour field firing more than once/day.

## Code Examples

### `/api/health` design contract (R4)

```typescript
// Source: pattern synthesized from app/api/waitlist's rate-limit reuse (VERIFIED,
// in-repo) + the SPEC's R4 acceptance criteria (healthy/degraded/timeout/redaction).
// app/api/health/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const SUPABASE_CHECK_TIMEOUT_MS = 2000

export async function GET() {
  const startedAt = Date.now()
  let supabaseOk = false

  try {
    const service = createServiceClient()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUPABASE_CHECK_TIMEOUT_MS)
    // ONE cheap read-only check — e.g. a `select 1`-equivalent against a tiny
    // table, never a full row scan. No writes, ever.
    const { error } = await service.from('artist_invites').select('id').limit(1)
    clearTimeout(timeout)
    supabaseOk = !error
  } catch {
    supabaseOk = false // timeout or any other failure -> degraded, never a throw
  }

  const status = supabaseOk ? 'healthy' : 'degraded'
  const httpStatus = supabaseOk ? 200 : 200 // degraded is still 200 (SPEC: "never 500/crash")

  return NextResponse.json(
    { status, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt },
    { status: httpStatus }
  )
}
```
*Note: whether `degraded` should be HTTP 200 or a distinct 5xx (e.g. 503) for Better Stack's own failure-detection purposes is an Open Question below — the SPEC only mandates "never 500/crash" on an INTERNAL failure, and a monitor typically wants a non-2xx to register a "down" state, so this needs an explicit plan-time decision, not left implicit in code.*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `NEXT_PUBLIC_SENTRY_DSN` via one-click Vercel integration | Manually-set, non-`NEXT_PUBLIC_`-named env var inlined via `next.config.ts`'s `env` key | N/A — this is a project-specific deviation from Sentry's own default guidance, driven by this SPEC's stricter prohibition | Slightly more manual setup (no one-click integration), but the DSN never appears in the client bundle under a name a casual `grep NEXT_PUBLIC_` audit would flag |
| Vercel Spend Management notify+pause bundled together | Notify-only, pause toggle deliberately left OFF | Feature has existed with both options for some time; this phase's decision (D-07) is the "current approach" for Funūn specifically | Avoids the self-inflicted-outage risk of an automatic pause during a legitimate traffic spike (e.g. a successful launch) |

**Deprecated/outdated:** None identified as deprecated by vendors; all researched mechanisms (Sentry `instrumentation.ts`, k6 `ramping-vus`, Vercel Spend Management, Better Stack multi-location checks) are current as of this research session (2026-08-13).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Vercel project plan tier is unknown at research time (STATE.md's 2026-07-06 note says Hobby; SPEC.md marks it unverified) | Common Pitfalls #2, Summary | If still Hobby: Spend Management/Observability Plus are unreachable, D-09's $100 threshold and D-06's deferred Observability Plus both need a fallback plan (e.g., a Funūn-built usage check, or accepting the notification gap until a Pro upgrade); if Pro: R1 proceeds as researched |
| A2 | Whether direct-Postgres (Supavisor pooler) traffic exists vs. HTTP/Data-API-only is unconfirmed (SPEC's own "NEEDS HUMAN/EXTERNAL" item) | Phase Requirements (R2), Boundaries | If pooler traffic exists and R2's checklist omits it, a real connection-exhaustion failure mode goes unmonitored; SPEC already requires marking pooler items N/A-with-reason if unconfirmed, so the risk is contained by the SPEC's own design |
| A3 | Supabase's dashboard does not currently offer native email-alert configuration for CPU/disk/connection thresholds (based on WebSearch/docs review, not a direct dashboard walkthrough this session) | Common Pitfalls #5 | If a native alert-config feature does exist for this project's tier, R2 could be partially "vendor dashboard" work instead of pure documentation — low risk (documentation-first is a safe superset either way) |
| A4 | `@sentry/nextjs`'s `10.70.0` "too-new" SUS flag is a heuristic false-positive rather than a real slopsquat signal (package/org/download-count signals are all strongly legitimate) | Package Legitimacy Audit | Very low — 9.28M weekly downloads and the official `getsentry` GitHub org are strong countervailing signals; still gated behind a `checkpoint:human-verify` per protocol regardless |
| A5 | Next.js env-var inlining via `next.config.ts`'s `env` key (Pattern 3) genuinely avoids requiring the `NEXT_PUBLIC_` prefix while still shipping the value to the client bundle | Architecture Patterns Pattern 3, Common Pitfalls #1 | This is standard, long-standing Next.js behavior (not vendor-specific), but was not independently re-verified against current Next.js 15 docs this session — verify at implementation time with a quick build+grep of the output bundle |
| A6 | Whether `/api/health`'s `degraded` state should return HTTP 200 or a non-2xx status for Better Stack's own down-detection purposes | Code Examples, Open Questions #1 | If Better Stack is configured to treat any 2xx as "up," a `degraded` Supabase check would never actually alert anyone — directly undermines R3's purpose; must be resolved explicitly in planning, not left as an implicit code choice |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Should `/api/health`'s `degraded` response be HTTP 200 or a non-2xx status?**
   - What we know: SPEC requires the endpoint to "never 500/crash" on an internal failure, and to return a "minimal healthy/degraded body with a defined status-code contract."
   - What's unclear: whether "never 500" means literally never any non-2xx, or specifically never an unhandled crash (a deliberate 503 for `degraded` is not a crash). Better Stack's alerting is presumably status-code-driven (or body-content-driven, if it supports response-body assertions).
   - Recommendation: plan should explicitly decide — a deliberate `503` for `degraded` (still no crash, still a defined/documented contract) is likely closer to observability best practice AND still satisfies "never 500/crash" if read as "no unhandled exception," while a same-code 200-for-both approach requires Better Stack to be configured with a body-content check instead of a status-code check. Confirm which Better Stack check type (status vs. keyword/body match) will be used for the `/api/health` monitor before finalizing.

2. **Does the current Vercel plan expose ANY usage-limit API/webhook reachable from a Funūn-built check, if it turns out to be Hobby (not Pro)?**
   - What we know: Spend Management and Observability Plus require Pro; Vercel's general "Usage" section (limits.md/pricing docs) implies some usage-approaching notifications exist on all plans by email/dashboard already.
   - What's unclear: exact Hobby-tier notification behavior wasn't independently confirmed this session (research focused on Pro-tier Spend Management, since that's what CONTEXT.md's D-06/D-09 describe).
   - Recommendation: the `checkpoint:human-verify` in Common Pitfalls #2 should resolve both A1 and this question in one pass — have the owner check Vercel's dashboard "Usage" and "Billing" settings pages directly before any R1 task is finalized.

3. **Where does the D-10 config layer actually live — typed module, table, or hybrid?**
   - What we know: CONTEXT.md explicitly defers the exact shape to "researcher/planner design it," within the constraint of "NO UI, forward-compatible for a later dashboard."
   - What's unclear: whether a migration (table) is worth the schema-push overhead this phase, vs. a code module that's simpler now but requires a redeploy to change a threshold.
   - Recommendation: see Standard Stack's "Alternatives Considered" — hybrid (table for growable recipients/owners, typed module for thresholds) balances "no redeploy to add a person" against "no migration needed for numeric thresholds this phase." Planner should make this an explicit, named decision in PLAN.md rather than an implicit code choice, since it directly shapes the deferred dashboard's data model.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Sentry account/project | R5 | ✗ (not yet created — owner action) | — | None; R5 is blocked until an owner creates a Sentry org/project and supplies DSN + auth token |
| Better Stack account | R3 | ✗ (not yet created — owner action) | — | None; R3 is blocked until an owner creates a Better Stack account |
| k6 binary | R7 | Unknown — not probed on the executor's machine this session; likely absent | — | `brew install k6` (macOS) or run via official Docker image in CI; no fallback needed since installation is trivial and free |
| Vercel Pro plan (for Spend Management / Observability Plus) | R1 (D-09's $100 threshold path; D-06 defers Observability Plus) | Unknown (A1) | — | If still Hobby: notify-only spend tracking may need a Funūn-built substitute (Open Question #2), or the $100 heads-up stays a manual owner habit until upgrade |
| A separate staging Supabase project | R7 (D-11) | ✗ (not yet created — owner action) | — | None; D-11 explicitly requires a separate project, never prod Supabase |
| `npm view` / registry access | Package Legitimacy Audit | ✓ | n/a | — |

**Missing dependencies with no fallback:**
- Sentry account/project (R5), Better Stack account (R3), separate staging Supabase project (R7) — all three are owner-created accounts/resources that must exist before their requirement's code/config tasks can complete; each should be an early `checkpoint:human-verify` or `checkpoint:human-action` in the plan.

**Missing dependencies with fallback:**
- k6 binary — trivial local install, no blocking risk.
- Vercel Pro plan — see Open Question #2; a documented manual-review fallback exists if still on Hobby.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^30.4.2` (via `ts-jest`), existing project convention |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npx jest app/api/health lib/observability lib/logging` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| R4 | `/api/health` returns `healthy` when the Supabase check succeeds | unit/integration (mocked Supabase client) | `npx jest app/api/health/route.test.ts -t healthy` | ❌ Wave 0 |
| R4 | `/api/health` returns `degraded` (never 500/crash) when the Supabase check fails or errors | unit/integration | `npx jest app/api/health/route.test.ts -t degraded` | ❌ Wave 0 |
| R4 | `/api/health` honors the strict timeout bound (a hung check resolves as `degraded`, not hung indefinitely) | unit (fake timers / mocked AbortController) | `npx jest app/api/health/route.test.ts -t timeout` | ❌ Wave 0 |
| R4 | `/api/health` response body contains no secrets/schema/env vars/exception text | unit (string-assertion over the JSON response) | `npx jest app/api/health/route.test.ts -t redaction` | ❌ Wave 0 |
| R5 | `beforeSend` scrubbing strips cookies/headers/query-string/named-sensitive-fields, including non-ASCII identifiers (e.g. "Funūn") | unit (call the scrub function directly with representative fixture payloads) | `npx jest lib/observability/scrub.test.ts` | ❌ Wave 0 |
| R5 | No monitoring DSN/token carries a `NEXT_PUBLIC_` prefix | automated grep/lint check (not a Jest test per se — a CI script assertion) | `grep -rn "NEXT_PUBLIC_SENTRY\|NEXT_PUBLIC_.*DSN" --include="*.ts" --include="*.env*" . \| grep -v node_modules` (exit 1 on any match) | ❌ Wave 0 — add as a small script or a Jest test reading `next.config.ts`'s source text |
| R5 | A controlled server exception and a controlled browser exception appear in Sentry with source maps/release resolved | manual/tabletop (requires a live Sentry project + a deployed build) | N/A — human-verified against the Sentry dashboard | manual |
| R6 | Correlation ID present on both a request's structured log line and its Sentry event (same value) | integration (mocked Sentry capture + captured `console.log` output, asserting identical ID) | `npx jest lib/logging/correlation.test.ts` | ❌ Wave 0 |
| R6 | Concurrent requests carry distinct correlation IDs (never shared/cross-contaminated) | unit (call `getOrCreateCorrelationId` N times concurrently with no propagated header, assert all-unique) | `npx jest lib/logging/correlation.test.ts -t concurrency` | ❌ Wave 0 |
| R7 | k6 stop condition (`abortOnFail`) aborts a run mid-ramp on a deliberately-breached threshold | manual/tabletop rehearsal — run the k6 script against a target seeded to fail fast (e.g. an artificially low threshold), confirm the run halts before reaching the final stage | N/A — k6's own CLI output is the evidence; not a Jest-automatable check since it requires a live target and a real k6 process | manual |
| R8 | A metric exactly at a threshold, and one step either side, resolves to the specified severity band deterministically | unit (pure function over the D-10 config's threshold-classification logic) | `npx jest lib/observability/config.test.ts -t boundary` | ❌ Wave 0 |
| R8 | Warning/critical bands never overlap; a between-value resolves to the lower (warning) severity | unit | `npx jest lib/observability/config.test.ts -t adjacency` | ❌ Wave 0 |
| R3 | Uptime alert fires on the Nth consecutive failure, not the (N-1)th; a lone failure→success does not alert | manual/tabletop — configured entirely in Better Stack, verified by deliberately breaking a monitored endpoint and counting alert timing against the configured threshold | N/A — vendor-hosted logic, not testable in this repo's Jest suite | manual |
| R9 | Runbook passes a tabletop exercise | manual/tabletop — a simulated incident walked end-to-end by the owner | N/A | manual |

### Sampling Rate
- **Per task commit:** `npx jest <changed-area>` (e.g. `app/api/health`, `lib/observability`, `lib/logging`)
- **Per wave merge:** `npm test` (full suite) + `npx tsc --noEmit` + `npm run lint`
- **Phase gate:** Full suite green, plus the manual/tabletop items above (R5 live-exception check, R7 abort rehearsal, R3 consecutive-failure timing, R9 tabletop) explicitly executed and recorded before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `app/api/health/route.test.ts` — covers R4 (healthy/degraded/timeout/redaction)
- [ ] `lib/observability/scrub.test.ts` — covers R5 PII-scrubbing
- [ ] `lib/observability/config.test.ts` — covers R8 threshold boundary/adjacency
- [ ] `lib/logging/correlation.test.ts` — covers R6 correlation-ID uniqueness/propagation
- [ ] A CI-runnable grep/lint script asserting no `NEXT_PUBLIC_` monitoring secret — covers R5's Prohibition
- [ ] Framework install: none needed — Jest already configured and used project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|---------------------|
| V2 Authentication | no | `/api/health` is deliberately unauthenticated by design (must be pollable by an external monitor); no other new auth surface is introduced |
| V3 Session Management | no | No session-bearing surface added |
| V4 Access Control | yes (narrow) | The D-10 config layer (thresholds/recipients/owners) must be service-role-only if table-backed (mirrors the existing `funun_staff`/`staff_audit_log` zero-policy-RLS convention from Phase 25), never client-readable — this is an access-control concern even though it has no end-user-facing route |
| V5 Input Validation | yes (narrow) | `/api/health` takes no user input; the k6 harness's target-URL configuration should be validated to reject a production hostname by construction (defense-in-depth beyond the "never prod" process rule) |
| V6 Cryptography | no | No new cryptographic surface; Sentry `SENTRY_AUTH_TOKEN` and Better Stack API keys are handled as opaque server-only secrets (standard env-var storage), not a cryptography implementation concern |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| `/api/health` as an unauthenticated DB-amplification vector | Denial of Service | One cheap read-only check, strict timeout, no writes, optional per-IP rate limit reusing `lib/security/rate-limit.ts` (VERIFIED reusable pattern) — this is R4's own explicit Prohibition |
| Sensitive data (secrets/legal names/contract terms/royalties) leaking into a third-party monitor via an unscrubbed exception payload | Information Disclosure | `beforeSend`/`beforeSendTransaction` scrubbing (Pattern 4), `sendDefaultPii` left off, a dedicated scrubbing test over representative payloads (Validation Architecture R5 row) |
| A monitoring secret (DSN/auth token) shipped client-side under a discoverable name | Information Disclosure | Non-`NEXT_PUBLIC_`-named env var inlined via `next.config.ts`'s `env` key (Pattern 3); `SENTRY_AUTH_TOKEN` never inlined into any client bundle at all (build-time-only secret) |
| An owner-editable config surface (thresholds/recipients/owners) writable by a non-staff account if table-backed | Tampering / Elevation of Privilege | Service-role-only access (zero-policy RLS if a table, matching the `funun_staff` precedent) — no authenticated-role write path at all this phase, since there is deliberately no UI |
| A load-test script accidentally pointed at production | Denial of Service | D-11 (never prod Supabase) enforced by construction — the k6 target URL/env should be validated (e.g. reject any hostname matching `funun.studio`) rather than relying solely on operator discipline |

## Sources

### Primary (CITED — official vendor documentation, fetched this session)
- `docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup` — Next.js 15 App Router instrumentation setup, `onRequestError`, config file structure
- `docs.sentry.io/platforms/javascript/guides/nextjs/data-management/sensitive-data` — `beforeSend`/`beforeSendTransaction` scrubbing pattern
- `docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps` — automatic source-map upload, `SENTRY_AUTH_TOKEN` requirement
- `vercel.com/docs/alerts` — Error Anomaly / Usage Anomaly alert definitions, thresholds, Observability Plus gating
- `vercel.com/docs/spend-management` — Spend Management mechanics, opt-in pause toggle, 50/75/100% notification thresholds, webhook payload shape
- `k6.io/docs/using-k6/scenarios/executors/ramping-vus` — `ramping-vus` executor + staged targets
- `supabase.com/docs/guides/telemetry/reports` (via WebSearch summary, not directly fetched) — Reports dashboard structure

### Secondary (WebSearch cross-checked against an official source — MEDIUM confidence)
- k6 `thresholds` + `abortOnFail` stop-condition pattern (multiple blog/tutorial sources consistent with k6's own docs structure)
- Better Stack check-interval tiers (free 3-min / paid 30s-1min) and multi-location consecutive-failure alerting model (betterstack.com/docs cross-referenced via WebSearch summary)
- Vercel `FUNCTION_THROTTLED` semantics and the 30,000-Hobby/Pro vs 100,000-Enterprise concurrency-scaling ceiling (vercel.com/docs/errors/function_throttled, vercel.com/docs/functions/concurrency-scaling, cross-referenced via WebSearch summary)
- Sentry-Vercel Marketplace integration auto-injecting `NEXT_PUBLIC_SENTRY_DSN` (blog.sentry.io integration guide, via WebSearch summary)
- Vercel Hobby cron once-per-day ceiling (WebSearch summary, consistent across multiple third-party sources; not independently re-fetched from vercel.com/docs/cron-jobs this session)

### Tertiary (LOW confidence — WebSearch only, not cross-checked against an official source this session)
- Next.js correlation-ID via `AsyncLocalStorage`/middleware header-set technique (community GitHub Discussions, not official Next.js docs)
- Supabase native alert-configuration availability (or lack thereof) for CPU/disk/connections at the dashboard level — inferred from Reports/Metrics-API documentation, not a direct dashboard walkthrough
- Supabase compute add-on tier pricing table ($10 Micro through $3,730 16XL) — third-party pricing-guide summaries, not fetched from supabase.com/pricing directly

## Metadata

**Confidence breakdown:**
- Standard stack (Sentry version/mechanics): MEDIUM — CITED against official docs.sentry.io pages fetched this session; package-legitimacy tool flagged `@sentry/nextjs` SUS on a version-recency heuristic despite strong legitimacy signals (see A4)
- Architecture (Sentry/k6/Vercel wiring patterns): MEDIUM — core patterns CITED; two patterns (correlation-ID middleware technique, the `next.config.ts` `env`-key DSN workaround) are synthesized/ASSUMED and flagged individually (A5)
- Pitfalls: MEDIUM-HIGH — the two highest-value pitfalls (NEXT_PUBLIC_ DSN injection, Vercel plan-tier gating) are each grounded in a CITED official-docs fact plus an in-repo VERIFIED fact (STATE.md's Hobby-tier note); lower-confidence pitfalls (Supabase native alerting) are flagged LOW/tertiary
- Vendor-specific unknowns (Vercel plan tier, direct-Postgres usage): explicitly unresolved — both are the SPEC's own "NEEDS HUMAN/EXTERNAL" items, not researchable from the repo, and are carried forward as Assumptions Log A1/A2 with a recommended `checkpoint:human-verify`

**Research date:** 2026-08-13
**Valid until:** ~14 days (2026-08-27) — this domain moves fast (Vercel ships pricing/alerting changes frequently, Sentry SDK releases are near-daily per the `@sentry/nextjs` publish timestamp observed this session); re-verify version numbers and the Vercel plan-tier/Observability-Plus gating specifically before implementation if more than 2 weeks elapse.
