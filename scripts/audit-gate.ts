#!/usr/bin/env node
// ─── Audit gate ──────────────────────────────────────────────────────────
// `npm audit --audit-level=high` exits 1 on `main` today — the whole repo's
// CI `validate` job is red, blocking every PR regardless of what it touches
// (F1). The root cause is `braces` (GHSA-vfj7-8cjw-p6xm): 3.0.3 is both the
// installed AND the latest published version, so there is no patched range
// to upgrade to. npm's only offered fix is `isSemVerMajor` — a Tailwind
// 3.4 -> 4.3.3 rewrite (F2) — which is not an acceptable "audit fix." All 7
// flagged packages are devDependencies-only; `npm audit --omit=dev
// --audit-level=moderate` already reports zero vulnerabilities (F1), so
// none of this reaches the deployed bundle.
//
// This script replaces the blanket `--audit-level=high` step with a
// dependency-free gate that applies the severity threshold itself (so no
// npm flag decides it — D-06) and carries a short list of dated, justified,
// self-expiring DEFERRALS. "Deferral" names what this is precisely: the
// entry's authority comes from a human-asserted reason AND an enforced
// expiry date — past that date it stops suppressing and the build goes red
// again on its own security merits. A time-bounded suspension on the
// record is a different claim than permanent permission would be. See
// `label-integrity-funun`.
//
// The one subtlety that makes a naive implementation look finished while
// leaving CI red: `npm audit --json`'s `via` array is MIXED. Exactly one of
// the 7 flagged packages (`braces`) carries the advisory object directly;
// the other six reach it only by following a `via` STRING back into another
// key of `vulnerabilities`, recursively, up to 5 hops
// (`eslint-config-next -> @next/eslint-plugin-next -> fast-glob ->
// micromatch -> braces -> GHSA-vfj7-8cjw-p6xm`). A gate that matches the
// GHSA against advisory objects only would suppress `braces` alone and
// still fail CI on the other six (F4). `resolveAdvisories` below walks that
// graph with a cycle guard.
//
// A second subtlety: `npm audit --json` EXITS 1 whenever vulnerabilities
// exist, while still writing valid JSON to stdout (F6). Exit code alone
// cannot distinguish "found vulnerabilities" (normal) from "registry
// unreachable, no parseable output" (a real failure) — see D-05. This
// script treats only the latter as fatal.
//
// CLI:
//   npx tsx scripts/audit-gate.ts
//     Runs `npm audit --json`, evaluates it against AUDIT_DEFERRALS at
//     threshold "high", prints every unsuppressed advisory / expired
//     deferral / invalid deferral / stale deferral, and exits 1 if there is
//     anything the build should fail on, else 0.

import { execFileSync } from 'node:child_process'

// ─── Types ────────────────────────────────────────────────────────────────

export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical'

// Shape of `npm audit --json` (auditReportVersion: 2), trimmed to the
// fields this script reads (F3).
export type AuditAdvisory = {
  source: number
  name: string
  dependency: string
  title: string
  url: string
  severity: Severity
  range: string
}

export type AuditViaEntry = AuditAdvisory | string

export type AuditVulnerability = {
  name: string
  severity: Severity
  isDirect: boolean
  via: AuditViaEntry[]
  effects: string[]
  range: string
}

export type AuditReport = {
  auditReportVersion?: number
  vulnerabilities: Record<string, AuditVulnerability>
  metadata?: unknown
}

// A DEFERRAL (D-01): a dated, justified, self-expiring suspension of ONE
// advisory, recorded with a reason and an approver. Past `expires` it
// simply stops suppressing — the build goes red again by design (D-02).
export type AuditDeferral = {
  advisory: string // GHSA id, e.g. "GHSA-vfj7-8cjw-p6xm"
  package: string // the package the advisory originates in, e.g. "braces"
  reason: string
  approvedBy: string
  approvedOn: string // YYYY-MM-DD
  expires: string // YYYY-MM-DD
}

export type DeferralClassification = 'active' | 'expired' | 'invalid-date'

export type EvaluateResult = {
  failures: Array<{ package: string; advisory: AuditAdvisory }>
  staleDeferrals: AuditDeferral[]
  expiredDeferrals: AuditDeferral[]
  invalidDeferrals: AuditDeferral[]
}

// ─── The one committed deferral ─────────────────────────────────────────

export const AUDIT_DEFERRALS: readonly AuditDeferral[] = [
  {
    advisory: 'GHSA-vfj7-8cjw-p6xm',
    package: 'braces',
    reason:
      'braces 3.0.3 is simultaneously the installed version and the latest version ' +
      'published to npm, so no upstream patch exists for the vulnerable range (<=3.0.3). ' +
      "npm's only offered fix is a semver-major upgrade to tailwindcss 4.3.3, which would " +
      'rewrite tailwind.config.ts and the design tokens defined there. The entire chain ' +
      '(braces, chokidar, micromatch, fast-glob, @next/eslint-plugin-next, ' +
      'eslint-config-next, tailwindcss) is devDependencies-only -- `npm audit --omit=dev ' +
      '--audit-level=moderate` reports zero vulnerabilities, so none of this reaches the ' +
      'deployed bundle.',
    approvedBy: 'Pete Zora (repo owner)',
    approvedOn: '2026-10-03',
    expires: '2026-11-02',
  },
]

// ─── Severity threshold (D-06 — applied in our code, not via npm's flag) ──

const SEVERITY_ORDER: readonly Severity[] = ['info', 'low', 'moderate', 'high', 'critical']

function severityAtLeast(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold)
}

// ─── Advisory resolution (F4 — the load-bearing recursion) ───────────────

/**
 * Returns the full set of advisory objects a package is vulnerable
 * through, walking string `via` entries recursively. Only `braces` carries
 * an advisory object directly (F4); every other package in the measured
 * graph reaches it by a string reference into another key of
 * `vulnerabilities`, up to 5 hops for `eslint-config-next`. A visited-set
 * cycle guard means a cyclic `via` graph terminates instead of recursing
 * forever.
 */
export function resolveAdvisories(
  report: AuditReport,
  pkgName: string,
  visited: Set<string> = new Set(),
): AuditAdvisory[] {
  if (visited.has(pkgName)) return []
  visited.add(pkgName)

  const vuln = report.vulnerabilities[pkgName]
  if (!vuln) return []

  const advisories: AuditAdvisory[] = []
  for (const entry of vuln.via) {
    if (typeof entry === 'string') {
      advisories.push(...resolveAdvisories(report, entry, visited))
    } else {
      advisories.push(entry)
    }
  }
  return advisories
}

/**
 * Reads the GHSA id off the end of an advisory's `url` (F5 — there is no
 * dedicated `ghsa` field in the npm audit JSON, only `url` and the numeric
 * `source`). Falls back to `npm:<source>` when the URL carries no GHSA
 * (defensive — not observed in this repo's audit, but the field is
 * unstructured and should not throw on an unexpected shape).
 */
export function advisoryId(advisory: AuditAdvisory): string {
  const match = advisory.url.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i)
  if (match) return match[0].toUpperCase()
  return `npm:${advisory.source}`
}

// ─── Deferral classification (D-02 / D-03 / D-04) ─────────────────────────

/**
 * Classifies a single deferral against `now`. `expires` is parsed strictly
 * as YYYY-MM-DD and treated as active through the end of that day in UTC.
 * Anything that fails to parse is its own `invalid-date` state -- it never
 * silently counts as active (D-04). `now` is an explicit parameter so this
 * stays a pure function; never read the clock inside it.
 */
export function classifyDeferral(entry: AuditDeferral, now: Date): DeferralClassification {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) return 'invalid-date'

  const expiresEndOfDay = new Date(`${entry.expires}T23:59:59.999Z`)
  if (Number.isNaN(expiresEndOfDay.getTime())) return 'invalid-date'

  return now.getTime() <= expiresEndOfDay.getTime() ? 'active' : 'expired'
}

// ─── Evaluation (D-07 — suppression requires ALL advisories covered) ─────

/**
 * Evaluates a report against a set of deferrals at a severity threshold.
 * Collects ALL failures / stale / expired / invalid deferrals before
 * returning -- never short-circuits (F8 house style), so one run reports
 * everything wrong rather than one thing at a time.
 */
export function evaluate(params: {
  report: AuditReport
  deferrals: readonly AuditDeferral[]
  threshold: Severity
  now: Date
}): EvaluateResult {
  const { report, deferrals, threshold, now } = params

  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new Error(
      'audit-gate: report has no `vulnerabilities` key -- cannot evaluate. This usually means ' +
        '`npm audit --json` returned unparseable or unexpected output (registry unreachable, ' +
        'npm version mismatch, etc). Treat this as a hard failure, not a pass (D-05).',
    )
  }

  const activeByAdvisoryId = new Map<string, AuditDeferral>()
  const expiredDeferrals: AuditDeferral[] = []
  const invalidDeferrals: AuditDeferral[] = []
  for (const deferral of deferrals) {
    const classification = classifyDeferral(deferral, now)
    if (classification === 'active') {
      activeByAdvisoryId.set(deferral.advisory.toUpperCase(), deferral)
    } else if (classification === 'expired') {
      expiredDeferrals.push(deferral)
    } else {
      invalidDeferrals.push(deferral)
    }
  }

  const matchedAdvisoryIds = new Set<string>()
  const failures: EvaluateResult['failures'] = []

  for (const pkgName of Object.keys(report.vulnerabilities)) {
    const vuln = report.vulnerabilities[pkgName]
    if (!severityAtLeast(vuln.severity, threshold)) continue

    const resolved = resolveAdvisories(report, pkgName)
    const atOrAboveThreshold = resolved.filter((a) => severityAtLeast(a.severity, threshold))
    if (atOrAboveThreshold.length === 0) continue

    for (const advisory of atOrAboveThreshold) {
      matchedAdvisoryIds.add(advisoryId(advisory))
    }

    // D-07: suppressed only when EVERY advisory this package resolves to
    // (at/above threshold) is covered by an active deferral -- not any one
    // of them. A package with a second, undeferred advisory still fails.
    const allCovered = atOrAboveThreshold.every((advisory) =>
      activeByAdvisoryId.has(advisoryId(advisory)),
    )

    if (!allCovered) {
      for (const advisory of atOrAboveThreshold) {
        if (!activeByAdvisoryId.has(advisoryId(advisory))) {
          failures.push({ package: pkgName, advisory })
        }
      }
    }
  }

  // Stale: an active or expired deferral whose advisory id never appeared
  // anywhere in the report. Fixed, not a bookkeeping error (D-03) -- warn,
  // do not fail.
  const staleDeferrals: AuditDeferral[] = []
  for (const deferral of deferrals) {
    const classification = classifyDeferral(deferral, now)
    if (classification === 'invalid-date') continue // already counted as invalid
    if (!matchedAdvisoryIds.has(deferral.advisory.toUpperCase())) {
      staleDeferrals.push(deferral)
    }
  }

  return { failures, staleDeferrals, expiredDeferrals, invalidDeferrals }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

/**
 * Shells out to `npm audit --json` with NO `--audit-level` flag (D-06 --
 * the threshold is applied in `evaluate`, not by npm). npm exits 1
 * whenever vulnerabilities exist while still writing valid JSON to stdout
 * (F6), so a nonzero exit is NOT itself an error -- only output that fails
 * to parse as a report with a `vulnerabilities` key is (D-05).
 */
export function runNpmAudit(): AuditReport {
  let stdout: string
  try {
    stdout = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8' })
  } catch (err) {
    const maybeStdout = (err as { stdout?: string | Buffer }).stdout
    if (maybeStdout === undefined) {
      throw new Error(
        `audit-gate: \`npm audit --json\` failed to run and produced no stdout: ${String(err)}`,
      )
    }
    stdout = typeof maybeStdout === 'string' ? maybeStdout : maybeStdout.toString('utf8')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (parseErr) {
    throw new Error(
      `audit-gate: \`npm audit --json\` output could not be parsed as JSON -- treating as a ` +
        `hard failure rather than printing green (D-05). Parse error: ${String(parseErr)}`,
    )
  }

  const report = parsed as AuditReport
  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new Error(
      'audit-gate: `npm audit --json` output parsed but has no `vulnerabilities` key -- ' +
        'treating as a hard failure rather than printing green (D-05).',
    )
  }

  return report
}

function main(): void {
  const report = runNpmAudit()
  const result = evaluate({ report, deferrals: AUDIT_DEFERRALS, threshold: 'high', now: new Date() })

  for (const failure of result.failures) {
    const id = advisoryId(failure.advisory)
    // eslint-disable-next-line no-console
    console.error(
      `FAIL: ${failure.package} -- ${id} (${failure.advisory.severity}) ${failure.advisory.url}`,
    )
  }

  for (const expired of result.expiredDeferrals) {
    // eslint-disable-next-line no-console
    console.error(
      `FAIL: deferral for ${expired.advisory} (package ${expired.package}) expired on ` +
        `${expired.expires} -- it no longer suppresses. Re-evaluate the advisory; do not ` +
        'just push the date out.',
    )
  }

  for (const invalid of result.invalidDeferrals) {
    // eslint-disable-next-line no-console
    console.error(
      `FAIL: deferral for ${invalid.advisory} has an unparseable expires date ` +
        `("${invalid.expires}") -- it suppresses nothing.`,
    )
  }

  for (const stale of result.staleDeferrals) {
    // eslint-disable-next-line no-console
    console.warn(
      `WARN: deferral for ${stale.advisory} (package ${stale.package}) matches nothing in ` +
        'the current audit report -- the advisory appears fixed. Remove this entry.',
    )
  }

  const hardFailure =
    result.failures.length > 0 ||
    result.expiredDeferrals.length > 0 ||
    result.invalidDeferrals.length > 0

  if (hardFailure) {
    process.exit(1)
  }

  const activeDeferrals = AUDIT_DEFERRALS.filter((d) => classifyDeferral(d, new Date()) === 'active')
  if (activeDeferrals.length > 0) {
    const earliestExpiry = activeDeferrals
      .map((d) => d.expires)
      .sort()[0]
    // eslint-disable-next-line no-console
    console.log(
      `audit-gate: clean -- ${activeDeferrals.length} active deferral(s), earliest expiry ` +
        `${earliestExpiry}.`,
    )
  } else {
    // eslint-disable-next-line no-console
    console.log('audit-gate: clean -- no active deferrals.')
  }
}

if (require.main === module) {
  main()
}
