---
phase: 32-production-observability-capacity-incident-readiness
plan: 09
subsystem: infra
tags: [observability, load-testing, capacity, k6, dev-tooling, safety-guard]

status: incomplete-authored-only

# Dependency graph
requires:
  - phase: 32-production-observability-capacity-incident-readiness (Plan 03)
    provides: "app/api/health/route.ts — the 200-healthy / 503-degraded endpoint the harness polls and uses as its database-pressure abort signal"
provides:
  - "scripts/load/target.js — production-hostname guard: resolves K6_TARGET_URL and refuses production (and anything unprovable) by construction (D-11)"
  - "scripts/load/scenarios.js — eight per-route request functions across the verified high-traffic surfaces, with per-route metrics"
  - "scripts/load/run-ramp.js — k6 ramping-vus entry point (25→50→100→250→500), three abortOnFail stop conditions, per-stage summary"
  - "scripts/load/README.md — owner setup (k6 out-of-band, staging Supabase, Preview deploy), run procedure, abort rehearsal procedure"
  - "docs/observability/CAPACITY-REPORT.md — capacity report TEMPLATE; every measurement cell reads UNMEASURED"
  - "scripts/load/target.test.ts + scripts/load/no-runtime-import.test.ts — guard tests (85 cases)"
affects:
  - "32-08 (baseline-adjusted threshold column) — STILL HAS NO BASELINE; this plan produced no numbers"
  - "32-10 (monthly capacity report + upgrade trigger) — STILL HAS NO CAPACITY CEILING"

tech-stack:
  added: []   # k6 is deliberately NOT an npm dependency — standalone Go binary
  patterns:
    - "Fail-closed target guard: dependency-free CommonJS loadable identically by k6's goja VM and by Node, so the safety property is unit-testable without installing the load tester"
    - "Tighten-only rehearsal preset (K6_REHEARSE_ABORT=1): a safety drill flag that can only make a stop condition stricter, never looser — no env var exists that loosens or disables an abort"

key-files:
  created:
    - scripts/load/target.test.ts
    - scripts/load/no-runtime-import.test.ts
    - docs/observability/CAPACITY-REPORT.md
  modified:
    - scripts/load/target.js
    - scripts/load/scenarios.js
    - scripts/load/run-ramp.js
    - scripts/load/README.md
    - .planning/ROADMAP.md

requirements-completed: []   # R7 is NOT complete — see "Plan status" below

metrics:
  duration: ~1 session
  completed: 2026-09-09
  tasks_completed: 2
  tasks_total: 4
---

# Phase 32 Plan 09: k6 Non-Prod Load Harness + Capacity Report Summary

The k6 capacity harness is **authored, hardened, and tested — and has never
been run.** Funūn still has no measured capacity figure.

---

## Plan status: NOT COMPLETE

This plan is `autonomous: false` with two blocking human checkpoints. Only
the two `type="auto"` authoring tasks were executable. **R7 is not
satisfied and Plan 09 must stay open.**

| Task | Type | Status |
|---|---|---|
| 1 — install k6 + provision non-prod staging target | checkpoint | ❌ **outstanding** (owner) |
| 2 — scenarios + ramp orchestrator + prod-hostname guard | auto | ✅ done |
| 3 — run harness on staging + abort rehearsal | checkpoint | ❌ **outstanding** (owner) |
| 4 — capacity report from measured evidence | auto | ⚠️ **template only** — no evidence exists |

**Outstanding owner setup**, none of which an agent can do:

1. **k6 is not installed.** `brew install k6` (standalone Go binary — must
   never enter `package.json`).
2. **No staging Supabase project exists.** Needs a separate project (not a
   prod branch), migrations applied, seeded with *representative* data — a
   near-empty DB reports flattering numbers that mean nothing.
3. **No Vercel Preview deploy pointed at it.**
4. **The abort rehearsal has not been performed.** R7 explicitly requires a
   *rehearsed* abort proving the stop condition fires before the final
   stage. Cannot be rehearsed without k6 and a target. The procedure is
   written (README §4) with its expected observable outcome.

`ROADMAP.md` was deliberately left at **9/10** with `32-09` unchecked.

### There are no capacity numbers, and none were invented

`docs/observability/CAPACITY-REPORT.md` is a **template**. Every
measurement cell reads `UNMEASURED`, and the document opens with an
unmissable warning that no ramp has been run. No latency figure, RPS,
connection count, or cost estimate appears anywhere in this plan's output.

This matters because **Plan 08 and Plan 10 both cite this document as
measured evidence**. A fabricated baseline would have propagated into alert
thresholds that then fire, or fail to fire, for reasons nobody could trace.
Both consumers currently have **no baseline** — the report says so
explicitly, in their own section.

---

## What was delivered

| Artifact | Lines | Role |
|---|---|---|
| `scripts/load/target.js` | 229 | Production-hostname guard (rewritten) |
| `scripts/load/scenarios.js` | 254 | Eight per-route request functions (rewritten) |
| `scripts/load/run-ramp.js` | 265 | Five-stage ramp + stop conditions (rewritten) |
| `scripts/load/README.md` | 291 | Owner setup + run + abort rehearsal |
| `docs/observability/CAPACITY-REPORT.md` | 228 | Capacity report template |
| `scripts/load/target.test.ts` | 288 | Guard tests incl. bypass attempts |
| `scripts/load/no-runtime-import.test.ts` | 91 | Bundle + package.json isolation |

A prior commit (`219a6100`) had drafted the four `scripts/load/*` files.
All four were reworked here; two defects in that draft are recorded below.

### The target guard (D-11)

`resolveTarget()` refuses anything it cannot positively parse **and**
positively show to be non-production. Refusal classes, each unit-tested:

- production host, any subdomain, any case
- **trailing-dot FQDN form** (`funun.studio.`)
- userinfo disguise (`https://staging@funun.studio` — last `@` wins)
- path/query/fragment bait (`https://funun.studio/@evil.example`)
- non-`http(s)` scheme; missing scheme; empty/malformed authority
- **public IP literals** (no hostname exists to check, so the guard cannot
  prove non-production — loopback and RFC1918 stay allowed)

Suffix lookalikes (`funun.studio.evil.example`) are correctly *not* treated
as production. There is no flag or env var that unlocks a production run.

---

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Trailing-dot bypass in the production guard**

- **Found during:** Task 2 review of the prior draft.
- **Issue:** the check was `h === prod || h.endsWith('.' + prod)`.
  `https://funun.studio./` yields hostname `funun.studio.`, which satisfies
  neither branch — so **the harness would have accepted a production target
  and load-tested production.** A trailing dot is the valid absolute-FQDN
  form and resolves to the identical host for every HTTP client.
- **Fix:** normalize trailing dots (and case) in both `extractHostname()`
  and `isProductionHostname()`, the latter so the exported function is safe
  called directly. Six trailing-dot variants added to the test suite.
- **Files:** `scripts/load/target.js`, `scripts/load/target.test.ts`

**2. [Rule 1 — Bug] Every run would have aborted seconds into stage 1**

- **Found during:** Task 2, cross-checking scenario routes against their
  real unauthenticated responses.
- **Issue:** k6's built-in `http_req_failed` counts **any status ≥ 400** as
  a failure. Two of eight routes return an expected 4xx to an
  unauthenticated single-IP load generator — `/api/buyer/catalog` → 401,
  `/api/signup/check-invite` → 429 after 5 requests per IP per 15 min
  (`lib/security/rate-limit.ts`). That pins the failure rate near 25%
  against a `rate<0.05` `abortOnFail` threshold, so **the ramp would have
  aborted in the first seconds of stage 1 on every single run**, for
  reasons having nothing to do with capacity — and would have looked like a
  capacity finding.
- **Fix:** `http.setResponseCallback(http.expectedStatuses({min:200,
  max:499}))` narrows failure to 5xx + transport errors; 4xx/5xx/timeouts
  tracked in dedicated counters (which the report needs as columns anyway).
- **Files:** `scripts/load/scenarios.js`, `scripts/load/run-ramp.js`

**3. [Rule 2 — Missing critical functionality] No database-pressure stop condition**

- **Issue:** the plan requires abort on latency / error-rate / **DB
  pressure** / **spend**. The draft had only latency and error rate.
- **Fix:** added a `health_degraded` Rate fed by `/api/health` (200 healthy
  / 503 degraded — Plan 03's contract), with `abortOnFail`. This is the one
  DB-pressure signal k6 can observe from inside a run.
- **Honest limitation, documented rather than papered over:** k6 sees only
  HTTP responses. It **cannot** abort on Supabase CPU/memory, DB/pooler
  connection counts, Vercel throttling, or **spend**. Those four are
  **manual `Ctrl-C` stop conditions** requiring the owner to watch the
  dashboards. Both the README and the report carry an explicit
  automatic-vs-manual table, so nobody mistakes the presence of thresholds
  for protection against a cost blowout.

**4. [Rule 2] Tighten-only abort rehearsal preset**

- `-e K6_REHEARSE_ABORT=1` substitutes an impossible p95 ceiling (1ms) so
  the abort fires in stage 1, demonstrating the path end to end. Fixed
  preset, not a free-form value: it can only make the condition
  **stricter**. Deliberately no env var loosens or disables an abort. This
  also means rehearsing needs no source edit, so a tightened threshold
  cannot be accidentally committed.

**5. [Rule 2] Single-ramp-level mode**

- `-e K6_ONLY_STAGE=100` runs one flat stage, for re-measuring a tier
  without sitting through the earlier ones.

---

## Route verification

Every route was confirmed by file inspection before a scenario was written
against it. **All eight plan-named surfaces exist; none were missing.**

| Scenario | URL | File |
|---|---|---|
| catalogue browse | `/sync/catalog` | `app/sync/catalog/page.tsx` |
| sign-in page | `/signin` | `app/(auth)/signin/page.tsx` |
| invite-eligibility | `POST /api/signup/check-invite` | `app/api/signup/check-invite/route.ts` |
| dashboard | `/dashboard` | `app/(artist)/dashboard/page.tsx` |
| vault/project reads | `/vault` | `app/(artist)/vault/page.tsx` |
| search/filter | `GET /api/buyer/catalog` | `app/api/buyer/catalog/route.ts` |
| Green Room reads | `/green-room` | `app/(artist)/green-room/page.tsx` |
| health | `/api/health` | `app/api/health/route.ts` |

Route groups `(auth)` / `(artist)` do not appear in URLs — the paths above
are the requestable ones.

---

## Known limitations of the harness itself

Carried in both the README (§6) and the report (§6) so they cannot be lost
when numbers eventually land:

- **All authenticated-page numbers will be a lower bound.** No VU carries a
  session. `/dashboard`, `/vault`, `/green-room` redirect to `/signin` and
  k6 follows redirects, so those timings measure the redirect path, not the
  real authenticated cost. `/api/buyer/catalog` measures the auth check,
  not the catalogue query. Per-VU seeded sessions are unbuilt work the plan
  does not scope.
- **`/api/signup/check-invite` measures the rate limiter,** not invite
  eligibility (5 req/IP/15 min; one load generator is one IP).
- **Threshold values are unvalidated guesses** chosen before any
  measurement existed.
- **The hostname guard cannot detect a Preview deploy whose env vars point
  at the production database.** It validates the URL, not the database
  behind it. Called out as an explicit owner check in README §2 step 3 —
  this is the one path by which the harness could still damage production.

---

## Prohibitions — verified

| Prohibition | Status | Evidence |
|---|---|---|
| No load test against production without written authorization | ✅ | `target.js` refuses by construction; 85 tests; 6 mutations killed |
| No simultaneous-user capacity claimed from Vercel's ~30k Function limit | ✅ | Report §5 states the figure is not a capacity number and never restates it as one; no capacity claim exists at all |
| k6 never in `package.json`; `scripts/load/*` never imported by `app/`/`lib/` | ✅ | `no-runtime-import.test.ts` asserts both, in both directions |

---

## Verification

- `npx tsc --noEmit` — **clean**
- `npx jest` — **560 suites, 6890 tests, all passing** (85 new)
- `npm run lint` — **clean** (no dev server was running; checked first)
- `npm run build` — **succeeded** (checked port 3000 and `next dev` first)
- Plan's own automated checks for Tasks 2 and 4 — **PASS**
- **Mutation testing:** six deliberate breaks of the guard, each caught.
  M4 (deleting the http/https scheme allowlist) initially **survived** —
  every non-http case tested was also caught by another branch. Added
  discriminating cases (non-http scheme on a valid host); M4 now kills 6
  tests.

| Mutation | Tests failed |
|---|---|
| Drop trailing-dot normalization | 1 |
| Never call `isProductionHostname` | 27 |
| Substring instead of anchored-dot suffix | 5 |
| Drop scheme allowlist | 6 (0 before the added cases) |
| Drop public-IP-literal refusal | 6 |
| Userinfo uses first `@` instead of last | 1 |

Nothing was run against any database; no `supabase` command was issued; k6
was never invoked (it is not installed).

## Self-Check: PASSED

All seven artifacts exist on disk; commits verified present.
