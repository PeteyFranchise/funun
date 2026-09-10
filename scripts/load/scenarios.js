'use strict'

const http = require('k6/http')
const { check, group } = require('k6')
const { Trend, Rate, Counter } = require('k6/metrics')

// ─── scripts/load/scenarios.js — per-route request functions (R7) ────────
// Phase 32 plan 09, Task 2. One function per high-traffic surface, each
// route below VERIFIED to exist in this repo by file inspection at
// authoring time (paths listed with each entry — check them before
// trusting a route name from the plan text).
//
// Route inventory — every path confirmed present:
//   catalogBrowse      GET  /sync/catalog               app/sync/catalog/page.tsx
//   signIn             GET  /signin                     app/(auth)/signin/page.tsx
//   inviteEligibility  POST /api/signup/check-invite     app/api/signup/check-invite/route.ts
//   dashboard          GET  /dashboard                  app/(artist)/dashboard/page.tsx
//   vaultReads         GET  /vault                      app/(artist)/vault/page.tsx
//   searchFilter       GET  /api/buyer/catalog?...       app/api/buyer/catalog/route.ts
//   greenRoomReads     GET  /green-room                 app/(artist)/green-room/page.tsx
//   health             GET  /api/health                 app/api/health/route.ts
//
// Route groups — `(auth)`, `(artist)` — do not appear in the URL, only in
// the file path; the paths above are the real, requestable URLs.
//
// ── WHAT THIS HARNESS ACTUALLY MEASURES (read before trusting a number) ──
// Two routes do NOT return 2xx for an unauthenticated load generator, and
// the resulting numbers must be read accordingly:
//
//   /api/buyer/catalog   → 401 Unauthorized (route.ts line ~23). Measures
//                          middleware + route entry + the auth check's own
//                          Supabase round-trip, NOT the catalogue query.
//   /api/signup/check-invite
//                        → 429 after 5 requests per IP per 15 minutes
//                          (lib/security/rate-limit.ts:
//                          RATE_LIMIT_MAX_ATTEMPTS = 5,
//                          RATE_LIMIT_WINDOW_MS = 15m). A load generator is
//                          ONE IP, so from roughly the sixth request of the
//                          whole run onward this route measures the RATE
//                          LIMITER (one check_rate_limit RPC), not invite
//                          eligibility. That is still a real, useful DB-
//                          pressure signal — it is just not a measurement
//                          of the invite path, and CAPACITY-REPORT.md must
//                          say so rather than quietly reporting it as one.
//
//   /dashboard, /vault, /green-room → middleware.ts redirects an
//                          unauthenticated request (NextResponse.redirect,
//                          middleware.ts:50). k6 follows redirects by
//                          default, so the measured timing is
//                          "protected page + redirect + /signin render",
//                          not the authenticated page's real cost.
//
// Carrying a real seeded staging session per VU (a login flow plus
// per-VU cookie-jar management) is genuine additional work that this plan
// does not scope. Until that exists, the authenticated-page numbers are a
// LOWER BOUND on real cost, and the report must label them as such.
//
// Each function takes the ALREADY-GUARDED baseUrl that run-ramp.js
// resolved via target.js's resolveTarget() — no function in this file ever
// reads an env var or a hostname itself, so the production-hostname guard
// has exactly one call site to reason about.

// ─── failure semantics ──────────────────────────────────────────────────
// k6's BUILT-IN http_req_failed defaults to "status >= 400 is a failure".
// With an expected 401 on /api/buyer/catalog and an expected 429 on
// /api/signup/check-invite, that default puts the failure rate around 25%
// from the very first iteration — which would trip run-ramp.js's
// `rate<0.05` abortOnFail threshold and kill the ramp seconds into stage 1
// on EVERY run, for reasons that have nothing to do with capacity.
//
// So we redefine failure for this harness: only a 5xx or a transport-level
// error (status 0 — timeout, connection reset, DNS) counts. Expected 4xx
// is tracked separately in its own metric, which is what feeds the capacity
// report's 4xx column. This makes the abort threshold mean "the target is
// actually breaking", which is the stop condition R7 wants.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }))

// ─── metrics ────────────────────────────────────────────────────────────
// Per-route Trend (latency distribution) + Rate (5xx/transport failure),
// plus run-wide status-class counters that CAPACITY-REPORT.md's 4xx / 5xx /
// timeout columns are read from. All are tagged with the ramp stage by
// run-ramp.js so the per-stage table is genuine per-stage data.
function routeMetrics(name) {
  return {
    duration: new Trend(`route_${name}_duration`, true),
    failed: new Rate(`route_${name}_failed`),
  }
}

const ROUTE_NAMES = [
  'catalog_browse',
  'sign_in',
  'invite_eligibility',
  'dashboard',
  'vault_reads',
  'search_filter',
  'green_room_reads',
  'health',
]

const metrics = ROUTE_NAMES.reduce((acc, name) => {
  acc[name] = routeMetrics(name)
  return acc
}, {})

// Run-wide status-class breakdown (the report's 4xx / 5xx / timeout cells).
const status4xx = new Counter('status_4xx')
const status5xx = new Counter('status_5xx')
const statusTimeout = new Counter('status_timeout')

// /api/health returns 503 when its Supabase probe fails or times out
// (app/api/health/route.ts's documented 200-healthy / 503-degraded
// contract). That makes it the ONE database-pressure signal k6 can observe
// directly from inside the run — run-ramp.js puts an abortOnFail threshold
// on this Rate, so the ramp stops when the DB starts failing its health
// probe rather than continuing to pile load onto a struggling database.
const healthDegraded = new Rate('health_degraded')

// Records one response against its route's metrics.
// `stage` (e.g. "s25") is tagged onto the request itself by the caller, so
// http_req_duration/http_req_failed submetrics exist per stage.
function record(routeName, res) {
  const m = metrics[routeName]
  const status = res.status

  // status 0 = k6 never got an HTTP response (timeout, reset, DNS).
  const timedOut = status === 0
  const serverError = status >= 500
  const clientError = status >= 400 && status < 500

  if (timedOut) statusTimeout.add(1)
  if (serverError) status5xx.add(1)
  if (clientError) status4xx.add(1)

  // A failure, for abort purposes, is a broken target — not an expected
  // 401/429. See the "failure semantics" note above.
  const failed = timedOut || serverError
  m.duration.add(res.timings.duration)
  m.failed.add(failed)

  check(res, {
    [`${routeName}: responded`]: (r) => r.status > 0,
    [`${routeName}: not a 5xx`]: (r) => r.status < 500,
  })

  return res
}

function tagsFor(routeName, stage) {
  return stage ? { route: routeName, stage } : { route: routeName }
}

function catalogBrowse(baseUrl, stage) {
  return group('catalog_browse', () => {
    const res = http.get(`${baseUrl}/sync/catalog`, { tags: tagsFor('catalog_browse', stage) })
    return record('catalog_browse', res)
  })
}

function signIn(baseUrl, stage) {
  return group('sign_in', () => {
    const res = http.get(`${baseUrl}/signin`, { tags: tagsFor('sign_in', stage) })
    return record('sign_in', res)
  })
}

// Mirrors app/api/signup/check-invite/route.ts's POST {email} contract.
// Uses a synthetic per-iteration address on the reserved-by-RFC-2606
// `.invalid` TLD — never a real address — so repeated runs can never
// collide with a genuine invite/waitlist row or reach a real inbox.
// Expect 429 for nearly the whole run; see the rate-limiter note above.
function inviteEligibility(baseUrl, stage) {
  return group('invite_eligibility', () => {
    const email = `k6-loadtest+vu${__VU}-iter${__ITER}@example.invalid`
    const payload = JSON.stringify({ email })
    const params = {
      headers: { 'Content-Type': 'application/json' },
      tags: tagsFor('invite_eligibility', stage),
    }
    const res = http.post(`${baseUrl}/api/signup/check-invite`, payload, params)
    return record('invite_eligibility', res)
  })
}

function dashboard(baseUrl, stage) {
  return group('dashboard', () => {
    const res = http.get(`${baseUrl}/dashboard`, { tags: tagsFor('dashboard', stage) })
    return record('dashboard', res)
  })
}

function vaultReads(baseUrl, stage) {
  return group('vault_reads', () => {
    const res = http.get(`${baseUrl}/vault`, { tags: tagsFor('vault_reads', stage) })
    return record('vault_reads', res)
  })
}

// Mirrors app/api/buyer/catalog/route.ts's GET query-param filter contract
// (genre/mood/energy/vocal/usageCleared/key/bpmMin/bpmMax/page).
// Expect 401 unauthenticated; see the note above.
function searchFilter(baseUrl, stage) {
  return group('search_filter', () => {
    const res = http.get(`${baseUrl}/api/buyer/catalog?genre=pop&page=1`, {
      tags: tagsFor('search_filter', stage),
    })
    return record('search_filter', res)
  })
}

function greenRoomReads(baseUrl, stage) {
  return group('green_room_reads', () => {
    const res = http.get(`${baseUrl}/green-room`, { tags: tagsFor('green_room_reads', stage) })
    return record('green_room_reads', res)
  })
}

// /api/health (Plan 03) — 200 healthy / 503 degraded. Every hit runs one
// real read-only Supabase query on the target, so this route doubles as
// the harness's database-pressure probe (see healthDegraded above).
function health(baseUrl, stage) {
  return group('health', () => {
    const res = http.get(`${baseUrl}/api/health`, { tags: tagsFor('health', stage) })
    healthDegraded.add(res.status !== 200)
    return record('health', res)
  })
}

// Runs every route once, in the order listed above. run-ramp.js's default
// (per-iteration) function calls this once per VU iteration.
function allRoutes(baseUrl, stage) {
  catalogBrowse(baseUrl, stage)
  signIn(baseUrl, stage)
  inviteEligibility(baseUrl, stage)
  dashboard(baseUrl, stage)
  vaultReads(baseUrl, stage)
  searchFilter(baseUrl, stage)
  greenRoomReads(baseUrl, stage)
  health(baseUrl, stage)
}

module.exports = {
  ROUTE_NAMES,
  metrics,
  catalogBrowse,
  signIn,
  inviteEligibility,
  dashboard,
  vaultReads,
  searchFilter,
  greenRoomReads,
  health,
  allRoutes,
}
