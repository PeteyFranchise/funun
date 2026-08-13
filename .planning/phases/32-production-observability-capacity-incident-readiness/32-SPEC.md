# Phase 32: Production Observability, Capacity & Incident Readiness — Specification

**Created:** 2026-08-13
**Ambiguity score:** 0.12 (gate: ≤ 0.20)
**Requirements:** 10 locked

## Goal

Funūn moves from **zero formal production monitoring** to a small, founder-maintainable observability system that raises an owned, actionable alert — within minutes — for a production outage, an elevated server/browser error rate, slow routes, Vercel Function throttling, Supabase resource/query pressure, or unexpected infrastructure spend, and that can find the platform's **real** capacity ceiling through a repeatable non-production load test rather than asserting a marketing concurrency number.

## Background

Grounded in the codebase as of 2026-08-13 (funun.studio is live on Vercel; this session deployed `main`). Each baseline claim is labelled **VERIFIED** (confirmed in repo/platform), **WRONG**, or **NEEDS HUMAN/EXTERNAL** (not derivable from the repo).

- **VERIFIED** — Hosting is Vercel; app is Next.js `15.5.19`; data/auth is Supabase Cloud (`@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`). Production served this session (`server: Vercel`, apex→www 308).
- **VERIFIED** — No dedicated application-error monitoring: no `@sentry/*`, `bugsnag`, or `rollbar` in `package.json`; no `next.config` monitoring hooks.
- **VERIFIED** — No production health endpoint: `app/api/health` does not exist.
- **VERIFIED** — No external uptime monitor and no repeatable load-test harness: no Better Stack / Checkly / UptimeRobot config in-repo; no `k6` / `artillery` / `autocannon`.
- **VERIFIED** — No shared structured-logging/correlation-ID convention: no `pino`/`winston`; `requestId` appears ad hoc in 2–3 routes only. `console.log` is discouraged by CONVENTIONS but not enforced.
- **VERIFIED** — Platform primitives already present to build on: `vercel.json` defines one cron (`/api/cron/curator-reach`, weekly) — a reusable scheduler for R10; a `break-glass` npm script + `docs/BREAK-GLASS.md` exist and R9 must reconcile with them; `middleware.ts` runs `supabase.auth.getUser()` on protected prefixes; a rate-limit pattern exists (`app/api/waitlist`).
- **NEEDS HUMAN/EXTERNAL** — "Vercel project is on the Pro plan" and "~30,000 concurrent Function executions ceiling." Not derivable from the repo; must be confirmed in the Vercel dashboard. The 30k figure is a Function-execution limit, **not** a simultaneous-user guarantee.
- **NEEDS HUMAN/EXTERNAL** — Whether Funūn hits Supabase (DB CPU/connections/disk), Auth/API, application-route, storage, or third-party (Anthropic/Stripe/Resend) limits **before** Vercel's ceiling. Only a load test answers this.
- **NEEDS HUMAN/EXTERNAL** — Whether direct Postgres (Supavisor pooler) traffic exists vs. HTTP/Data-API only. Determines whether any pooler work in R2 applies at all (do not invent pooling work otherwise).

**Trigger:** Funūn now carries real buyer + artist traffic on a domain with no early-warning system; the next launch/invite batch could exhaust an unknown constraint silently. This phase installs the warning system and the operating process around it.

## Requirements

1. **Vercel monitoring & cost controls**: Vercel usage + spend notifications and function/traffic metric monitoring are configured with an owned response.
   - Current: No Vercel usage, spend, error-anomaly, or usage-anomaly notifications configured; native dashboards exist but no process.
   - Target: Usage notifications at supported thresholds (50/75/100%); Spend Management notifications; monitoring for Function invocations, 5xx, duration, throttles, edge requests, bandwidth, route latency; **any `FUNCTION_THROTTLED` is treated as an urgent operational event**; Error/Usage Anomaly alerts enabled *iff* the current plan/add-ons support them; delivery to an owner-chosen channel; a documented operating response per warning.
   - Acceptance: A forced test notification is received on the chosen channel; a written table maps each Vercel warning → owner → response; `FUNCTION_THROTTLED` is documented as urgent with a defined action.

2. **Supabase health & capacity monitoring**: A documented review procedure covers Supabase resource, service, and query health.
   - Current: No Supabase monitoring process; native dashboards/Advisor unused operationally.
   - Target: Review procedure + (where supported) alerts for DB CPU, memory, connections, service connection distribution (PostgREST/Auth/Storage), pooler utilization *where applicable*, disk utilization/growth, IOPS, API errors/latency, Auth failures/anomalies, slow/outlier queries, lock contention, long-running queries, Query Performance Advisor findings, and explicit compute-upgrade decision points.
   - Acceptance: A written Supabase review checklist exists naming each metric, where to read it, and its warning/critical trigger; pooler items are included **only if** direct-Postgres traffic is confirmed (else explicitly marked N/A with reason).

3. **External uptime monitoring**: An independent uptime monitor watches production and can report Vercel-hosted production down.
   - Current: None; monitoring would otherwise rely solely on Vercel, which cannot report its own outage.
   - Target: An explicitly selected provider (Better Stack / Checkly / UptimeRobot / justified equivalent) checks `https://www.funun.studio/`, `/signin`, `/sync/catalog`, and the R4 health endpoint every 1–2 minutes; alerts require 2–3 consecutive failures; the spec states *why* external (not Vercel-internal) monitoring is required.
   - Acceptance: The monitor is live on the four routes at the agreed interval; a deliberately failing check produces a delivered alert after the configured consecutive-failure count and not before.

4. **Production-safe health endpoint**: A read-only `/api/health` suitable for 1–2 minute polling.
   - Current: No health endpoint; monitors have nothing cheap + authoritative to poll.
   - Target: `GET /api/health` confirms runtime liveness, performs **one** inexpensive read-only Supabase check under a strict timeout, performs **no writes**, returns a minimal `healthy`/`degraded` body with a defined status-code contract, exposes no secrets/schema/env/tokens/exception text, is cheap enough for 1–2 min polling, is not an unauthenticated DB-amplification vector (caching / rate-limit / monitor auth applied only where justified).
   - Acceptance: Automated tests cover **healthy**, **degraded** (Supabase check fails/times out → `degraded`, never 500/crash), **timeout** (strict bound honored), and **secret-redaction** (response body asserted free of secrets/schema/exception text); a load check confirms repeated polling issues ≤ one cheap read and no writes.

5. **Privacy-safe application error monitoring**: Server + browser exceptions and traces reach a monitor without leaking sensitive data.
   - Current: Exceptions surface only in Vercel logs; no aggregation, regression alerting, release correlation, or affected-user counts; no browser error capture.
   - Target: Selected error-monitoring vendor (Sentry is the recommended default; vendor is human-gated) captures server-side Next.js exceptions, browser exceptions, API-route failures, performance traces for important routes, release/deploy correlation, source maps, new-regression alerts, error frequency, affected-user counts, and request correlation across browser → Vercel route → Supabase/external provider; env-specific sampling; **session replay off by default**; all monitoring secrets server-side (no `NEXT_PUBLIC_` prefix).
   - Acceptance: A controlled server exception and a controlled browser exception both appear in the monitor with release + source-map resolution; a scrubbing test proves no password/JWT/cookie/auth-header/API-key/Supabase-token/legal-name/contract/signature/royalty value is transmitted; grep confirms no monitoring DSN/token carries a `NEXT_PUBLIC_` prefix.

6. **Structured logging & correlation**: A minimal, secret-safe operational-logging convention with request correlation.
   - Current: Ad-hoc `requestId` in a few routes; no shared convention; `console.log` uncontrolled by policy.
   - Target: A convention that generates or propagates a request/correlation ID, records operation/route/status/duration/safe identifiers, separates expected user errors from operational failures, never records secrets or raw sensitive records, integrates with Vercel logs + the R5 monitor, replaces scattered `console.log`, reconciles with existing CONVENTIONS, and names which critical workflows require durable operational evidence.
   - Acceptance: A correlation ID appears on a request's log line **and** its error-monitor event (same value); concurrent requests carry distinct IDs (never shared); a logging test asserts no secret/raw-sensitive field is emitted; the critical-workflow list exists.

7. **Load & capacity testing**: A repeatable non-production load harness that finds the real constraint.
   - Current: No harness; capacity is unknown and unmeasured.
   - Target: A repeatable harness (k6 / Artillery / justified) targeting a **non-production** environment first, with scenarios for public catalogue browsing, sign-in page load, invite-eligibility checks, authenticated dashboard load, vault/project reads, search/filtering, Green Room reads, and other high-traffic routes found by code inspection; gradual ramp 25 → 50 → 100 → 250 → 500 concurrent; each level records RPS, p50/p95/p99, 4xx/5xx, timeouts, Vercel invocations + throttles, Supabase CPU/memory, DB + pooler connections, slow-query changes, third-party failures, estimated cost; defined pass/fail thresholds and **immediate stop conditions**.
   - Acceptance: The harness runs against a non-prod target and emits a capacity report table across all five ramp levels with every listed metric; a stop condition (latency/error/DB-pressure/spend over the approved safety threshold) aborts the run mid-ramp in a rehearsal; **production is never the initial target**.

8. **Alert thresholds & severity model**: Baseline-validated thresholds and a SEV-1..4 model with owners.
   - Current: No thresholds, no severity model, no ownership.
   - Target: Warning/critical thresholds (Vercel 5xx, function throttles, dynamic-route p95, Supabase CPU, DB connections, disk, Auth/API 5xx, external-uptime consecutive failures) seeded from the brief's proposed values and **validated against an observed baseline**; SEV-1..SEV-4 definitions, each specifying notification channel, primary owner, backup owner, acknowledgement expectation, escalation rule, and resolution criteria.
   - Acceptance: A thresholds table shows proposed vs. baseline-adjusted values; the SEV table has all six fields populated per severity (owner/backup may be roles pending the discuss-phase naming decision, but the field is present); threshold bands are non-overlapping and a value exactly at a threshold resolves to one documented severity.

9. **Incident response runbook**: A concise, tabletop-tested runbook.
   - Current: No runbook; `docs/BREAK-GLASS.md` covers DB break-glass only.
   - Target: A runbook to determine whether an incident originates in Vercel/Supabase/app/DNS/Auth/Storage/external, where to check first, how to correlate a user report → request ID → deployment, how to roll back a Vercel deployment safely, **when NOT to roll back because deployed DB schema is ahead of app code**, how existing break-glass constraints apply, how to communicate degraded service, how to record a timeline, and how to run a post-incident review capturing root cause, user impact, detection method, detection gap, resolution, preventive action, owner, due date.
   - Acceptance: The runbook passes a **tabletop exercise** (a simulated incident walked end-to-end); it references `docs/BREAK-GLASS.md` rather than duplicating it; it contains **no** destructive-recovery / DB-reset / migration-repair instructions.

10. **Operating rhythm**: A named-owner cadence that keeps the system in routine use.
    - Current: No cadence; dashboards exist but nobody reviews them on a schedule.
    - Target: Daily automated (uptime, error, spend, throttle detection); weekly ~10-minute Vercel + Supabase review with trend recording; a pre-launch checklist (run load-test profile, review slow queries, confirm capacity headroom, verify alert delivery, name release + rollback owner); a monthly capacity report (traffic, peak measured concurrency, p95, error rate, DB utilization, disk growth, cost + projection, throttling) producing a 90-day capacity recommendation; after every incident the review is completed and the detection gap closed or tracked.
    - Acceptance: Weekly and monthly checklists exist and **name an owner**; a measurable capacity-upgrade trigger is written; one monthly report is produced (may use load-test/baseline data) demonstrating the format.

## Boundaries

**In scope:**
- Vercel usage/spend/anomaly notifications + metric monitoring with an owned response (R1).
- Supabase health/capacity review procedure + Advisor usage (R2).
- One external uptime monitor on four production routes (R3).
- A read-only, tested, secret-safe `/api/health` endpoint (R4).
- Privacy-scrubbed server+browser error monitoring with release/source-map correlation (R5).
- A minimal structured-logging + correlation-ID convention (R6).
- A repeatable **non-production** load harness + capacity report (R7).
- Baseline-validated thresholds + SEV-1..4 model (R8).
- A tabletop-tested incident runbook (R9).
- A daily/weekly/pre-launch/monthly operating rhythm with owners (R10).

**Out of scope:**
- Product analytics, profile-view analytics, marketing attribution — not observability; different data model + privacy posture.
- A custom in-house monitoring platform/UI — the goal is founder-maintainable use of native + hosted tools, not a build.
- **Automatic production pause on spend** and **automatic Supabase compute changes** — a spike-into-outage / cost-surprise risk; only ever via an explicit owner decision (currently undecided → deferred).
- **Production load testing** — this phase targets non-prod only; any production test requires separate written owner authorization not granted here.
- **Error-monitor session replay** — off by default; enabling it is a separate privacy decision, excluded from this phase.
- Recording raw user content in monitoring systems — privacy prohibition (see Prohibitions).
- Connection-pooling / Supavisor work **unless** direct-Postgres traffic is confirmed in R2 — do not invent it for an HTTP/Data-API-only app.
- Destructive DB testing, DB reset, or migration-repair recovery — excluded from R7 and R9.

## Constraints

- **Founder-scale:** every deliverable must be routinely usable by a solo founder; prefer native + hosted tools + ≤10-minute weekly cadence over anything that needs a dedicated operator. A system nobody uses is a failure condition.
- **Privacy & secret-handling (hard):** monitoring/log egress must never carry passwords, JWTs, session cookies, authorization headers, API keys, Supabase tokens, legal names, private contracts, signature data, royalty details, or rights-sensitive content; scrub cookies/headers/bodies/query params/sensitive identifiers; all monitoring secrets stay server-side with **no `NEXT_PUBLIC_` prefix**; monitoring-data retention + access to be set by owner (see Unresolved).
- **Platform:** Next.js 15 App Router on Vercel; Supabase Cloud; reuse `vercel.json` crons for scheduled checks; `/api/health` must fit Vercel serverless + middleware (matcher currently excludes `/api`).
- **Rollback / disablement (per integration):** each new integration must be independently disableable without a redeploy where possible — health endpoint behind a feature flag or trivially removable route; error-monitor SDK gated by an env var (unset ⇒ no-op, no data egress); uptime monitor + Vercel/Supabase alerts toggled in their dashboards; load harness is dev-only tooling (never shipped to the runtime bundle); logging convention degrades to existing behavior if the sink is absent. The SPEC/plan must state the off-switch for each.
- **Recurring cost awareness:** R1/R3/R5 and a possible Supabase compute upgrade carry recurring cost; vendor/plan/tier choices are owner-gated (see Unresolved) and must be surfaced with their price before selection — no silent paid enrollment.
- **Accuracy/integrity:** capacity statements must cite measured evidence; the Vercel 30k Function figure must not be restated as a simultaneous-user capacity.

## Acceptance Criteria

- [ ] Vercel usage + spend alerts are configured and a **test delivery is verified** on the chosen channel (R1).
- [ ] Every Vercel signal (errors, latency, invocations, bandwidth, throttles) has a written owner + threshold; `FUNCTION_THROTTLED` documented as urgent (R1/R8).
- [ ] Supabase CPU, memory, connections, disk, Auth/API errors, and slow-query review are documented with read-location + trigger (R2).
- [ ] External uptime checks cover the four agreed routes at 1–2 min with **verified** alert delivery after N consecutive failures (R3).
- [ ] `/api/health` is read-only, single-cheap-check, timeout-bounded, secret-safe, and tested for healthy/degraded/timeout/secret-redaction (R4).
- [ ] A controlled **server** exception and a controlled **browser** exception both appear in the selected error monitor (R5).
- [ ] Source maps + release correlation resolve in the monitor **without exposing secrets** (R5).
- [ ] A correlation ID appears across a request's log line and its error-monitor event; concurrent requests carry distinct IDs (R6).
- [ ] A scrubbing/redaction test proves no sensitive value (passwords/JWTs/cookies/auth headers/API keys/Supabase tokens/legal names/contracts/signatures/royalties) is transmitted to any monitor or log (R5/R6).
- [ ] A repeatable **non-production** load test produces a capacity report across 25→500 with all listed metrics (R7).
- [ ] Baseline latency, errors, traffic, and resource utilization are documented (R7/R8/R10).
- [ ] A measurable capacity-upgrade trigger exists (R8/R10).
- [ ] The incident runbook passes a tabletop exercise and references (not duplicates) `docs/BREAK-GLASS.md` (R9).
- [ ] Weekly and monthly operating checklists exist and **name an owner** (R10).
- [ ] No migration, destructive DB operation, unauthorized production test, or analytics work is introduced by this phase (all requirements).
- [ ] Threshold bands are non-overlapping; a value exactly at a threshold and one step either side resolves to one documented severity (R8, edge).
- [ ] The uptime alert fires on the Nth consecutive failure (per config), not the (N−1)th; a lone failure→success does not alert (R3, edge).

## Edge Coverage

**Coverage:** 14/24 applicable edges resolved as covered · 10 dismissed (with reason) · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| adjacency | R3 | ✅ covered | Alert fires on Nth consecutive failure, not (N−1)th; failure→success does not alert (AC). |
| empty | R3 | ✅ covered | Unreachable target (DNS/timeout/zero response) counts as failure, never "unknown/skip". |
| ordering | R3 | ⛔ dismissed | Per-endpoint checks are independent; no ordering/stable-sort semantics. |
| concurrency | R3 | ⛔ dismissed | External provider runs checks; no Funūn concurrent code path. |
| empty | R4 | ✅ covered | Supabase check error/no-rows ⇒ `degraded` (not 500/crash) — tested. |
| encoding | R4 | ⛔ dismissed | Fixed minimal JSON response; no user-supplied length/equality semantics. |
| concurrency | R4 | ✅ covered | Read-only + side-effect-free; concurrent polls never mutate/amplify beyond one cheap read. |
| empty | R5 | ✅ covered | Scrubbing handles null/empty/absent fields without error; never emits a partial secret. |
| encoding | R5 | ✅ covered | Redaction matches sensitive identifiers regardless of encoding/normalization (e.g. "Funūn"), not ASCII-only. |
| concurrency | R5 | ⛔ dismissed | SDK-managed transport; no bespoke concurrent path in scope. |
| concurrency | R6 | ✅ covered | Each request gets/propagates its OWN correlation ID; concurrent requests never share/cross-contaminate. |
| concurrency | R7 | ✅ covered (+backstop) | Harness enforces mid-run stop conditions aborting the ramp — plan-phase carries the stop-condition test as a backstop. |
| boundary | R8 | ✅ covered | A metric exactly at a threshold and one step either side resolves to the specified band deterministically. |
| adjacency | R8 | ✅ covered | Warning/critical bands do not overlap; a between-value resolves to the lower (warning) severity. |
| empty | R8 | ✅ covered | No-baseline thresholds are marked provisional; a no-data metric is "unknown", never silently "healthy". |
| ordering | R8 | ⛔ dismissed | Severities are a fixed enum with defined precedence; no sort/stability concern. |
| precision | R8 | ✅ covered | p50/p95/p99 + rate thresholds use a documented window + rounding; a boundary value classifies per the stated rule. |
| concurrency | R8 | ⛔ dismissed | Threshold model is documented policy, not a concurrent execution path. |
| idempotency | R9 | ✅ covered | Rollback + post-incident steps are safe to repeat; the schema-ahead caveat prevents an unsafe re-rollback. |
| concurrency | R9 | ⛔ dismissed | Human-executed documentation; no concurrent code path. |
| concurrency | R1 | ⛔ dismissed | Provider configuration + documented response; no concurrent runtime code path in Funūn. |
| concurrency | R2 | ⛔ dismissed | Documented review procedure over provider dashboards; no concurrent execution semantics. |
| boundary | R10 | ✅ covered | The monthly capacity-upgrade trigger is a documented measurable threshold; crossing it (and one step either side) yields a deterministic recommend/hold. |
| precision | R10 | ⛔ dismissed | Monthly cost figures are recorded observations + an advisory 90-day projection; no load-bearing rounding contract. |

## Prohibitions (must-NOT)

**Coverage:** 10/10 applicable prohibitions resolved · 0 unresolved
*(Canon-referral: generic injection/XSS/secret-management hardening is owned by `/gsd-secure-phase` + lint — not minted here. The rows below are the bespoke privacy/safety/accuracy must-NOTs this phase's novel monitoring egress introduces.)*

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT transmit auth secrets (passwords, JWTs, session cookies, authorization headers, API keys, Supabase tokens) to any monitoring/error/log system. | R5/R6 | resolved | test — scrubbing test asserts these keys never appear in a captured payload |
| MUST NOT transmit rights-sensitive business content (legal names, private contracts, signature data, royalty details, rights-sensitive content) to monitoring. | R5/R6 | resolved | test — redaction test over representative payloads |
| MUST NOT record raw user content in monitoring systems. | R5/R6 | resolved | judgment — data-flow review of what is captured/attached |
| MUST NOT expose secrets, schema details, env vars, tokens, deployment internals, or exception text via `/api/health`. | R4 | resolved | test — health-response body asserted free of these |
| MUST NOT give any monitoring secret a `NEXT_PUBLIC_` prefix (no client exposure). | R5/R6 | resolved | test — grep/lint asserts no `NEXT_PUBLIC_*` monitoring DSN/token |
| MUST NOT enable error-monitor session replay by default. | R5 | resolved | judgment — config asserted replay-off; enabling is a separate decision |
| MUST NOT automatically pause production, or automatically change Supabase compute, without an explicit owner decision. | R1/R2 | resolved | judgment — no auto-pause/auto-scale control shipped this phase |
| MUST NOT run the initial (or any) load test against production without separate written owner authorization. | R7 | resolved | judgment — harness default target is non-prod; prod requires out-of-band sign-off |
| MUST NOT let `/api/health` perform writes or become an unauthenticated DB-amplification vector. | R4 | resolved | test — asserts read-only + bounded per-poll cost (cache/rate-limit if justified) |
| MUST NOT claim a simultaneous-user capacity (e.g. 30,000) from Vercel's Function limit alone; capacity claims must cite measured load-test evidence. | R7/R10 | resolved | judgment — capacity report + monthly recommendation cite measured data |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                            |
|--------------------|-------|------|--------|------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Outcome-language objective; founder-scale + failure conditions explicit |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | Extensive in/out-of-scope + non-goals + prohibitions             |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Privacy/secret/platform locked; vendor/budget intentionally owner-gated |
| Acceptance Criteria| 0.88  | 0.70 | ✓      | 17 pass/fail criteria incl. edge-derived                          |
| **Ambiguity**      | 0.12  | ≤0.20| ✓      | Gate passed; only owner-gated HOW decisions deferred to discuss   |

## Unresolved Decisions (owner-gated → discuss-phase)

Per owner (2026-08-13), all of the following are deferred to `/gsd-discuss-phase`; this SPEC selects no vendor, plan, budget, or destination and locks only the safe defaults noted in Boundaries/Prohibitions.

1. External uptime provider — Better Stack / Checkly / UptimeRobot / justified equivalent (R3).
2. Whether to purchase Vercel Observability Plus (gates Error/Usage Anomaly alerts) (R1).
3. Error-monitoring vendor + plan/tier — Sentry is the recommended default (R5).
4. Monitoring-data retention period + who may access monitoring data (R5, privacy).
5. Alert destination(s) — email / Slack / SMS / webhook — per severity (R1/R8).
6. Error-monitor sampling rates per environment (R5).
7. Whether error-monitor session replay is ever permitted (default: off) (R5).
8. Spend-notification threshold amount(s) (R1).
9. Whether production should EVER auto-pause on spend (default this phase: never; alerts-only) (R1).
10. Staging / load-test environment (which non-prod target) (R7).
11. Whether any bounded production load test is later authorized (default: none without separate sign-off) (R7).
12. Named primary incident owner (R8/R9).
13. Named backup incident owner (R8/R9).
14. Capacity-upgrade budget / trigger spend ceiling (R2/R8/R10).

## Dependencies & Recurring Costs

- **Depends on:** Phase 31 (roadmap order) for sequencing only — no code dependency; this phase can proceed independently. Platform access to the Vercel + Supabase dashboards (owner-held). `docs/BREAK-GLASS.md` (R9 reconciliation). `vercel.json` cron mechanism (R10 scheduling).
- **Recurring costs (owner-gated, must be surfaced with price before selection):** external uptime monitor (free tiers exist); error-monitoring plan (Sentry has a free tier; paid above quota); Vercel Observability Plus (paid add-on); potential Supabase compute upgrade (paid) if R2/R7 reveal pressure. No paid enrollment without an explicit owner decision.
- **New runtime dependency added to the app bundle:** only the error-monitor SDK (R5) and the health route (R4); the load harness (R7) is dev-only tooling and must never enter the runtime bundle.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | What monitoring exists today? | None (VERIFIED: no error monitor / health endpoint / uptime / load harness / structured logging); build on `vercel.json` cron + `break-glass` |
| 1 | Boundary Keeper | Incident owner + backup? | Deferred to discuss-phase (spec requires the field to exist; names TBD) |
| 1 | Failure Analyst | Auto-pause production on spend? | Deferred; safe default = alerts-only, no auto-pause this phase |
| 1 | Boundary Keeper | Load-test target? | Deferred; safe default = non-prod only, prod requires separate authorization |
| 1 | Failure Analyst | Session replay? | Deferred; safe default = off, out of scope this phase |
| — | Edge probe (5.5) | 24 candidate edges | 14 covered → acceptance criteria; 10 dismissed with reason; 0 unresolved |
| — | Prohibition probe (5.6) | must-NOT axis | 10 bespoke privacy/safety/accuracy prohibitions minted; canon security referred to `/gsd-secure-phase` |

---

*Phase: 32-production-observability-capacity-incident-readiness*
*Spec created: 2026-08-13*
*Next step: /gsd-discuss-phase 32 --text — implementation decisions (vendors, budgets, alert destinations, sampling, retention, named owners, staging env — the 14 owner-gated decisions above), producing CONTEXT.md*
