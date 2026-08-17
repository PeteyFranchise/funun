'use strict'

const http = require('k6/http')
const { check, group } = require('k6')
const { Trend, Rate } = require('k6/metrics')

// ─── scripts/load/scenarios.js — per-route request functions (R7) ────────
// Phase 32 plan 09, Task 2. One function per high-traffic surface found by
// code inspection (see 32-RESEARCH.md's route inventory + the PLAN's Task 2
// description): public catalogue browsing, sign-in page, invite-eligibility
// check, authenticated dashboard, vault/project reads, search/filter, Green
// Room reads, plus /api/health (Plan 03) since run-ramp.js polls it too.
//
// Route inventory (verified against the live route tree at plan-execution
// time):
//   catalogBrowse      GET  /sync/catalog                  app/sync/catalog/page.tsx
//   signIn             GET  /signin                        app/(auth)/signin/page.tsx
//   inviteEligibility  POST /api/signup/check-invite        app/api/signup/check-invite/route.ts
//   dashboard          GET  /dashboard                     app/(artist)/dashboard/page.tsx
//   vaultReads         GET  /vault                          app/(artist)/vault/page.tsx
//   searchFilter       GET  /api/buyer/catalog?...           app/api/buyer/catalog/route.ts
//   greenRoomReads     GET  /green-room                     app/(artist)/green-room/page.tsx
//   health             GET  /api/health                     app/api/health/route.ts
//
// Route groups — `(auth)`, `(artist)` — do not appear in the URL, only in
// the file path; the paths above are the real, requestable URLs.
//
// Authenticated-route caveat: /dashboard, /vault, and /api/buyer/catalog
// all require a signed-in Supabase session (session cookie). This harness
// intentionally does NOT carry one — provisioning + injecting a seeded
// staging session into a k6 VU is real additional work (a login flow plus
// cookie-jar management per VU) that the plan scopes to a future harness
// enhancement, not this draft. Hitting these routes unauthenticated still
// exercises the real middleware + route + (for /api/buyer/catalog) auth
// check cost at the DB/pooler level — a legitimate, if partial, capacity
// signal — and each `check()` below only asserts "responded, not a 5xx",
// never a 2xx, precisely so an expected 401/redirect does not itself count
// as a load-test failure. See README.md's "Authenticated coverage" note.
//
// Each function below takes the ALREADY-GUARDED baseUrl that run-ramp.js
// resolved via target.js's resolveTarget() — no function in this file ever
// reads an env var or a hostname itself, so the production-hostname guard
// has exactly one call site to reason about.

// ─── per-route custom metrics ──────────────────────────────────────────
// A Trend (response-time distribution) + Rate (failure rate) pair per
// route, so run-ramp.js's handleSummary can report per-route AND overall
// numbers at each ramp stage — this is what CAPACITY-REPORT.md's per-route
// breakdown (Task 4, deferred) will read from.
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

// Records the outcome of one request against its route's metric pair.
// `stage` (e.g. "s25") is an optional tag propagated onto BOTH the request
// itself (so http_req_duration/http_req_failed submetrics exist per stage,
// which run-ramp.js's thresholds register — see run-ramp.js) and this
// route's own custom Trend/Rate, giving a per-route-per-stage breakdown.
//
// Deliberately asserts only "responded" + "not a 5xx" — a 401/redirect on
// an unauthenticated hit to an auth-gated route (see caveat above) is
// EXPECTED and must not itself abort the ramp or pollute the failure rate;
// abort decisions live entirely in run-ramp.js's `thresholds`
// (http_req_failed / http_req_duration), not in per-scenario assertions.
function record(routeName, res) {
  const m = metrics[routeName]
  const ok = check(res, {
    [`${routeName}: responded`]: (r) => r.status > 0,
    [`${routeName}: not a 5xx`]: (r) => r.status < 500,
  })
  m.duration.add(res.timings.duration)
  m.failed.add(!ok)
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
// Uses a synthetic, obviously-fake per-iteration email — never a real
// address — so repeated runs never collide with a genuine invite/waitlist
// row and never spam a real inbox.
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

function health(baseUrl, stage) {
  return group('health', () => {
    const res = http.get(`${baseUrl}/api/health`, { tags: tagsFor('health', stage) })
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
