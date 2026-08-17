# Phase 32 Plan 09: k6 capacity harness — DRAFT (Task 2 only)

**Mode:** DRAFT-FIRST. This is not a SUMMARY — the plan is not complete.
Tasks 1 and 3 (owner checkpoints) and Task 4 (capacity report) are
deferred. No `32-09-SUMMARY.md` exists; STATE.md and ROADMAP.md are
unchanged by this pass.

## Why draft-first

32-09-PLAN.md's Task 2 (the k6 scenarios, ramp orchestrator, and
prod-hostname target guard) is plain JS/text and needed neither a live k6
install nor a running staging target to author and verify by code
inspection. The owner chose to get that artifact drafted and committed
before doing the external setup (k6 install + staging Supabase + Vercel
Preview) that Tasks 1, 3, and 4 depend on.

## Drafted (committed this pass — commit `219a610`)

| File | What it does |
|------|---------------|
| `scripts/load/target.js` | `resolveTarget()` reads `K6_TARGET_URL` and **throws** if the hostname is `funun.studio` or any `funun.studio` subdomain — production is refused by construction (D-11). Written as CommonJS specifically so it's testable from plain Node without k6 installed. |
| `scripts/load/scenarios.js` | Per-route request functions for the seven high-traffic surfaces (public catalogue browse `/sync/catalog`, sign-in `/signin`, invite-eligibility `/api/signup/check-invite`, authenticated dashboard `/dashboard`, vault reads `/vault`, search/filter `/api/buyer/catalog`, Green Room reads `/green-room`) plus `/api/health`, each with a custom Trend (duration) + Rate (failure) metric pair. |
| `scripts/load/run-ramp.js` | The k6 entry point: a `ramping-vus` executor staging 25→50→100→250→500 (2 min/stage), `thresholds` with `abortOnFail: true` on overall `http_req_failed` (rate<0.05) and `http_req_duration` (p95<3000ms) — the mid-run stop-condition backstop — plus stage-tagged submetric registration and a `handleSummary` that emits a per-stage capacity table (stdout + `scripts/load/last-run-summary.json`, gitignored). |
| `scripts/load/README.md` | Install as `brew install k6` / Docker (explicitly **not** `npm install`), the `k6 run -e K6_TARGET_URL=... scripts/load/run-ramp.js` invocation, the authenticated-route coverage caveat, and the full abort-rehearsal procedure (temporarily tighten a threshold, confirm the run halts before the final stage, then revert). |
| `.gitignore` | Added `scripts/load/last-run-summary.json` (local run artifact, never committed). |

**Verified this pass (no k6 needed):**
- `node --check` passes on all three `.js` files.
- Unit-style guard test (`node -e`, no k6): `resolveTarget()` throws for
  `funun.studio`, `www.funun.studio`, and a missing `K6_TARGET_URL`; it
  returns a normalized URL for a `*.vercel.app` target; `notfunun.studio`
  correctly does NOT false-match.
- `grep -c '"k6"' package.json` → `0` (k6 never added as a dependency).
- `grep -rl "scripts/load" app lib` → no matches (never imported by app
  code — dev-only tooling stays out of the runtime bundle).

**Not verified this pass (requires the real k6 binary):** an actual
`k6 run` invocation. The scripts were authored directly against k6's
documented `ramping-vus`/`thresholds`/`handleSummary` APIs (RESEARCH
Pattern 5, CITED) and against k6's documented CommonJS/ESM interop, but
have never been executed end-to-end. Sanity-check this on the first real
run per Task 3 below.

## Deferred — needs owner

In order, per 32-09-PLAN.md:

1. **Task 1 (checkpoint):** `brew install k6` (macOS dev) or confirm the
   official k6 Docker image / GitHub Action is available in CI; confirm
   `k6 version` prints. Separately, provision a **non-production** staging
   Supabase project (free tier), seed it with representative data, and
   point a Vercel Preview deploy at it (D-11 — never prod Supabase).
   Report back the Preview URL + staging Supabase project ref.

2. **Task 3 (checkpoint):** Run
   `k6 run -e K6_TARGET_URL=<preview-url> scripts/load/run-ramp.js`
   against that staging Preview. Capture, per ramp stage: RPS, p50/p95/p99,
   4xx/5xx, timeouts (from k6's own output/summary), plus — alongside,
   from the Vercel and Supabase dashboards — invocations + throttles,
   CPU/memory, DB + pooler connections, slow-query deltas, any third-party
   failures, and an estimated cost. Also rehearse the abort per the
   README's procedure (temporarily tighten a threshold, confirm the run
   halts before the `s500` stage, then revert the threshold) and confirm
   it fired mid-ramp.

3. **Task 4 (once Task 3's numbers exist):** Write
   `docs/observability/CAPACITY-REPORT.md` — a table with one row per ramp
   level (25/50/100/250/500) and every column Task 3 captured, the
   identified real constraint (first tier that breached a stop condition),
   confirmation the abort rehearsal fired, and an explicit statement that
   the Vercel ~30k Function-execution figure is NOT restated as a
   simultaneous-user capacity. This file does not exist yet — it must be
   written **from measured evidence only**, never fabricated or estimated.
   That measured baseline then feeds Plan 08's baseline-adjusted
   thresholds and Plan 10's monthly capacity report.

## Explicitly not done this pass

- No npm package was installed. k6 was not added to `package.json`.
- No `32-09-SUMMARY.md` was written — the plan is incomplete.
- `STATE.md` and `ROADMAP.md` were not modified.
- No capacity numbers were fabricated or estimated anywhere in this
  commit — `docs/observability/CAPACITY-REPORT.md` remains unwritten.
