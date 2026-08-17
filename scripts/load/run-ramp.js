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
// never `require()`d/`import`ed by app/ or lib/ (RESEARCH Pitfall 4).

// resolveTarget() runs once per VU's init context (k6 re-executes each
// script's top-level/init code per VU) — cheap, pure env-var read, safe to
// call unconditionally. If K6_TARGET_URL is unset or points at production,
// this throws immediately and k6 fails the run before a single request is
// sent — the guard applies before ANY traffic reaches ANY target.
const BASE_URL = resolveTarget()

// ─── stage plan (RESEARCH Pattern 5, CITED against k6.io ramping-vus) ────
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

// Builds the `thresholds` object: the two REAL, run-aborting stop
// conditions (overall http_req_failed / http_req_duration, abortOnFail:
// true — the mid-run safety backstop R7 requires), plus one
// registration-only, non-aborting threshold per stage per metric so k6
// tracks (and handleSummary can read) a per-stage breakdown. The
// per-stage thresholds are intentionally unreachable-false (e.g.
// `count>=0`) — their sole purpose is telling k6 "materialize this tagged
// submetric," not gating anything themselves; only the two overall,
// untagged thresholds ever carry abortOnFail.
function buildThresholds() {
  const thresholds = {
    // Overall stop conditions — abort the WHOLE ramp mid-run if either
    // trips, at ANY stage. Values are intentionally conservative for a
    // dev-only staging target; the owner tunes these per Plan 08's
    // baseline-adjusted thresholds once real data exists (Task 4,
    // deferred in this draft — see 32-09-DRAFT.md).
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true }],
  }

  for (const stage of STAGES) {
    // Non-aborting — pure submetric registration for the per-stage table.
    thresholds[`http_req_duration{stage:${stage.label}}`] = ['p(95)<600000']
    thresholds[`http_req_failed{stage:${stage.label}}`] = ['rate<=1']
    thresholds[`http_reqs{stage:${stage.label}}`] = ['count>=0']
  }

  return thresholds
}

module.exports.options = {
  scenarios: {
    capacity_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STAGES.map((s) => ({ duration: STAGE_DURATION, target: s.target })),
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
// stage, but elapsed time maps cleanly onto STAGES). Defensive: if
// `k6/execution`'s `instance.currentTestRunDuration` is ever unavailable
// (older k6 version, or a future breaking rename) this degrades to the
// first stage rather than throwing — a harness that mis-labels a stage
// tag is far better than one that crashes mid-ramp (best-effort,
// never-throws helper, per repo convention).
function currentStageLabel() {
  try {
    const elapsedMs = exec.instance.currentTestRunDuration
    const index = Math.min(Math.floor(elapsedMs / (STAGE_DURATION_SECONDS * 1000)), STAGES.length - 1)
    return STAGES[Math.max(index, 0)].label
  } catch {
    return STAGES[0].label
  }
}

module.exports.default = function () {
  allRoutes(BASE_URL, currentStageLabel())
  sleep(1)
}

// ─── capacity summary (per-stage) ──────────────────────────────────────
// Emits BOTH a human-readable stdout table and a JSON artifact
// (scripts/load/last-run-summary.json, gitignored — see .gitignore) that
// Task 4's CAPACITY-REPORT.md is written from once a real run exists. This
// draft ships the summary machinery; it has never been executed against a
// live target (no k6 install, no staging target yet — see
// 32-09-DRAFT.md), so no numbers are fabricated here.
function metricValue(data, name, path, fallback) {
  const metric = data && data.metrics ? data.metrics[name] : undefined
  if (!metric || !metric.values) return fallback
  const value = metric.values[path]
  return value === undefined ? fallback : value
}

function renderCapacityTable(rows) {
  const header =
    '| VUs | RPS | p50 (ms) | p95 (ms) | p99 (ms) | Failed rate | Requests |\n' +
    '|-----|-----|----------|----------|----------|-------------|----------|'
  const body = rows
    .map(
      (r) =>
        `| ${r.vus} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.failedRate} | ${r.reqCount} |`
    )
    .join('\n')
  return `${header}\n${body}\n`
}

module.exports.handleSummary = function (data) {
  const rows = STAGES.map((stage) => {
    const reqCount = metricValue(data, `http_reqs{stage:${stage.label}}`, 'count', 0)
    const rps = reqCount > 0 ? (reqCount / STAGE_DURATION_SECONDS).toFixed(1) : '0.0'
    return {
      vus: stage.target,
      stage: stage.label,
      rps,
      p50: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'med', 'n/a'),
      p95: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'p(95)', 'n/a'),
      p99: metricValue(data, `http_req_duration{stage:${stage.label}}`, 'p(99)', 'n/a'),
      failedRate: metricValue(data, `http_req_failed{stage:${stage.label}}`, 'rate', 'n/a'),
      reqCount,
    }
  })

  const table = renderCapacityTable(rows)
  const summaryJson = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      target: BASE_URL,
      stages: rows,
    },
    null,
    2
  )

  return {
    stdout: `\nCapacity ramp summary (25 -> 500 VUs)\n\n${table}\n` +
      'Full k6 metrics: scripts/load/last-run-summary.json\n',
    'scripts/load/last-run-summary.json': summaryJson,
  }
}
