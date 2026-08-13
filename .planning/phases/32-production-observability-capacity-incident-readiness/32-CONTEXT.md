# Phase 32: Production Observability, Capacity & Incident Readiness - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire up founder-scale production observability + the operating process around it: error monitoring, external uptime, Vercel + Supabase alerting, a read-only health endpoint, structured logging/correlation, a non-prod load-test harness, baseline-validated thresholds + SEV model, an incident runbook, and an operating rhythm. Thresholds, alert recipients, and incident owners are managed through a **minimal, owner-editable config layer (code/config-level — NO UI)** built forward-compatible so a later dashboard is a thin UI over it. The in-app management **dashboard is explicitly OUT** (split to a fast-follow phase, owner decision 2026-08-13).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**10 requirements are locked.** See `32-SPEC.md` for full requirements, boundaries, acceptance criteria, edge coverage, and prohibitions.

Downstream agents MUST read `32-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):** Vercel usage/spend/anomaly alerts + owned response (R1); Supabase health/capacity review + Advisor (R2); one external uptime monitor on 4 routes (R3); read-only, tested, secret-safe `/api/health` (R4); privacy-scrubbed server+browser error monitoring with release/source-map correlation (R5); minimal structured-logging + correlation-ID convention (R6); repeatable **non-production** load harness + capacity report (R7); baseline-validated thresholds + SEV-1..4 model (R8); tabletop-tested incident runbook (R9); daily/weekly/pre-launch/monthly operating rhythm with owners (R10).

**Out of scope (from SPEC.md, + this discussion):** product/marketing analytics; a custom monitoring platform; **automatic production pause on spend**; **automatic Supabase compute change** (beyond the pre-authorized ceiling in D-14); **production load testing** (non-prod only; prod needs separate written sign-off); **error-monitor session replay** (off, separate decision); recording raw user content in monitoring; connection-pooling work unless direct-Postgres traffic is confirmed; destructive DB testing/reset/migration-repair recovery; **the in-app observability admin dashboard** (deferred to a fast-follow phase — see Deferred Ideas).

</spec_lock>

<decisions>
## Implementation Decisions

### Error monitoring (R5)
- **D-01:** Vendor = **Sentry** (server + browser SDK, source maps, release/regression tracking, affected-user counts). Free/Developer tier to start.
- **D-02:** Sampling = 100% of errors · ~15% performance traces in prod · 100% traces in preview.
- **D-03:** Session replay = **OFF** (locked from SPEC; enabling is the deferred separate privacy decision).
- **D-04:** Retention = Sentry default (30 days on free tier). Monitoring-data access = founder-only for now.

### External uptime monitoring (R3)
- **D-05:** Provider = **Better Stack**. Start on the **free 3-min tier** — a documented, deliberate relaxation of the SPEC's 1–2 min target to 3 min; upgrade to the 1-min paid tier (~$25/mo) **before a major launch/invite batch**. Alert after **2–3 consecutive failures**. Enable the **public status page** (buyer-facing bonus, e.g. status.funun.studio).

### Vercel alerts & spend (R1)
- **D-06:** **Skip Vercel Observability Plus** initially — built-in usage/spend alerts + Sentry cover R1; revisit only if anomaly detection is wanted.
- **D-07:** Spend **auto-pause = NEVER** (alerts-only) — locked safe default; changing it is a separate owner decision.
- **D-08:** Alert destination = **email to pete@funun.studio** now; **Slack fan-out added later** once the workspace exists. **Alert destinations MUST be extensible** — fan-out to multiple sinks + a growable recipient list (add company people as the team grows), never a hardcoded single sink.
- **D-09:** Monthly spend heads-up threshold = **$100** (Vercel's 50/75/100%-of-plan usage alerts fire regardless).

### Central config layer (cross-cutting — R1/R8/R10) — the "one place to adjust as we grow"
- **D-10:** All tunable **thresholds** (spend + the R8 alert thresholds: CPU, latency, 5xx, connections, disk, etc.), the **alert-recipient list**, and the **incident owners** live in ONE owner-editable config surface. In Phase 32 this is a **MINIMAL code/config-level layer** (a typed config module and/or a small config table) — **NO UI**. It MUST be **forward-compatible** so the deferred Observability Admin Dashboard becomes a thin UI over it. Recipients + owners are growable.

### Load & capacity testing (R7)
- **D-11:** Load-test target = a **Vercel Preview deploy pointed at a SEPARATE staging Supabase project** (free tier to start), seeded with representative data — **never prod Supabase**. No production load test without separate written owner authorization (locked).
- **D-12:** Harness tool = **k6**.

### Incident ownership (R8/R9)
- **D-13:** Primary incident owner = **Pete (pete@funun.studio)**, founder-led. **No dedicated backup yet** — single-owner risk noted; additional owners/backups are added later via the D-10 config layer (and the deferred dashboard). SEV routing reads the recipient/owner list from that config.

### Capacity budget (R2/R8/R10)
- **D-14:** Supabase **compute auto-upgrade pre-authorized up to ~$50/mo** (the first compute-tier bump); above that requires explicit owner approval. Figure is tunable in the D-10 config layer.
- **D-15:** **Infra-review trigger = $100/mo** total (Vercel + Supabase + monitoring) — same value as the D-09 spend heads-up; crossing it flags a capacity/pricing review.

### Claude's Discretion
- Exact Sentry trace-sample percentage within the D-02 band; precise shape of the D-10 config module/table (researcher/planner design it); when to prompt the Better Stack paid-tier upgrade; k6 script structure. All within the decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 32 spec (MUST read first)
- `.planning/phases/32-production-observability-capacity-incident-readiness/32-SPEC.md` — Locked requirements (R1–R10), boundaries, acceptance criteria, Edge Coverage, Prohibitions. Locked — MUST read before planning.

### Operational (existing, to reconcile with)
- `docs/BREAK-GLASS.md` — existing DB break-glass procedure. R9's runbook MUST reference (not duplicate) it, and the runbook must contain no destructive-recovery/DB-reset/migration-repair steps.
- `vercel.json` — existing cron (`/api/cron/curator-reach`); reuse this Vercel-cron mechanism for R10's daily scheduled checks.

### Vendor docs (researcher to fetch current integration guidance)
- Sentry Next.js 15 (App Router) SDK — server + browser + source maps + `instrumentation`/config; env-based sampling; PII scrubbing (`beforeSend`).
- Better Stack uptime + status page — check interval tiers, consecutive-failure config, status-page setup.
- k6 — scenarios, ramping VUs, thresholds + `abortOnFail` stop conditions, metrics output.

No project-local ADRs govern this phase beyond the SPEC — requirements are captured in the SPEC + decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/email/sendEmail` (Resend) — substrate for any **Funūn-built custom alert** (e.g., a health-check cron emailing on failure). NOTE: platform alerts (Vercel/Sentry/Better Stack) use their own delivery, not Resend.
- `vercel.json` cron pattern — template for R10 scheduled checks.
- `app/api/waitlist` rate-limit pattern — reusable for `/api/health` rate-limiting *if* justified (R4).
- Jest (`npm test`) — the test framework for R4/R5/R6 acceptance tests (healthy/degraded/timeout/redaction, correlation-ID, scrubbing).
- Existing `/admin` Team Member console + `getStaffRole` gate (Phases 25/28) — where the **deferred dashboard** will eventually live.

### Established Patterns
- `middleware.ts` matcher excludes `/api`, so `/api/health` runs unauthenticated by default — it MUST self-guard: read-only, single cheap check, strict timeout, no secrets, bounded per-poll cost (R4 prohibition against a DB-amplification vector).
- CONVENTIONS discourage `console.log` — R6's structured-logging convention replaces ad-hoc logging; a few routes already carry an ad-hoc `requestId` to standardize on.
- Server-only-secrets convention (no `NEXT_PUBLIC_` prefix for secrets) — R5 Sentry DSN/monitoring secrets stay server-side (a spec prohibition).

### Integration Points
- Sentry wraps Next.js (instrumentation hooks + client/server config) — new dependency in the runtime bundle.
- New `app/api/health/route.ts` — polled by Better Stack alongside `/`, `/signin`, `/sync/catalog`.
- The D-10 config layer — a new typed module/table read by the alerting fan-out, the threshold checks, and SEV routing.
- k6 harness — dev-only tooling; MUST NOT enter the runtime bundle.

</code_context>

<specifics>
## Specific Ideas

- Vendors/tiers: **Sentry** (free), **Better Stack** (free 3-min → 1-min paid pre-launch), **k6**.
- Dollar figures: **$100/mo** spend heads-up = infra-review trigger; **~$50/mo** Supabase compute auto-upgrade ceiling.
- Alert inbox: **pete@funun.studio**; Slack fan-out later; recipient list must grow with the team.
- Enable Better Stack's **public status page**.
- The recurring theme across the discussion: **"one place to adjust as we grow"** — thresholds + recipients + owners centralized and owner-editable (config now, dashboard later).

</specifics>

<deferred>
## Deferred Ideas

### Observability Admin Dashboard → fast-follow phase
An in-app management UI in the **Team Member/admin console** to add/edit **alert recipients, incident owners + SEV routing, and adjustable thresholds** — a thin UI over Phase 32's D-10 config layer. Split out of Phase 32 (owner decision 2026-08-13) to keep this phase lean (monitoring + config + runbooks). Phase 32 must build the config layer forward-compatible for it. **Create via `/gsd-phase` when ready** (it would be the next integer phase; the 29/31 folder reconcile from this session means numbering is now clean).

Also deferred (owner decisions, per SPEC "Unresolved" — revisit if scale demands): purchasing Vercel Observability Plus (D-06); Better Stack 1-min paid upgrade (D-05); a named backup incident owner (D-13); connection-pooling work (only if direct-Postgres traffic is later confirmed).

</deferred>

---

*Phase: 32-production-observability-capacity-incident-readiness*
*Context gathered: 2026-08-13*
