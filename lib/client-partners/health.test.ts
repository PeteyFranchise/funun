import { computeHealth, daysBetween, within, type HealthRulesConfig, type HealthSignals } from './health'

// Default rules mirror migration 129's owner-decided health_rules_config
// defaults (2026-08-24): a 3-threshold model — Good/Warning/At-risk are
// leadership-tunable, Cold is open-ended past at_risk_after_days.
// cold_after_days is DEPRECATED/unused by computeHealth (kept equal to
// at_risk_after_days for backward compat with the DB column only).
const DEFAULT_RULES: HealthRulesConfig = {
  good_within_days: 30,
  warning_after_days: 60,
  at_risk_after_days: 180,
  cold_after_days: 180,
  keep_warm_open_brief: true,
  keep_warm_open_deal: true,
  keep_warm_recent_selects: true,
  recent_selects_days: 21,
  keep_warm_recent_contact: false,
  recent_contact_days: 30,
}

const NOW = new Date('2026-08-24T00:00:00.000Z').getTime()

function daysAgoIso(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

function signals(overrides: Partial<HealthSignals> = {}): HealthSignals {
  return {
    lastExecutedLicenseAt: daysAgoIso(30),
    hasOpenBrief: false,
    hasOpenDeal: false,
    lastSelectsSentAt: null,
    lastContactAt: null,
    now: NOW,
    ...overrides,
  }
}

describe('computeHealth — prospect (D-31.1-02/09)', () => {
  it('null lastExecutedLicenseAt resolves to prospect regardless of any other signal', () => {
    expect(
      computeHealth(
        signals({
          lastExecutedLicenseAt: null,
          hasOpenBrief: true,
          hasOpenDeal: true,
          lastSelectsSentAt: daysAgoIso(1),
          lastContactAt: daysAgoIso(1),
        }),
        DEFAULT_RULES
      )
    ).toBe('prospect')
  })

  it('never resolves to good or warning with no executed license, even with every keeps-warm toggle on', () => {
    const rules: HealthRulesConfig = { ...DEFAULT_RULES, keep_warm_recent_contact: true }
    const out = computeHealth(
      signals({
        lastExecutedLicenseAt: null,
        hasOpenBrief: true,
        hasOpenDeal: true,
        lastSelectsSentAt: daysAgoIso(1),
        lastContactAt: daysAgoIso(1),
      }),
      rules
    )
    expect(out).toBe('prospect')
  })
})

describe('computeHealth — band boundaries (3-threshold model, owner decision 2026-08-24; RESEARCH Open Q3: good inclusive, *_after exclusive lower bound of next band)', () => {
  it('executed 15 days ago, default thresholds → good', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(15) }), DEFAULT_RULES)).toBe('good')
  })

  it('executed exactly good_within_days ago → good (inclusive upper bound)', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(30) }), DEFAULT_RULES)).toBe('good')
  })

  it('executed good_within_days+1 ago → warning', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(31) }), DEFAULT_RULES)).toBe('warning')
  })

  it('executed exactly warning_after_days ago → warning', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(60) }), DEFAULT_RULES)).toBe('warning')
  })

  it('executed warning_after_days+1 ago → at_risk', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(61) }), DEFAULT_RULES)).toBe('at_risk')
  })

  it('executed exactly at_risk_after_days ago → at_risk', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(180) }), DEFAULT_RULES)).toBe('at_risk')
  })

  it('executed at_risk_after_days+1 ago → cold (at_risk_after_days is the open-ended at_risk→cold boundary — there is no fourth cutoff)', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(181) }), DEFAULT_RULES)).toBe('cold')
  })

  it('executed well past at_risk_after_days → cold (Cold is open-ended, not bounded by a separate cold_after_days cutoff)', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(366) }), DEFAULT_RULES)).toBe('cold')
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(500) }), DEFAULT_RULES)).toBe('cold')
  })

  it('cold_after_days is never read by computeHealth — a wildly different value changes nothing', () => {
    const rules: HealthRulesConfig = { ...DEFAULT_RULES, cold_after_days: 1 }
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(45) }), rules)).toBe('warning')
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(181) }), rules)).toBe('cold')
  })
})

describe('computeHealth — at_risk_after_days is load-bearing (CR-01 regression)', () => {
  it('with default thresholds, exactly at_risk_after_days ago is at_risk and one day past is cold', () => {
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(180) }), DEFAULT_RULES)).toBe('at_risk')
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(181) }), DEFAULT_RULES)).toBe('cold')
  })

  it('changing at_risk_after_days moves the at_risk→cold boundary', () => {
    const rules: HealthRulesConfig = { ...DEFAULT_RULES, at_risk_after_days: 200 }
    // 190 days would be cold under the default (180) threshold, but is
    // still at_risk once at_risk_after_days is raised to 200.
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(190) }), rules)).toBe('at_risk')
    expect(computeHealth(signals({ lastExecutedLicenseAt: daysAgoIso(201) }), rules)).toBe('cold')
  })
})

describe('computeHealth — keeps-warm holds (D-31.1-03)', () => {
  it('an at_risk client with an open brief AND keep_warm_open_brief on is held at warning', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), hasOpenBrief: true }),
      DEFAULT_RULES
    )
    expect(out).toBe('warning')
  })

  it('an at_risk client with an open deal AND keep_warm_open_deal on is held at warning', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), hasOpenDeal: true }),
      DEFAULT_RULES
    )
    expect(out).toBe('warning')
  })

  it('a cold client with a recent Selects within recent_selects_days AND keep_warm_recent_selects on is held at warning', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(400), lastSelectsSentAt: daysAgoIso(5) }),
      DEFAULT_RULES
    )
    expect(out).toBe('warning')
  })

  it('a cold client with an old Selects (outside recent_selects_days) is NOT held — stays cold', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(400), lastSelectsSentAt: daysAgoIso(45) }),
      DEFAULT_RULES
    )
    expect(out).toBe('cold')
  })

  it('a hold signal whose toggle is OFF does not lift the band', () => {
    const rules: HealthRulesConfig = { ...DEFAULT_RULES, keep_warm_open_brief: false }
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), hasOpenBrief: true }),
      rules
    )
    expect(out).toBe('at_risk')
  })

  it('keep_warm_recent_contact off by default does not lift the band even with a very recent contact', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), lastContactAt: daysAgoIso(1) }),
      DEFAULT_RULES
    )
    expect(out).toBe('at_risk')
  })

  it('keep_warm_recent_contact on lifts an at_risk client with a recent contact to warning', () => {
    const rules: HealthRulesConfig = { ...DEFAULT_RULES, keep_warm_recent_contact: true }
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), lastContactAt: daysAgoIso(1) }),
      rules
    )
    expect(out).toBe('warning')
  })

  it('keeps-warm never lifts a good client (stays good, does not need lifting)', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(30), hasOpenBrief: true }),
      DEFAULT_RULES
    )
    expect(out).toBe('good')
  })

  it('keeps-warm never lifts a warning client above warning', () => {
    const out = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(45), hasOpenBrief: true, hasOpenDeal: true }),
      DEFAULT_RULES
    )
    expect(out).toBe('warning')
  })

  it('last-contact recency alone (no toggle) never changes the resolved color band', () => {
    const withRecentContact = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), lastContactAt: daysAgoIso(1) }),
      DEFAULT_RULES
    )
    const withoutContact = computeHealth(
      signals({ lastExecutedLicenseAt: daysAgoIso(150), lastContactAt: null }),
      DEFAULT_RULES
    )
    expect(withRecentContact).toBe(withoutContact)
  })
})

describe('computeHealth — no I/O (pure function)', () => {
  it('module source has no Supabase/fetch import', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, 'health.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]@supabase/)
    expect(src).not.toMatch(/createClient/)
    expect(src).not.toMatch(/\bfetch\(/)
  })
})

describe('daysBetween / within helpers', () => {
  it('daysBetween computes whole days elapsed since an ISO timestamp', () => {
    expect(daysBetween(daysAgoIso(30), NOW)).toBe(30)
    expect(daysBetween(daysAgoIso(0), NOW)).toBe(0)
  })

  it('within is true when the ISO timestamp is within N days of now, false otherwise', () => {
    expect(within(daysAgoIso(5), 21, NOW)).toBe(true)
    expect(within(daysAgoIso(21), 21, NOW)).toBe(true)
    expect(within(daysAgoIso(22), 21, NOW)).toBe(false)
    expect(within(null, 21, NOW)).toBe(false)
  })
})
