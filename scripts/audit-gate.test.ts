// ─── Audit gate tests ──────────────────────────────────────────────────────
// Quick task 261003-adt. Pure fixture tests, no network and no dependence on
// the real clock -- `now` is passed explicitly in every case so nothing here
// starts failing on 2026-11-03 for the wrong reason. No jsdom exists in this
// repo (jest.config.js is testEnvironment: 'node'); nothing here touches the
// DOM.

import { readFileSync } from 'node:fs'
import {
  AUDIT_DEFERRALS,
  advisoryId,
  classifyDeferral,
  evaluate,
  resolveAdvisories,
  type AuditAdvisory,
  type AuditReport,
} from './audit-gate'

// ─── Fixture: the exact 7-entry graph measured against this repo's real
// `npm audit --json` output (F4) -- trimmed to the fields the gate reads,
// but shape-faithful. Kept inline (not snapshotted from a live run, which
// changes under us) so a reader can see the graph directly.

const BRACES_ADVISORY: AuditAdvisory = {
  source: 1240992,
  name: 'braces',
  dependency: 'braces',
  title: 'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
  url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  severity: 'high',
  range: '<=3.0.3',
}

function buildReport(): AuditReport {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      '@next/eslint-plugin-next': {
        name: '@next/eslint-plugin-next',
        severity: 'high',
        isDirect: false,
        via: ['fast-glob'],
        effects: ['eslint-config-next'],
        range: '*',
      },
      braces: {
        name: 'braces',
        severity: 'high',
        isDirect: false,
        via: [BRACES_ADVISORY],
        effects: ['chokidar', 'micromatch'],
        range: '*',
      },
      chokidar: {
        name: 'chokidar',
        severity: 'high',
        isDirect: false,
        via: ['braces'],
        effects: ['tailwindcss'],
        range: '*',
      },
      'eslint-config-next': {
        name: 'eslint-config-next',
        severity: 'high',
        isDirect: true,
        via: ['@next/eslint-plugin-next'],
        effects: [],
        range: '*',
      },
      'fast-glob': {
        name: 'fast-glob',
        severity: 'high',
        isDirect: false,
        via: ['micromatch'],
        effects: ['@next/eslint-plugin-next', 'tailwindcss'],
        range: '*',
      },
      micromatch: {
        name: 'micromatch',
        severity: 'high',
        isDirect: false,
        via: ['braces'],
        effects: ['fast-glob', 'tailwindcss'],
        range: '*',
      },
      tailwindcss: {
        name: 'tailwindcss',
        severity: 'high',
        isDirect: true,
        via: ['chokidar', 'fast-glob', 'micromatch'],
        effects: [],
        range: '*',
      },
    },
  }
}

const ACTIVE_DEFERRAL = {
  advisory: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  reason: 'test fixture',
  approvedBy: 'test',
  approvedOn: '2026-10-03',
  expires: '2026-11-02',
}

const NOW_WITHIN_WINDOW = new Date('2026-10-15T00:00:00.000Z')
const NOW_AFTER_EXPIRY = new Date('2026-11-03T00:00:00.000Z')

describe('resolveAdvisories', () => {
  it('resolves eslint-config-next to the braces advisory through the 5-hop string chain', () => {
    const report = buildReport()
    const resolved = resolveAdvisories(report, 'eslint-config-next')
    expect(resolved).toHaveLength(1)
    expect(resolved[0].url).toBe(BRACES_ADVISORY.url)
  })

  it('resolves braces to its own advisory directly (0 hops)', () => {
    const report = buildReport()
    const resolved = resolveAdvisories(report, 'braces')
    expect(resolved).toEqual([BRACES_ADVISORY])
  })

  it('terminates on a cyclic via graph instead of exhausting the stack', () => {
    const report: AuditReport = {
      vulnerabilities: {
        a: { name: 'a', severity: 'high', isDirect: false, via: ['b'], effects: [], range: '*' },
        b: { name: 'b', severity: 'high', isDirect: false, via: ['a'], effects: [], range: '*' },
      },
    }
    expect(() => resolveAdvisories(report, 'a')).not.toThrow()
    expect(resolveAdvisories(report, 'a')).toEqual([])
  })
})

describe('advisoryId', () => {
  it('reads the GHSA off the end of the url, uppercased', () => {
    expect(advisoryId(BRACES_ADVISORY)).toBe('GHSA-VFJ7-8CJW-P6XM')
  })

  it('falls back to npm:<source> when the url carries no GHSA', () => {
    const noGhsa: AuditAdvisory = { ...BRACES_ADVISORY, url: 'https://example.com/nope' }
    expect(advisoryId(noGhsa)).toBe('npm:1240992')
  })
})

describe('classifyDeferral', () => {
  it('is active when now is before expires', () => {
    expect(classifyDeferral(ACTIVE_DEFERRAL, NOW_WITHIN_WINDOW)).toBe('active')
  })

  it('is expired when now is after expires', () => {
    expect(classifyDeferral(ACTIVE_DEFERRAL, NOW_AFTER_EXPIRY)).toBe('expired')
  })

  it('is invalid-date for an unparseable expires string', () => {
    expect(classifyDeferral({ ...ACTIVE_DEFERRAL, expires: 'soon' }, NOW_WITHIN_WINDOW)).toBe(
      'invalid-date',
    )
  })
})

describe('evaluate', () => {
  it('suppresses all 7 packages with one active deferral for the shared GHSA', () => {
    const result = evaluate({
      report: buildReport(),
      deferrals: [ACTIVE_DEFERRAL],
      threshold: 'high',
      now: NOW_WITHIN_WINDOW,
    })
    expect(result.failures).toHaveLength(0)
    expect(result.expiredDeferrals).toHaveLength(0)
    expect(result.invalidDeferrals).toHaveLength(0)
    expect(result.staleDeferrals).toHaveLength(0)
  })

  it('fails all 7 packages once the deferral has expired, and lists it as expired', () => {
    const result = evaluate({
      report: buildReport(),
      deferrals: [ACTIVE_DEFERRAL],
      threshold: 'high',
      now: NOW_AFTER_EXPIRY,
    })
    expect(result.failures).toHaveLength(7)
    expect(result.expiredDeferrals).toEqual([ACTIVE_DEFERRAL])
  })

  it('fails an at-or-above-threshold advisory with no deferral at all', () => {
    const result = evaluate({
      report: buildReport(),
      deferrals: [],
      threshold: 'high',
      now: NOW_WITHIN_WINDOW,
    })
    expect(result.failures.length).toBeGreaterThan(0)
  })

  it('still fails a package resolving to two advisories when only one is deferred (D-07)', () => {
    const secondAdvisory: AuditAdvisory = {
      source: 999999,
      name: 'braces',
      dependency: 'braces',
      title: 'a second, unrelated braces advisory',
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      severity: 'high',
      range: '*',
    }
    const report = buildReport()
    report.vulnerabilities.braces.via = [BRACES_ADVISORY, secondAdvisory]

    const result = evaluate({
      report,
      deferrals: [ACTIVE_DEFERRAL],
      threshold: 'high',
      now: NOW_WITHIN_WINDOW,
    })

    const bracesFailures = result.failures.filter((f) => f.package === 'braces')
    expect(bracesFailures).toHaveLength(1)
    expect(bracesFailures[0].advisory.url).toBe(secondAdvisory.url)
  })

  it('reports a deferral matching nothing in the report as stale, with zero failures', () => {
    const result = evaluate({
      report: buildReport(),
      deferrals: [{ ...ACTIVE_DEFERRAL, advisory: 'GHSA-zzzz-zzzz-zzzz', package: 'nonexistent' }],
      threshold: 'high',
      now: NOW_WITHIN_WINDOW,
    })
    expect(result.staleDeferrals).toHaveLength(1)
    // the real advisories are still unsuppressed since the stale deferral
    // doesn't cover them
    expect(result.failures.length).toBeGreaterThan(0)
  })

  it('reports an unparseable expires as invalid and suppresses nothing', () => {
    const result = evaluate({
      report: buildReport(),
      deferrals: [{ ...ACTIVE_DEFERRAL, expires: 'soon' }],
      threshold: 'high',
      now: NOW_WITHIN_WINDOW,
    })
    expect(result.invalidDeferrals).toHaveLength(1)
    expect(result.failures.length).toBeGreaterThan(0)
  })

  it('ignores a moderate-severity advisory at threshold high, but catches it at threshold moderate', () => {
    const report = buildReport()
    report.vulnerabilities.braces.severity = 'moderate'
    report.vulnerabilities.braces.via = [{ ...BRACES_ADVISORY, severity: 'moderate' }]

    const highResult = evaluate({ report, deferrals: [], threshold: 'high', now: NOW_WITHIN_WINDOW })
    expect(highResult.failures.some((f) => f.package === 'braces')).toBe(false)

    const moderateResult = evaluate({
      report,
      deferrals: [],
      threshold: 'moderate',
      now: NOW_WITHIN_WINDOW,
    })
    expect(moderateResult.failures.some((f) => f.package === 'braces')).toBe(true)
  })

  it('terminates on a cyclic via graph rather than exhausting the stack', () => {
    const report: AuditReport = {
      vulnerabilities: {
        a: { name: 'a', severity: 'high', isDirect: false, via: ['b'], effects: [], range: '*' },
        b: { name: 'b', severity: 'high', isDirect: false, via: ['a'], effects: [], range: '*' },
      },
    }
    expect(() =>
      evaluate({ report, deferrals: [], threshold: 'high', now: NOW_WITHIN_WINDOW }),
    ).not.toThrow()
  })

  it('throws when the report has no vulnerabilities key (D-05)', () => {
    const badReport = {} as AuditReport
    expect(() =>
      evaluate({ report: badReport, deferrals: [], threshold: 'high', now: NOW_WITHIN_WINDOW }),
    ).toThrow()
  })
})

describe('AUDIT_DEFERRALS (committed const guard)', () => {
  it('has at least one entry', () => {
    expect(AUDIT_DEFERRALS.length).toBeGreaterThan(0)
  })

  it('every entry has a parseable expires, a non-empty reason, and a non-empty approvedBy', () => {
    for (const entry of AUDIT_DEFERRALS) {
      expect(classifyDeferral(entry, new Date())).not.toBe('invalid-date')
      expect(entry.reason.trim().length).toBeGreaterThan(0)
      expect(entry.approvedBy.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('Verification Gate doc/workflow drift guard', () => {
  const workflow = readFileSync('.github/workflows/quality.yml', 'utf8')
  const claudeMd = readFileSync('.claude/CLAUDE.md', 'utf8')

  // Every `run: npm ...` step inside the `validate` job, in file order,
  // whether written inline (`- run: npm foo`) or as a named step (`- name: ...`
  // followed by `run: npm foo` on its own line) -- EXCLUDING `npm ci`, which
  // installs dependencies and is not one of the verification commands the
  // Verification Gate section documents.
  const npmSteps = Array.from(workflow.matchAll(/run:\s*(npm [^\n]+)/g))
    .map((m) => m[1].trim())
    .filter((step) => step !== 'npm ci')

  function extractVerificationGateBlock(doc: string): string {
    const marker = '## Verification Gate'
    const start = doc.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const fenceStart = doc.indexOf('```bash', start)
    expect(fenceStart).toBeGreaterThanOrEqual(0)
    const fenceEnd = doc.indexOf('```', fenceStart + 7)
    expect(fenceEnd).toBeGreaterThan(fenceStart)
    return doc.slice(fenceStart + 7, fenceEnd)
  }

  it('lists every npm-invoking validate-job step, with none missing and none left over', () => {
    const block = extractVerificationGateBlock(claudeMd)
    const blockCommands = block
      .split('\n')
      .map((line) => line.split('#')[0].trim())
      .filter((line) => line.length > 0)

    expect(npmSteps.length).toBeGreaterThan(0)
    expect(blockCommands).toHaveLength(npmSteps.length)
    for (const step of npmSteps) {
      expect(blockCommands).toContain(step)
    }
    for (const command of blockCommands) {
      expect(npmSteps).toContain(command)
    }
  })

  it('keeps the production audit line byte-identical in both files, with no deferral path', () => {
    const PRODUCTION_AUDIT_LINE = 'npm audit --omit=dev --audit-level=moderate'
    expect(workflow).toContain(PRODUCTION_AUDIT_LINE)
    expect(claudeMd).toContain(PRODUCTION_AUDIT_LINE)
  })
})
