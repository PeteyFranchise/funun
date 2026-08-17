# k6 capacity load harness (R7)

Phase 32 (`production-observability-capacity-incident-readiness`), plan 09.
A repeatable, **non-production-only** load test that ramps 25 → 50 → 100 →
250 → 500 concurrent VUs across Funūn's high-traffic routes, enforces
mid-run stop conditions, and produces the measured data
`docs/observability/CAPACITY-REPORT.md` is written from.

**Status: scripts drafted, not yet run.** See `32-09-DRAFT.md` in this
phase's planning directory for what's deferred and why — in short: this
harness has never been executed (no k6 install, no staging target exist
yet in this environment), so no capacity numbers exist to report.

## What this is NOT

- **Not an npm package.** k6 is a standalone Go binary. `npm install k6`
  installs an unrelated/wrong package — do not run it, and nothing in this
  directory is ever added to `package.json`.
- **Not imported by the app.** Nothing under `app/` or `lib/` imports
  anything in `scripts/load/` — this is dev-only tooling, invoked directly
  via the k6 CLI, never bundled into the Next.js runtime.
- **Not a production tool.** `target.js`'s `resolveTarget()` throws if the
  target hostname is `funun.studio` or any `funun.studio` subdomain. A
  production load test requires separate written owner authorization that
  is entirely outside this harness's scope — there is no flag or override
  to bypass the refusal.

## Install (NOT `npm install`)

Pick one:

- **macOS dev:** `brew install k6`
- **Docker (any OS / CI):** use the official `grafana/k6` image, e.g.
  `docker run --rm -e K6_TARGET_URL=... -v "$(pwd)":/work -w /work grafana/k6 run scripts/load/run-ramp.js`
- **CI (GitHub Actions):** use the official `grafana/k6-action`, or the
  Docker image above in a workflow step.

Confirm the install with:

```bash
k6 version
```

## Prerequisites: a non-production target

R7 (and D-11) require a **separate, non-production** target — never the
production Supabase project or the production Vercel deployment:

1. A separate staging Supabase project (free tier is fine), seeded with
   representative data.
2. A Vercel Preview deploy pointed at that staging Supabase project (not
   production env vars).

This provisioning is owner-performed, out-of-band work (see this plan's
Task 1 checkpoint) — nothing in this harness creates or manages that
environment.

## Running the harness

```bash
k6 run -e K6_TARGET_URL=https://<your-preview-deploy>.vercel.app scripts/load/run-ramp.js
```

`K6_TARGET_URL` is the **only** required env var. If it's unset, or it
resolves to a production hostname, `run-ramp.js` fails immediately (before
a single request is sent) with a clear error — see `target.js`.

### What it measures

Each iteration hits every high-traffic route once (see `scenarios.js` for
the full list and file-level source references: public catalogue browse,
sign-in page, invite-eligibility check, authenticated dashboard, vault
reads, search/filter, Green Room reads, and `/api/health`), tagged with
both the route name and the current ramp stage (`s25` … `s500`).

At the end of the run, `handleSummary` in `run-ramp.js` prints a per-stage
capacity table to stdout (VUs, RPS, p50/p95/p99, failed rate, request
count) and writes the full k6 metrics payload to
`scripts/load/last-run-summary.json` (gitignored — a local run artifact,
not committed).

### Authenticated coverage (known limitation)

`/dashboard`, `/vault`, and `/api/buyer/catalog` (the search/filter route)
require a signed-in Supabase session. This harness does not currently carry
one — each `check()` only asserts "responded, not a 5xx" so an expected
401/redirect never itself fails the run. Injecting a seeded staging session
per VU (a login flow + cookie-jar management) is a follow-up enhancement,
not part of this draft.

## Stop conditions (mid-run abort)

`run-ramp.js`'s `thresholds` set `abortOnFail: true` on:

- `http_req_failed` — overall failure rate `< 5%`
- `http_req_duration` — overall p95 `< 3000ms`

If either trips **at any point during the ramp**, k6 halts the entire run
immediately — it does not wait for the current stage or the full 500-VU
stage to complete. This is the required stop-condition backstop for R7's
"a latency/error/DB-pressure/spend breach aborts the ramp mid-run" must-have.

Per-stage thresholds (`http_req_duration{stage:s25}`, etc.) also exist in
`options.thresholds`, but those are deliberately unreachable-false
(`p(95)<600000`, `rate<=1`, `count>=0`) — their only purpose is telling k6
to materialize that stage's tagged submetric for the summary table; they
never abort anything themselves.

### Abort rehearsal procedure

Before treating a real run's data as trustworthy, rehearse that the abort
actually fires — this is Task 3's required rehearsal step:

1. Open `run-ramp.js` and temporarily tighten one of the two overall
   thresholds, e.g. change:
   ```js
   http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true }],
   ```
   to:
   ```js
   http_req_duration: [{ threshold: 'p(95)<1', abortOnFail: true }],
   ```
   (an unreachable 1ms p95 — the very first request will exceed it).
2. Run the harness against the staging target as normal.
3. Confirm k6's output shows the threshold failing and the run stopping
   **before** the final (`s500`) stage completes — k6 prints something
   like `thresholds on metrics 'http_req_duration' have been crossed;
   ending the test prematurely...` and exits early.
4. **Revert the threshold change** back to `p(95)<3000` before committing
   or re-running for real capacity data — the tightened value is for the
   rehearsal only.

Record the rehearsal outcome (confirmed it fired mid-ramp) alongside the
real run's numbers — `docs/observability/CAPACITY-REPORT.md` (Task 4)
notes both.

## Files

| File | Purpose |
|------|---------|
| `target.js` | Resolves + validates the target URL; refuses a production hostname by construction. CommonJS on purpose — loadable identically by k6 and by plain Node (see its header comment), which is what makes the "unit-style guard" test possible without installing k6. |
| `scenarios.js` | Per-route request functions + custom Trend/Rate metrics. |
| `run-ramp.js` | The k6 entry point: `options` (ramping-vus stages + thresholds), the default (per-iteration) function, and `handleSummary`. This is the file you pass to `k6 run`. |
| `last-run-summary.json` | Generated by a real run; gitignored. Not present until the harness has actually been executed. |

## Deferred (owner action required)

This draft ships the harness only. Still outstanding, in order:

1. `brew install k6` (or the Docker/CI equivalent) — Task 1.
2. Provision a non-production staging Supabase project + point a Vercel
   Preview deploy at it — Task 1.
3. Run the harness against that target, capture Vercel
   invocations/throttles + Supabase CPU/memory/connections/slow-query
   deltas + third-party failures + estimated cost alongside k6's own
   output, and rehearse the abort (procedure above) — Task 3.
4. Write `docs/observability/CAPACITY-REPORT.md` from that measured
   evidence — Task 4. This file does not exist yet; it must never contain
   fabricated numbers.

See `32-09-DRAFT.md` in this phase's planning directory for the full
handoff note.
