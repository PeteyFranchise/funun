# Phase 32 — Owner Setup Checklist (external services & decisions)

**Context:** Phase 32's remaining 5 plans are ops setup. The **automatable artifacts are drafted and committed**
(docs + k6 harness — see `docs/observability/` and `scripts/load/`). What's left is genuinely yours: standing up
external services, making a couple of decisions, and running the load test. Do these at your pace; when a gate
clears, **ping me and I'll finish the dependent code/report** (Sentry wiring, capacity report) and mark the plan
complete.

Each item below maps to a plan and its `NN-DRAFT.md` handoff note.

---

## 1. Vercel notifications (Plan 32-04) — quick, dashboard only
Reference: `docs/observability/VERCEL-ALERTS-RESPONSE.md` (the response playbook, already drafted).

- [ ] **Confirm the live plan tier** (Hobby vs Pro) — Settings → Billing/Usage. *(Load-bearing: the app assumes Hobby's 10s function cap; tell me if it's actually Pro.)*
- [ ] Enable **Usage notifications** at 50 / 75 / 100%.
- [ ] If **Pro**: enable **Spend Management**, $100 threshold, **"Pause production deployment" OFF** (D-07).
- [ ] Set notification destination to **pete@funun.studio**; send a forced **test notification** to confirm delivery.

*Nothing waits on me here — it's all dashboard config the drafted doc already documents.*

---

## 2. Better Stack uptime (Plan 32-07) — quick, dashboard only
Reference: `docs/observability/UPTIME-MONITORING.md` (drafted).

- [ ] Create **monitors for the 4 routes** at the free **3-min interval**; alert after **2–3 consecutive failures**.
- [ ] Configure the **`/api/health`** monitor as a **status-code check treating 503 (degraded) as down** (matches the route's contract).
- [ ] Enable the **public status page** (e.g. `status.funun.studio`) — then tell me the URL so I can drop it into the doc's placeholder.

---

## 3. Sentry error monitoring (Plan 32-06) — needs your OK, then I write the code
This one is **gated on you first** because no code exists until the package is approved.

- [ ] **Approve `@sentry/nextjs`** (Package Legitimacy Gate) — verify on npmjs.com (publisher = Sentry, downloads, source repo). → **Then ping me: I'll install it + write the env-gated, privacy-scrubbed wiring + tests** (Task 2).
- [ ] Create a **Sentry org/project**, then set **server-side env vars** manually: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` — **NOT** the Vercel Marketplace integration (it auto-injects a browser-prefixed DSN the SPEC forbids).
- [ ] After my code lands + deploys: **trigger a live exception** and confirm it lands in Sentry (with PII scrubbed).

---

## 4. k6 load test (Plan 32-09) — heavier: install + staging + run
Reference: `scripts/load/README.md`; harness is drafted (`scripts/load/*.js`) with a verified prod-hostname guard (refuses `funun.studio`, accepts `*.vercel.app`).

- [ ] **Install k6**: `brew install k6` (or the official Docker image / GitHub Action in CI). *(Not an npm package — never add to package.json.)*
- [ ] Stand up a **non-prod staging Supabase** (free tier, seeded with representative data) behind a **Vercel Preview** deploy. *(D-11: never point this at production.)*
- [ ] **Run the harness** against staging (`K6_TARGET_URL=<preview-url> k6 run scripts/load/run-ramp.js`) + do the **abort rehearsal**. → **Then send me the run summary and I'll write `docs/observability/CAPACITY-REPORT.md` from the measured evidence** (Task 4) and finalize the sample report's real numbers.

---

## 5. Incident runbook tabletop (Plan 32-10) — review
Reference: `docs/observability/RUNBOOK.md` + `OPERATING-RHYTHM.md` (both drafted).

- [ ] **Tabletop the runbook** against a simulated incident (walk one scenario end-to-end); confirm the steps are workable and the correlation-ID → deployment tracing makes sense.
- [ ] Confirm the **operating-rhythm cadence** (daily/weekly/pre-launch/monthly) is realistic for you. → Reply **"tabletop passed"** (or note revisions) and I'll finalize the plan.

---

## What completes the phase
Plans 32-04/06/07/09/10 stay **incomplete** (drafts only) until the gates above clear. As you knock them out,
ping me and I'll: install+wire Sentry, write the capacity report from your load run, apply any Better Stack URL /
tier corrections to the docs, then run phase verification. Nothing here is blocking your Phase 30/31 work.
