import { readFileSync } from 'fs'
import path from 'path'

const migration128 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/128_ae_console_health.sql'),
  'utf8'
)

// ─── 128 (31.1-01 Task 2) ───────────────────────────────────────────────
// Text-based lock on the AE Console health data model: the executed-
// license timestamp (D-31.1-09), D-10 pipeline_stages + buyer_orgs stage
// columns, the health_rules_config seeded singleton (D-31.1-03/08),
// game_plans (R14/D-31.1-06), onboarding_tasks (D-07), the zero-policy +
// REVOKE fail-closed posture on every new table, and the migration-112
// HUMAN-GATED provenance/footer doctrine.

describe('128', () => {
  it('creates all four new tables', () => {
    expect(migration128).toContain('CREATE TABLE public.pipeline_stages')
    expect(migration128).toContain('CREATE TABLE public.health_rules_config')
    expect(migration128).toContain('CREATE TABLE public.game_plans')
    expect(migration128).toContain('CREATE TABLE public.onboarding_tasks')
  })

  it('adds license_requests.executed_at as the D-31.1-09 health-clock source', () => {
    expect(migration128).toContain('ALTER TABLE public.license_requests ADD COLUMN executed_at TIMESTAMPTZ;')
  })

  it('does NOT stamp executed_at on the closed_won stage transition (prohibition)', () => {
    expect(migration128).not.toMatch(/closed_won[^;]*executed_at\s*=/)
    expect(migration128).not.toMatch(/UPDATE public\.license_requests SET executed_at/)
  })

  it('seeds the health_rules_config singleton (id=1)', () => {
    expect(migration128).toContain('id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1)')
    expect(migration128).toContain('INSERT INTO public.health_rules_config (id) VALUES (1) ON CONFLICT DO NOTHING;')
  })

  it('seeds the five D-10 default pipeline stage keys', () => {
    for (const key of ['new_lead', 'contacted', 'active', 'negotiating', 'closed_dormant']) {
      expect(migration128).toContain(`'${key}'`)
    }
    expect(migration128).toContain("'closed_dormant', 'Closed/Dormant', 5, true")
  })

  it('adds buyer_orgs.pipeline_stage_id and stage_entered_at as additive columns', () => {
    expect(migration128).toContain('ADD COLUMN pipeline_stage_id UUID REFERENCES public.pipeline_stages ON DELETE SET NULL,')
    expect(migration128).toContain('ADD COLUMN stage_entered_at  TIMESTAMPTZ;')
  })

  it('creates game_plans with the one-row-per-org unique index (R14/D-31.1-06)', () => {
    expect(migration128).toContain('CREATE UNIQUE INDEX game_plans_one_per_org ON public.game_plans (buyer_org_id);')
  })

  it('creates onboarding_tasks indexed by (assignee_id, status) (D-07)', () => {
    expect(migration128).toContain('CREATE INDEX idx_onboarding_tasks_assignee ON public.onboarding_tasks (assignee_id, status);')
    expect(migration128).toContain("status IN ('open', 'done', 'dismissed')")
  })

  it('enables row level security on every new table', () => {
    expect(migration128).toContain('ALTER TABLE public.pipeline_stages     ENABLE ROW LEVEL SECURITY;')
    expect(migration128).toContain('ALTER TABLE public.health_rules_config ENABLE ROW LEVEL SECURITY;')
    expect(migration128).toContain('ALTER TABLE public.game_plans          ENABLE ROW LEVEL SECURITY;')
    expect(migration128).toContain('ALTER TABLE public.onboarding_tasks    ENABLE ROW LEVEL SECURITY;')
  })

  it('declares zero CREATE POLICY statements for any new table', () => {
    expect(migration128).not.toMatch(/^\s*CREATE POLICY/m)
  })

  it('REVOKEs all four new tables from authenticated, anon (staff-only)', () => {
    expect(migration128).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages     FROM authenticated, anon;'
    )
    expect(migration128).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.health_rules_config FROM authenticated, anon;'
    )
    expect(migration128).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.game_plans          FROM authenticated, anon;'
    )
    expect(migration128).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.onboarding_tasks    FROM authenticated, anon;'
    )
  })

  it('never GRANTs executed_at, pipeline_stage_id, or stage_entered_at to authenticated', () => {
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bexecuted_at\b[^;]*TO authenticated/)
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bpipeline_stage_id\b[^;]*TO authenticated/)
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bstage_entered_at\b[^;]*TO authenticated/)
  })

  it('never GRANTs executed_at, pipeline_stage_id, or stage_entered_at to anon', () => {
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bexecuted_at\b[^;]*TO anon/)
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bpipeline_stage_id\b[^;]*TO anon/)
    expect(migration128).not.toMatch(/GRANT SELECT[^;]*\bstage_entered_at\b[^;]*TO anon/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration128).toContain('HUMAN-GATED')
    expect(migration128).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration128.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
