# Load & capacity harness (k6)

A repeatable load test that ramps **25 → 50 → 100 → 250 → 500 concurrent
users** across Funūn's highest-traffic routes and records where the app
actually breaks — so capacity is a measured number rather than a guess.

> ### Status: authored, never run
>
> These scripts have **never been executed**. k6 is not installed on any
> machine here, and the non-production environment they require does not
> exist yet. Consequently
> [`docs/observability/CAPACITY-REPORT.md`](../../docs/observability/CAPACITY-REPORT.md)
> is an **empty template** — every measurement cell reads `UNMEASURED`.
> There are no capacity numbers for Funūn yet. The setup below is what
> someone has to do before there are.

---

## 1. What this thing refuses to do

**It will not load-test production.** `target.js` resolves the target URL
and throws if the hostname is `funun.studio` or any subdomain of it. That
refusal is by construction, not by convention — a 500-VU ramp against live
production is a self-inflicted outage, so the guard fails closed:

| Target | Result |
|---|---|
| `https://my-preview.vercel.app` | ✅ runs |
| `http://localhost:3000` | ✅ runs (loopback and private LAN ranges allowed) |
| `https://funun.studio` | ❌ refused — production |
| `https://www.funun.studio` | ❌ refused — production subdomain |
| `https://FUNUN.STUDIO` | ❌ refused — case is normalized |
| `https://funun.studio.` | ❌ refused — trailing-dot FQDN form is the same host |
| `https://staging.example@funun.studio` | ❌ refused — real host is after the last `@` |
| `http://203.0.113.10` | ❌ refused — a public IP literal has no hostname to check |
| `funun.studio` (no scheme) | ❌ refused — unparseable, so unprovable |
| `ftp://preview.vercel.app` | ❌ refused — only `http` / `https` |

Anything the guard cannot positively parse **and** positively show to be
non-production is refused. Running against production requires separate
written owner authorization and is out of scope for this tool — there is
no flag, env var, or override that unlocks it.

The guard's behaviour is pinned by `target.test.ts` (runs under `npx jest`,
needs no k6 and no network).

---

## 2. Owner setup — do these in order

Nothing below is automated. All three steps are one-time.

### Step 1 — Install k6 (NOT via npm)

k6 is a standalone Go binary. It is **not** an npm package and must never
be added to `package.json`:

```bash
brew install k6     # macOS
k6 version          # confirm it prints a version
```

Other options: the official `grafana/k6` Docker image, or the official k6
GitHub Action in CI.

> **Why this matters:** `npm install k6` will install *something* from the
> registry, but it is not the load tester. Pulling an unrelated
> similarly-named package into the dependency tree is a supply-chain
> hazard, so `no-runtime-import.test.ts` fails the build if the string
> `k6` ever appears in `package.json`.

### Step 2 — Create a separate staging Supabase project

Not a branch of production. A **new, separate project** (free tier is
fine).

1. Supabase Dashboard → **New project**.
2. Apply the repo's migrations to it so the schema matches production.
3. Seed **representative** data — enough rows that queries hit realistic
   index and planner behaviour. A near-empty database will report
   flattering numbers that mean nothing, because every query is a trivial
   scan.
4. Note the project ref and its anon / service-role keys.

The load test will hammer this database and may exhaust its connection
pool. That is the point, and it is why it must not be production.

### Step 3 — Point a Vercel Preview deploy at it

1. Push a branch (any branch that is not `main` — `main` deploys to
   production).
2. In Vercel → the Preview deployment → **Environment Variables**, set the
   Supabase URL and keys to the **staging** project from step 2.
3. Redeploy the preview so it picks the new values up.
4. Confirm it is really talking to staging before generating any load:

```bash
curl -s https://<your-preview>.vercel.app/api/health
```

**Double-check the Supabase project ref in that preview's env vars.** A
preview accidentally left pointing at the production database is the one
way to damage production through this harness that the hostname guard
cannot catch — the guard checks the URL you type, not which database sits
behind it.

---

## 3. Running it

Set the target once per shell:

```bash
export TARGET=https://<your-preview>.vercel.app
```

### Full ramp (25 → 50 → 100 → 250 → 500, ~10 minutes)

```bash
k6 run -e K6_TARGET_URL="$TARGET" scripts/load/run-ramp.js
```

### One ramp level only

Useful for re-measuring a single tier without sitting through the earlier
stages:

```bash
k6 run -e K6_TARGET_URL="$TARGET" -e K6_ONLY_STAGE=100 scripts/load/run-ramp.js
```

`K6_ONLY_STAGE` accepts exactly one of `25`, `50`, `100`, `250`, `500`.

### Have these open while it runs

k6 only sees HTTP responses. Four of the capacity report's columns are
invisible to it, and two of the stop conditions are **yours**, not the
tool's:

- **Supabase Dashboard** → Database health: CPU, memory, connections,
  pooler connections, slow queries.
- **Vercel Dashboard** → the preview project: function invocations,
  throttles, and spend.

**Hit `Ctrl-C` if** CPU pins at 100%, connections approach the pool limit,
Vercel starts throttling, or spend moves in a way you did not expect. k6
will not stop for any of those — it cannot see them.

---

## 4. Abort rehearsal (do this before trusting the run)

The harness aborts mid-ramp if latency, error rate, or database health
breaches a threshold. A stop condition that has never fired is one you do
not know works — so fire it deliberately, once, against the real target.

`K6_REHEARSE_ABORT=1` swaps in an impossible latency ceiling (p95 < 1ms,
which no network request can satisfy). It is a fixed preset that can only
make the threshold **stricter** — there is deliberately no way to loosen or
disable an abort — so rehearsing needs no source edit and cannot leave a
weakened threshold behind.

**Procedure:**

1. Confirm your target resolves and is non-production:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' "$TARGET/api/health"
   ```
2. Start the **full** ramp with the rehearsal flag (full ramp, not a single
   stage — the point is to prove it stops *before* reaching 500 VUs):
   ```bash
   k6 run -e K6_TARGET_URL="$TARGET" -e K6_REHEARSE_ABORT=1 scripts/load/run-ramp.js
   ```
3. Watch the output.

**Expected observable outcome:**

- The run **stops during the first stage** (`s25`, within roughly the first
  10–30 seconds), never reaching the 50/100/250/500 stages.
- k6 prints a threshold-crossed line for `http_req_duration` and a message
  that the test was aborted by a failed threshold.
- k6 exits with a **non-zero exit code** (check with `echo $?`).
- The printed summary table shows requests only against the first stage;
  later stages are empty.

If instead the run climbs to 500 VUs and finishes normally, the abort path
is **not working** — stop and fix it before running a real ramp, because
the safety backstop is the only thing standing between a saturated target
and a ten-minute pile-on.

4. Re-run without the flag for the real measurement:
   ```bash
   k6 run -e K6_TARGET_URL="$TARGET" scripts/load/run-ramp.js
   ```
5. Record the rehearsal outcome in `CAPACITY-REPORT.md`'s "Abort rehearsal"
   section (date, that it fired, and at which stage).

---

## 5. Filling in the capacity report

After a completed run, `docs/observability/CAPACITY-REPORT.md` gets filled
in **by hand** from two sources.

**From k6** — the stdout table, and `scripts/load/last-run-summary.json`
(gitignored) which the run writes automatically:

- RPS, p50 / p95 / p99, 4xx, 5xx, timeouts — per ramp level.

**From the dashboards**, read for *the same wall-clock window as the run*
— k6 cannot supply any of these:

- Vercel: function invocations, throttles, estimated cost.
- Supabase: CPU %, memory %, DB connections, pooler connections,
  slow-query count delta (before vs. after).
- Any third-party failures (Resend, Stripe, Anthropic, DocuSeal) in the
  same window.

Then fill in the two conclusions the report exists to produce:

- **The real constraint** — the first ramp level that breached a stop
  condition, and *which* condition. This is the answer to "how many users
  can Funūn take?", and it must cite the measured run.
- **Do not** restate Vercel's ~30,000 function-execution figure as a
  simultaneous-user capacity. It is not one, and the report says so
  explicitly.

Replace every `UNMEASURED` cell you have a real number for. Leave the rest
as `UNMEASURED` — a blank is honest, a plausible guess is not, because
Plan 08's alert thresholds and Plan 10's monthly capacity report both cite
this document as measured evidence.

---

## 6. Known limitations — read before interpreting results

These are properties of the current harness, not of the app. Any report
generated from this harness must repeat them.

**The load generator is one IP, and two routes react to that:**

- `/api/signup/check-invite` is rate-limited to **5 requests per IP per 15
  minutes** (`lib/security/rate-limit.ts`). From roughly the sixth request
  of the entire run onward this route returns **429** and is measuring the
  rate limiter, not invite eligibility. Still a genuine database-pressure
  signal (each hit is one `check_rate_limit` RPC) — just not a measurement
  of the invite path.
- Distributed load from many IPs would behave differently. This harness
  does not simulate that.

**No route is exercised while authenticated:**

- `/api/buyer/catalog` returns **401** — measuring middleware plus the auth
  check's Supabase round-trip, not the catalogue query.
- `/dashboard`, `/vault`, `/green-room` **redirect** to `/signin` for an
  unauthenticated request, and k6 follows redirects, so the timing is
  "protected page + redirect + sign-in render", not the real authenticated
  page cost.
- **All authenticated-page numbers are therefore a lower bound.** Real
  logged-in traffic will be heavier. Carrying a seeded staging session per
  virtual user (a login flow plus per-VU cookie handling) is unbuilt work.

**Expected 4xx is not counted as failure.** `scenarios.js` narrows k6's
default "any status ≥ 400 is a failure" to 5xx and transport errors only —
otherwise the expected 401 and 429 above would peg the failure rate near
25% and abort stage 1 on every run. 4xx is tracked in its own column
instead.

**Threshold values are unvalidated.** `rate<0.05`, `p(95)<3000`,
`rate<0.10` are starting guesses chosen before any measurement existed.
Retune them from the first real baseline, and keep them consistent with
Plan 08's baseline-adjusted thresholds.

---

## 7. Files

| File | Role |
|---|---|
| `target.js` | Resolves `K6_TARGET_URL`; refuses production and anything unprovable. |
| `scenarios.js` | One request function per route, plus per-route metrics. |
| `run-ramp.js` | k6 entry point: the five-stage ramp, stop conditions, summary. |
| `target.test.ts` | Pins the production-refusal guard, including bypass attempts. |
| `no-runtime-import.test.ts` | Asserts `scripts/load` never enters the app bundle and k6 never enters `package.json`. |

The `.test.ts` files run under `npx jest scripts/load` and need neither k6
nor a network.

These scripts are **dev-only tooling**. They `require()` k6 built-ins
(`k6/http`, `k6/metrics`) that do not exist in Node or the browser, and
nothing in `app/` or `lib/` may import them.
