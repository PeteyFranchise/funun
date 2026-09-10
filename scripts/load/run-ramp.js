'use strict'

const { sleep } = require('k6')
const exec = require('k6/execution')
const { resolveTarget } = require('./target.js')
const { allRoutes } = require('./scenarios.js')

// ─── scripts/load/run-ramp.js — k6 entry point: ramp orchestrator (R7) ───
// Phase 32 plan 09, Task 2. Ramps 25 → 50 → 100 → 250 → 500 concurrent VUs
// across every high-traffic route (scenarios.js) against a non-production
// target ONLY (target.js's resolveTarget() throws for a production
// hostname — this file never bypasses that). Enforces mid-run
// `abortOnFail` stop conditions so an unsafe run halts before reaching the
// final stage, per R7's covered+backstop edge requirement.
//
// Invocation (see README.md for the full walkthrough):
//   k6 run -e K6_TARGET_URL=https://<preview>.vercel.app scripts/load/run-ramp.js
//
// NEVER `npm install`'d or added to package.json — k6 is a standalone Go
// binary (brew/Docker), and this file is only ever invoked via `k6 run`,
// never `require()`d/`import`ed by app/ or lib/ (enforced by
// scripts/load/no-runtime-import.test.ts).
//
// ── STATUS: AUTHORED, NEVER RUN ────────────────────────────────────────
// As of this commit this harness has never been executed. k6 is not
// installed and no staging Supabase project / Preview deploy exists yet.
// Every number in docs/observability/CAPACITY-REPORT.md is therefore
// UNMEASURED, and the threshold values below are UNVALIDATED starting
// guesses, not baselines. See README.md's owner-setup section.

// resolveTarget() runs once per VU's init context (k6 re-executes each
// script's top-level/init code per VU) — cheap, pure env-var read, safe to
// call unconditionally. If K6_TARGET_URL is unset or points at production,
// this throws immediately and k6 fails the run before a single request is
// sent — the guard applies before ANY traffic reaches ANY target.
const BASE_URL = resolveTarget()

// ─── stage plan ─────────────────────────────────────────────────────────
// Each stage's `label` doubles as a k6 tag value, used below to register
// per-stage submetrics (http_req_duration{stage:sXX}, etc.) so
// handleSummary can emit a genuine per-stage capacity row — not just one
// aggregate number for the whole ramp.
const STAGE_DURATION = '2m'
const STAGE_DURATION_SECONDS = 120
const STAGES = [
  { label: 's25', target: 25 },
  { label: 's50', target: 50 },
  { label: 's100', target: 100 },
  { label: 's250', target: 250 },
  { label: 's500', target: 500 },
]

// ─── stop conditions ────────────────────────────────────────────────────
// Three REAL, run-aborting thresholds (abortOnFail: true). Any one of them
// tripping kills the whole ramp mid-run rather than letting it climb to
// 500 VUs against a target that is already failing:
//
//   http_req_failed   — 5xx / transport errors only. scenarios.js narrows
//                       k6's default "4xx counts as failed" via
//                       setResponseCallback, because an expected 401 on
//                       /api/buyer/catalog and an expected 429 on
//                       /api/signup/check-invite would otherwise pin the
//                       failure rate near 25% and abort stage 1 every run.
//   http_req_duration — p95 latency ceiling.
//   health_degraded   — /api/health returning non-200, i.e. its Supabase
//                       probe is failing. This is the DATABASE-PRESSURE
//                       stop condition: it aborts when the DB starts
//                       failing health checks instead of piling 500 VUs
//                       onto a struggling database.
//
// ── What k6 CANNOT abort on (owner-watched manual stop conditions) ──────
// k6 sees only HTTP responses. It cannot see Supabase CPU/memory, DB or
// pooler connection counts, Vercel invocation throttling, or spend. Those
// four are MANUAL stop conditions: the owner watches the Supabase and
// Vercel dashboards during the run and hits Ctrl-C. Do not read the
// presence of thresholds here as automated protection against a cost
// blowout or connection exhaustion — it is not. README.md's run procedure
// says which dashboards to have open.
//
// These numeric values are UNVALIDATED starting guesses (no run has ever
// happened). After the first measured ramp, retune them from the observed
// baseline and keep them in step with Plan 08's baseline-adjusted
// threshold column.
const ABORT_ERROR_RATE = 'rate<0.05'
const ABORT_P95_MS = 'p(95)<3000'
const ABORT_HEALTH_DEGRADED_RATE = 'rate<0.10'

// ── Abort rehearsal (`-e K6_REHEARSE_ABORT=1`) ─────────────────────────
// R7 requires PROOF that the mid-run stop condition actually fires before
// the final stage — a threshold that has never fired is a threshold you do
// not know works. This flag swaps in a deliberately impossible latency
// ceiling (p95 < 1ms, which no network request can ever satisfy) so the
// run aborts during the FIRST stage, demonstrating the abort path end to
// end against the real target.
//
// It is a fixed preset, not a free-form value, ON PURPOSE: it can only
// ever make the stop condition STRICTER. There is deliberately no env var
// that loosens or disables an abort threshold, because that would be a
// foot-gun whose failure mode is "the ramp did not stop when it should
// have". Rehearsing therefore needs no source edit, and so carries no risk
// of a tightened-or-disabled threshold being accidentally committed.
const REHEARSE_ABORT =
  typeof __ENV !== 'undefined' && __ENV && String(__ENV.K6_REHEARSE_ABORT || '') === '1'
const REHEARSAL_P95_MS = 'p(95)<1'

// Builds the `thresholds` object: the three aborting stop conditions
// above, plus one registration-only, non-aborting threshold per stage per
// metric so k6 tracks (and handleSummary can read) a per-stage breakdown.
// The per-stage thresholds are intentionally always-true (e.g.
// `count>=0`) — their sole purpose is telling k6 "materialize this tagged
// submetric," not gating anything themselves; only the three overall,
// untagged thresholds ever carry abortOnFail.
function buildThresholds() {
  const thresholds = {
    http_req_failed: [{ threshold: ABORT_ERROR_RATE, abortOnFail: true }],
    http_req_duration: [
      { threshold: REHEARSE_ABORT ? REHEARSAL_P95_MS : ABORT_P95_MS, abortOnFail: true },
    ],
    health_degraded: [{ threshold: ABORT_HEALTH_DEGRADED_RATE, abortOnFail: true }],
  }

  for (const stage of STAGES) {
    // Non-aborting — pure submetric registration for the per-stage table.
    thresholds[`http_req_duration{stage:${stage.label}}`] = ['p(95)<600000']
    thresholds[`http_req_failed{stage:${stage.label}}`] = ['rate<=1']
    thresholds[`http_reqs{stage:${stage.label}}`] = ['count>=0']
    thresholds[`status_4xx{stage:${stage.label}}`] = ['count>=0']
    thresholds[`status_5xx{stage:${stage.label}}`] = ['count>=0']
    thresholds[`status_timeout{stage:${stage.label}}`] = ['count>=0']
  }

  return thresholds
}

// ── Running ONE ramp level instead of the whole ramp ────────────────────
// `-e K6_ONLY_STAGE=100` runs a single flat stage at that VU count (useful
// for re-measuring one tier, or for the abort rehearsal without waiting
// through four earlier stages). Unset = the full five-stage ramp.
function selectedStages() {
  const only =
    typeof __ENV !== 'undefined' && __ENV && __ENV.K6_ONLY_STAGE ? String(__ENV.K6_ONLY_STAGE) : ''
  if (!only) return STAGES
  const match = STAGES.filter((s) => String(s.target) === only.trim())
  if (match.length === 0) {
    throw new Error(
      `K6_ONLY_STAGE="${only}" is not one of the ramp levels ` +
        `(${STAGES.map((s) => s.target).join(', ')}).`
    )
  }
  return match
}

const ACTIVE_STAGES = selectedStages()

module.exports.options = {
  scenarios: {
    capacity_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: ACTIVE_STAGES.map((s) => ({ duration: STAGE_DURATION, target: s.target })),
      gracefulRampDown: '30s',
    },
  },
  // p50/p95/p99 all present in the end-of-test summary (k6's default
  // summaryTrendStats omits p(99)) — CAPACITY-REPORT.md's columns need all
  // three.
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  thresholds: buildThresholds(),
}

// Computes the current stage label from elapsed test-run time, so every
// request this iteration issues can be tagged with the ramp level it
// actually ran at (not the VU count alone — VUs ramp gradually within a
// stage, but elapsed time maps cleanly onto the active stage list).
// Defensive: if `k6/execution`'s `instance.currentTestRunDuration` is ever
// unavailable (older k6 version, or a future breaking rename) this
// degrades to the first stage rather than throwing — a harness that
// mis-labels a stage tag is far better than one that crashes mid-ramp.
function currentStageLabel() {
  try {
    const elapsedMs = exec.instance.currentTestRunDuration
    const index = Math.min(
      Math.floor(elapsedMs / (STAGE_DURATION_SECONDS * 1000)),
      ACTIVE_STAGES.length - 1
    )
    return ACTIVE_STAGES[Math.max(index, 0)].label
  } catch {
    return ACTIVE_STAGES[0].label
  }
}

module.exports.default = function () {
  allRoutes(BASE_URL, currentStageLabel())
  sleep(1)
}

// ─── capacity summary (per-stage) ──────────────────────────────────────
// Emits BOTH a human-readable stdout table and a JSON artifact
// (scripts/load/last-run-summary.json, gitignored) that
// CAPACITY-REPORT.md is filled in from once a real run exists. This is the
// summary MACHINERY only — it has never been executed against a live
// target, so no numbers are fabricated anywhere in this repo.
function metricValue(data, name, path, fallback) {
  const metric = data && data.metrics ? data.metrics[name] : undefined
  if (!metric || !metric.values) return fallback
  const value = metric.values[path]
  return value === undefined ? fallback : value
}

function renderCapacityTable(rows) {
  const header =
    '| VUs | RPS | p50 (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Timeouts | Failed rate | Requests |\n' +
    '|-----|-----|----------|----------|----------|-----|-----|----------|-------------|----------|'
  const body = rows
    .map(
      (r) =>
        `| ${r.vus} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.count4xx} | ${r.count5xx} | ` +
        `${r.timeouts} | ${r.failedRate} | ${r.reqCount} |`
    )
    .join('\n')
  return `${header}\n${body}\n`
}

module.exports.handleSummary = function (data) {
  const rows = ACTIVE_STAGES.map((stage) => {
    const reqCount = metricValue(data, `http_reqs{stage:${stage.label}}`, 'count', 0)
    const rps = reqCount > 0 ? (reqCount / STAGE_DURATION_SECONDS).toFixed(1) : '0.0'
    return {
      vus: stage.target,
      stage: stage.label,
      rps,
      p50: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'med', 'n/a'),
      p95: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'p(95)', 'n/a'),
      p99: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'p(99)', 'n/a'),
      count4xx: metricValue(data, `status_4xx{stage:${stage.label}}`, 'count', 'n/a'),
      count5xx: metricValue(data, `status_5xx{stage:${stage.label}}`, 'count', 'n/a'),
      timeouts: metricValue(data, `status_timeout{stage:${stage.label}}`, 'count', 'n/a'),
      failedRate: metricValue(data, `http_req_failed{stage:${stage.label}}`, 'rate', 'n/a'),
      reqCount,
    }
  })

  const table = renderCapacityTable(rows)
  const summaryJson = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      target: BASE_URL,
      note:
        'k6-observable metrics only. Vercel invocations/throttles, Supabase CPU/memory, ' +
        'DB + pooler connections, slow-query deltas and cost must be read off the Vercel and ' +
        'Supabase dashboards for the same wall-clock window and entered by hand.',
      stages: rows,
    },
    null,
    2
  )

  return {
    stdout:
      `\nCapacity ramp summary (${ACTIVE_STAGES.map((s) => s.target).join(' -> ')} VUs)\n\n` +
      `${table}\n` +
      'Columns k6 CANNOT fill (read them off the dashboards for the same window):\n' +
      '  Vercel invocations + throttles, Supabase CPU/memory, DB + pooler connections,\n' +
      '  slow-query deltas, third-party failures, estimated cost.\n\n' +
      'Full k6 metrics: scripts/load/last-run-summary.json\n' +
      'Transcribe into: docs/observability/CAPACITY-REPORT.md\n',
    'scripts/load/last-run-summary.json': summaryJson,
  }
}
