# Capacity Report

Measured load & capacity baseline for Funūn — how many concurrent users the
app actually serves before something breaks, and what breaks first.

---

> # ⚠️ NO RAMP HAS BEEN RUN. THIS DOCUMENT CONTAINS NO MEASUREMENTS.
>
> Every measurement cell below reads **`UNMEASURED`**. That is not a
> placeholder awaiting a formality and it is not "pending" — it means **the
> number does not exist**. Nobody has ever load-tested Funūn.
>
> The harness that would produce these numbers
> (`scripts/load/`) is written but has never been executed, because the
> environment it requires does not exist yet:
>
> | Prerequisite | Status |
> |---|---|
> | k6 installed (standalone Go binary, `brew install k6`) | ❌ not installed |
> | Separate **staging** Supabase project, seeded with representative data | ❌ does not exist |
> | Vercel Preview deploy pointed at that staging project | ❌ does not exist |
>
> **Do not cite this document as evidence of capacity.** It currently
> establishes only that the measurement has not been taken. Plan 08's
> baseline-adjusted alert thresholds and Plan 10's monthly capacity report
> both name this file as their source of measured evidence — until the
> tables below are filled from a real run, those consumers have **no
> baseline**, and any threshold they use is a guess that should be labelled
> as one.
>
> To produce the numbers, follow `scripts/load/README.md` (owner setup →
> abort rehearsal → full ramp → transcribe results here).

---

## How to fill this in

1. Complete the owner setup in `scripts/load/README.md` §2.
2. Rehearse the abort (§4) and record the outcome below.
3. Run the full ramp (§3).
4. Transcribe results (§5): k6's stdout table and
   `scripts/load/last-run-summary.json` supply the HTTP columns; the Vercel
   and Supabase dashboards supply the rest, **read for the same wall-clock
   window as the run**.
5. Replace only the cells you have a real number for. **Leave the rest as
   `UNMEASURED`.** A blank cell is honest; a plausible-looking invented
   number is not, and it will propagate into alert thresholds that then
   fire — or fail to fire — for no reason anyone can trace.

---

## Run metadata

| Field | Value |
|---|---|
| Date of run | `UNMEASURED — no run` |
| k6 version | `UNMEASURED — k6 not installed` |
| Target URL (non-production) | `UNMEASURED — no preview deploy exists` |
| Staging Supabase project ref | `UNMEASURED — no staging project exists` |
| Supabase plan / instance size | `UNMEASURED` |
| Seeded data volume (rows per key table) | `UNMEASURED` |
| Stage duration | 2 minutes per level (harness default) |
| Ramp levels | 25 → 50 → 100 → 250 → 500 concurrent VUs |
| Run completed or aborted? | `UNMEASURED — no run` |

---

## 1. HTTP results (from k6)

Source: k6 stdout summary + `scripts/load/last-run-summary.json`.

| Concurrent VUs | RPS | p50 (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Timeouts |
|---|---|---|---|---|---|---|---|
| 25 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 50 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 100 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 250 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 500 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |

> **Reading the 4xx column:** expected 401s (`/api/buyer/catalog`
> unauthenticated) and 429s (`/api/signup/check-invite` rate limiting) land
> here by design and are *not* counted as failures. See §6.

---

## 2. Vercel (from the Vercel dashboard)

| Concurrent VUs | Function invocations | Throttles | Estimated cost |
|---|---|---|---|
| 25 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 50 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 100 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 250 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 500 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |

---

## 3. Supabase (from the Supabase dashboard)

| Concurrent VUs | CPU % | Memory % | DB connections | Pooler connections | Slow-query delta |
|---|---|---|---|---|---|
| 25 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 50 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 100 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 250 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |
| 500 | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` | `UNMEASURED` |

> Slow-query delta = count of slow queries during the run minus the count in
> an equivalent idle window immediately before it.

---

## 4. Third-party dependencies

Failures observed in the same window (Resend, Stripe, Anthropic, DocuSeal,
Supabase Storage).

| Concurrent VUs | Third-party failures | Which provider(s) |
|---|---|---|
| 25 | `UNMEASURED` | `UNMEASURED` |
| 50 | `UNMEASURED` | `UNMEASURED` |
| 100 | `UNMEASURED` | `UNMEASURED` |
| 250 | `UNMEASURED` | `UNMEASURED` |
| 500 | `UNMEASURED` | `UNMEASURED` |

---

## 5. The real constraint

The question this report exists to answer: **what breaks first, and at what
level?**

| Field | Value |
|---|---|
| First ramp level to breach a stop condition | `UNMEASURED` |
| Which condition breached | `UNMEASURED` |
| The binding constraint (CPU / connections / latency / throttling / cost) | `UNMEASURED` |
| Highest level sustained cleanly | `UNMEASURED` |
| Evidence | `UNMEASURED — no run has been performed` |

**Capacity statement:** *(write only after a measured run; must cite the
run above)*

> `UNMEASURED — Funūn has no measured capacity figure.`

### Accuracy constraint — the ~30,000 figure is NOT capacity

Vercel documents a function-execution concurrency limit in the region of
~30,000. **That figure must never be restated as a simultaneous-user
capacity for Funūn, and is not used as one anywhere in this document.** It
describes one platform limit on one layer. It says nothing about Funūn's
database connections, pooler limits, query performance under real data,
third-party rate limits, or cost — any of which will bind long before a
platform function limit does. The binding constraint is whatever the
measured ramp finds, which is currently unknown.

---

## 6. Measurement caveats

These are properties of the harness and must be carried into any
interpretation of the numbers above. Full detail in
`scripts/load/README.md` §6.

- **Authenticated pages are a lower bound.** No virtual user carries a
  session. `/dashboard`, `/vault`, `/green-room` redirect to `/signin` and
  k6 follows the redirect, so those timings measure the redirect path, not
  the real authenticated page cost. `/api/buyer/catalog` returns 401,
  measuring the auth check rather than the catalogue query.
- **`/api/signup/check-invite` measures the rate limiter.** It is capped at
  5 requests per IP per 15 minutes; the load generator is a single IP, so
  after the first handful of requests this route returns 429 for the rest
  of the run.
- **Single-source load.** All traffic originates from one IP and one
  machine. Real distributed traffic will interact differently with rate
  limiting, connection reuse, and edge caching.
- **Staging ≠ production.** Different Supabase instance size, different
  data volume, different cache warmth. Treat results as directional for
  production, not as a transferable absolute.

---

## 7. Abort rehearsal

R7 requires proof that the mid-run stop condition fires *before* the final
stage — an untested safety backstop is not a safety backstop.

| Field | Value |
|---|---|
| Rehearsal performed? | ❌ **No — requires k6 and a target, neither of which exists** |
| Date | `UNMEASURED` |
| Stage at which the abort fired | `UNMEASURED` |
| Threshold that fired | `UNMEASURED` |
| k6 exit code | `UNMEASURED` |

Procedure: `scripts/load/README.md` §4.

### Stop conditions, and which are automatic

| Condition | Enforced by | Automatic? |
|---|---|---|
| Error rate (5xx + transport) `rate<0.05` | k6 `abortOnFail` threshold | ✅ aborts the run |
| Latency `p(95)<3000ms` | k6 `abortOnFail` threshold | ✅ aborts the run |
| Database health (`/api/health` non-200) `rate<0.10` | k6 `abortOnFail` threshold | ✅ aborts the run |
| Supabase CPU / memory | Owner watching the dashboard | ❌ **manual `Ctrl-C`** |
| DB / pooler connection exhaustion | Owner watching the dashboard | ❌ **manual `Ctrl-C`** |
| Vercel throttling | Owner watching the dashboard | ❌ **manual `Ctrl-C`** |
| Spend | Owner watching the dashboard | ❌ **manual `Ctrl-C`** |

k6 observes HTTP responses only. The four manual rows above are **not**
automatically protected — do not run a ramp unattended.

> The three threshold values are unvalidated starting guesses chosen before
> any measurement existed. Retune them from the first real baseline.

---

## 8. Consumers of this document

| Consumer | What it needs from here |
|---|---|
| Plan 08 — alert thresholds | The measured baseline that the baseline-adjusted threshold column is derived from. |
| Plan 10 — monthly capacity report + upgrade trigger | The capacity ceiling and binding constraint that the upgrade trigger is set against. |

Both currently have **no baseline available**. Any threshold either one
uses today is an unvalidated guess and should be labelled as such until
this report is filled from a real run.
