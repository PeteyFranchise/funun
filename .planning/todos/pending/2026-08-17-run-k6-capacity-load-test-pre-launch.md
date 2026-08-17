---
created: 2026-08-17T00:00:00Z
title: Run k6 capacity load test (Phase 32-09) — deferred to pre-launch
area: ops
files:
  - scripts/load/README.md
  - scripts/load/run-ramp.js
  - scripts/load/target.js
  - .planning/phases/32-production-observability-capacity-incident-readiness/32-09-DRAFT.md
  - docs/observability/CAPACITY-REPORT.md (to be written FROM the run — does not exist yet)
---

## Status (2026-08-17)

Harness is **built + safety-verified + k6 installed**. Only the actual capacity RUN is deferred —
owner decision 2026-08-17: defer to pre-launch (same posture as the `/api/health` Better Stack
monitor and the 1-min uptime interval — build now, run just before a launch/invite batch when the
numbers inform a real go/no-go).

**Done today:**
- [x] `brew install k6` → **k6 v2.2.0** installed locally and working (`k6 version`).
- [x] Production-hostname guard verified end-to-end (`scripts/load/target.js`, Node unit-style check):
      refuses unset target, refuses `funun.studio` + `www.funun.studio`, accepts `*.vercel.app`.
      All 4 cases correct — the harness cannot be pointed at production.

## Remaining to run (resume here)

1. **Staging Supabase** — create a free `funun-staging` project (region = match prod).
2. **Schema** — push all 113 migrations to it. Use `supabase db push --db-url <staging-conn-string>`
   so the existing prod link (`wgfjakfiyeewzfuxkgyo`) is left untouched. (Owner runs `db push`.)
3. **Seed** — only the **public catalogue** (`/sync/catalog`) needs representative rows. The harness
   is UNAUTHENTICATED, so the auth-gated routes (dashboard / vault / green-room / `/api/buyer/catalog`)
   just 401/redirect and never exercise real query cost — a focused catalogue seed is enough, NOT a
   full 113-migration-schema seed.
4. **Preview → staging** — branch-scoped Vercel env vars overriding `NEXT_PUBLIC_SUPABASE_URL` +
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ `SUPABASE_SERVICE_ROLE_KEY`) to the staging project; deploy a
   preview. (Prod Preview env currently shares the PROD Supabase — must be overridden, D-11.)
5. **Run** — `k6 run -e K6_TARGET_URL=https://<preview>.vercel.app scripts/load/run-ramp.js`
   (25→50→100→250→500 VUs, ~10 min). Capture alongside k6's output: Vercel invocations/throttles +
   Supabase CPU/mem/connections/slow-query deltas + estimated cost.
6. **Abort rehearsal** — temporarily tighten one overall threshold to an unreachable value (e.g.
   `http_req_duration: p(95)<1`), confirm k6 halts mid-ramp before s500, then REVERT (procedure in
   `scripts/load/README.md`).
7. **Report** — write `docs/observability/CAPACITY-REPORT.md` from the measured numbers (Task 4).
   Never fabricated — the file must not exist until a real run produces the data.

## Scope note — what this run measures
Public front-door capacity: catalogue browse + signup-eligibility (`/api/signup/check-invite`) +
`/api/health` + middleware/auth-reject cost, at 25→500 concurrent. That IS the launch-spike surface
(everyone hitting the public catalogue + signing up at once). Authenticated in-app load needs a
per-VU seeded staging session (login flow + cookie jar) — a documented later harness enhancement,
not this run.
