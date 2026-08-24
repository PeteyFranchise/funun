import { loadBook, loadWholeBookWithCoverage, fetchHealthRulesConfig, lastExecutedLicenseAt, maxTimestamp } from './signals'

// ─── Mock service — a minimal chainable + thenable Supabase query builder ──
// Each `.from(table)` call returns a fresh builder over that table's fixture
// rows. Chain methods (select/eq/in/not/order) all return the same builder
// (`this`-style), and the builder is itself awaitable via `.then` — mirrors
// how real supabase-js query builders resolve without requiring a trailing
// `.order()`/`.select()` call. `.maybeSingle()` resolves the first row.

type Fixtures = Record<string, unknown[]>

function makeBuilder(rows: unknown[]) {
  const builder: {
    select: () => typeof builder
    eq: () => typeof builder
    in: () => typeof builder
    not: () => typeof builder
    order: () => typeof builder
    maybeSingle: () => Promise<{ data: unknown; error: null }>
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => void
  } = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: resolve => resolve({ data: rows, error: null }),
  }
  return builder
}

function mockService(fixtures: Fixtures) {
  return {
    from: jest.fn((table: string) => makeBuilder(fixtures[table] ?? [])),
  }
}

// Builder that always resolves with a Supabase-shaped error — used to prove
// WR-01: every fetch helper must throw rather than silently degrade to
// empty data when the underlying query errors.
function makeErrorBuilder(message: string) {
  const error = { message }
  const builder: {
    select: () => typeof builder
    eq: () => typeof builder
    in: () => typeof builder
    not: () => typeof builder
    order: () => typeof builder
    maybeSingle: () => Promise<{ data: null; error: typeof error }>
    then: (resolve: (v: { data: null; error: typeof error }) => void) => void
  } = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    maybeSingle: async () => ({ data: null, error }),
    then: resolve => resolve({ data: null, error }),
  }
  return builder
}

function mockServiceWithErrorOn(table: string, message: string, fixtures: Fixtures = {}) {
  return {
    from: jest.fn((t: string) => (t === table ? makeErrorBuilder(message) : makeBuilder(fixtures[t] ?? []))),
  }
}

const NOW = Date.now()

function daysAgoIso(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()
}

const DEFAULT_RULES_ROW = {
  good_within_days: 90,
  warning_after_days: 120,
  at_risk_after_days: 180,
  cold_after_days: 365,
  keep_warm_open_brief: true,
  keep_warm_open_deal: true,
  keep_warm_recent_selects: true,
  recent_selects_days: 21,
  keep_warm_recent_contact: false,
  recent_contact_days: 30,
}

// ─── maxTimestamp (pure) ─────────────────────────────────────────────────

describe('maxTimestamp', () => {
  it('returns null for an empty or all-null/undefined list', () => {
    expect(maxTimestamp([])).toBeNull()
    expect(maxTimestamp([null, undefined])).toBeNull()
  })

  it('returns the latest ISO timestamp regardless of input order', () => {
    const early = daysAgoIso(30)
    const mid = daysAgoIso(15)
    const late = daysAgoIso(1)
    expect(maxTimestamp([mid, early, late])).toBe(late)
  })
})

// ─── lastExecutedLicenseAt (single-org I/O read) ─────────────────────────

describe('lastExecutedLicenseAt', () => {
  it('returns the max executed_at across the org executed license_requests', async () => {
    const early = daysAgoIso(90)
    const late = daysAgoIso(10)
    const service = mockService({
      license_requests: [{ executed_at: early }, { executed_at: late }],
    })
    await expect(lastExecutedLicenseAt(service as never, 'org-1')).resolves.toBe(late)
  })

  it('returns null when the org has no executed license_requests at all (never-licensed / prospect path)', async () => {
    const service = mockService({ license_requests: [] })
    await expect(lastExecutedLicenseAt(service as never, 'org-1')).resolves.toBeNull()
  })

  it('throws rather than silently returning null when the query errors (WR-01)', async () => {
    const service = mockServiceWithErrorOn('license_requests', 'connection reset')
    await expect(lastExecutedLicenseAt(service as never, 'org-1')).rejects.toThrow(/connection reset/)
  })
})

// ─── fetchHealthRulesConfig (WR-01 error handling) ───────────────────────

describe('fetchHealthRulesConfig', () => {
  it('returns the seeded defaults when the singleton row is missing (no error, null data)', async () => {
    const service = mockService({ health_rules_config: [] })
    const rules = await fetchHealthRulesConfig(service as never)
    expect(rules.good_within_days).toBe(30)
  })

  it('throws rather than silently falling back to defaults when the query errors', async () => {
    const service = mockServiceWithErrorOn('health_rules_config', 'permission denied')
    await expect(fetchHealthRulesConfig(service as never)).rejects.toThrow(/permission denied/)
  })
})

// ─── loadBook (own-book, health assembly + lastTouchAt) ──────────────────

describe('loadBook', () => {
  it('assembles rows with health resolved via computeHealth and lastTouchAt sourced from the relationship log', async () => {
    const service = mockService({
      buyer_orgs: [
        {
          id: 'org-1',
          name: 'Neon Sky Records',
          website: 'neonsky.co',
          ae_user_id: 'ae-1',
          pipeline_stage_id: 'stage-active',
          stage_entered_at: daysAgoIso(10),
        },
        {
          id: 'org-2',
          name: 'Lumen Films',
          website: null,
          ae_user_id: 'ae-1',
          pipeline_stage_id: null,
          stage_entered_at: null,
        },
      ],
      license_requests: [
        {
          buyer_org_id: 'org-1',
          stage: 'closed_won',
          gross_fee_cents: 500000,
          budget_cents: null,
          executed_at: daysAgoIso(30),
        },
      ],
      buyer_briefs: [],
      selects: [],
      buyer_org_contacts: [],
      client_relationship_log: [{ buyer_org_id: 'org-1', created_at: daysAgoIso(3) }],
      health_rules_config: [DEFAULT_RULES_ROW],
      pipeline_stages: [{ id: 'stage-active', key: 'active', label: 'Active', sort_order: 3, is_terminal: false }],
    })

    const rows = await loadBook(service as never, { aeUserId: 'ae-1' })
    expect(rows).toHaveLength(2)

    const org1 = rows.find(r => r.id === 'org-1')!
    expect(org1.health).toBe('good')
    expect(org1.lastTouchAt).toBe(daysAgoIso(3))
    expect(org1.status).toBe('Active')
    expect(org1.stageDays).toBe(10)
    expect(org1.lifetimeValue).toBeCloseTo(5000)

    // Never-executed org resolves to 'prospect' regardless of other signals.
    const org2 = rows.find(r => r.id === 'org-2')!
    expect(org2.health).toBe('prospect')
    expect(org2.lastTouchAt).toBeNull()
  })

  it('propagates a license_requests query error instead of silently resolving every client to prospect (WR-01)', async () => {
    const service = mockServiceWithErrorOn('license_requests', 'deals query failed', {
      buyer_orgs: [
        {
          id: 'org-1',
          name: 'Neon Sky Records',
          website: 'neonsky.co',
          ae_user_id: 'ae-1',
          pipeline_stage_id: null,
          stage_entered_at: null,
        },
      ],
      buyer_briefs: [],
      selects: [],
      buyer_org_contacts: [],
      client_relationship_log: [],
      health_rules_config: [DEFAULT_RULES_ROW],
      pipeline_stages: [],
    })

    await expect(loadBook(service as never, { aeUserId: 'ae-1' })).rejects.toThrow(/deals query failed/)
  })

  it('falls back to the seeded default health rules if health_rules_config has no row', async () => {
    const service = mockService({
      buyer_orgs: [
        {
          id: 'org-1',
          name: 'Atlas Media',
          website: null,
          ae_user_id: 'ae-1',
          pipeline_stage_id: null,
          stage_entered_at: null,
        },
      ],
      license_requests: [{ buyer_org_id: 'org-1', stage: 'closed_won', gross_fee_cents: 100000, budget_cents: null, executed_at: daysAgoIso(30) }],
      buyer_briefs: [],
      selects: [],
      buyer_org_contacts: [],
      client_relationship_log: [],
      health_rules_config: [],
      pipeline_stages: [],
    })

    const rows = await loadBook(service as never, { aeUserId: 'ae-1' })
    expect(rows[0].health).toBe('good')
  })
})

// ─── loadWholeBookWithCoverage (All tab — Assigned-AE identity) ──────────

describe('loadWholeBookWithCoverage', () => {
  it('resolves assignedAeId/assignedAeName from funun_staff for every org, including unassigned rows', async () => {
    const service = mockService({
      buyer_orgs: [
        { id: 'org-1', name: 'Neon Sky', website: null, ae_user_id: 'ae-1', pipeline_stage_id: null, stage_entered_at: null },
        { id: 'org-2', name: 'Unassigned Co', website: null, ae_user_id: null, pipeline_stage_id: null, stage_entered_at: null },
      ],
      license_requests: [],
      buyer_briefs: [],
      selects: [],
      buyer_org_contacts: [],
      client_relationship_log: [],
      health_rules_config: [DEFAULT_RULES_ROW],
      pipeline_stages: [],
      funun_staff: [{ user_id: 'ae-1', display_name: 'Maya Chen' }],
    })

    const rows = await loadWholeBookWithCoverage(service as never)

    const org1 = rows.find(r => r.id === 'org-1')!
    expect(org1.assignedAeId).toBe('ae-1')
    expect(org1.assignedAeName).toBe('Maya Chen')

    const org2 = rows.find(r => r.id === 'org-2')!
    expect(org2.assignedAeId).toBeNull()
    expect(org2.assignedAeName).toBeNull()
  })
})
