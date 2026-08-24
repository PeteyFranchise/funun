import { readFileSync } from 'fs'
import path from 'path'

const migration129 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/129_health_rules_owner_defaults.sql'),
  'utf8'
)

// ─── 129 (31.1 gap closure) ─────────────────────────────────────────────
// Text-based lock on the health_rules_config owner-defaults correction:
// the UPDATE fixing the seeded singleton row to good=30/warning=60
// (at_risk stays 180, cold forced to 180 to match at_risk per the
// 3-threshold model), the matching column-default ALTERs so fresh
// environments seed the same numbers, the migration-112/128 HUMAN-GATED
// provenance doctrine, and the NOTIFY reload footer.

describe('129', () => {
  it('updates the seeded singleton row to good=30, warning=60', () => {
    expect(migration129).toMatch(/UPDATE public\.health_rules_config/)
    expect(migration129).toMatch(/good_within_days\s*=\s*30/)
    expect(migration129).toMatch(/warning_after_days\s*=\s*60/)
    expect(migration129).toMatch(/WHERE id = 1;/)
  })

  it('forces cold_after_days to 180 (equal to at_risk_after_days) on the seeded row', () => {
    expect(migration129).toMatch(/cold_after_days\s*=\s*180/)
  })

  it('does NOT touch at_risk_after_days on the seeded row (already 180, matches the owner number)', () => {
    expect(migration129).not.toMatch(/at_risk_after_days\s*=\s*\d+/)
  })

  it('sets the three ALTER COLUMN ... SET DEFAULT lines for fresh environments', () => {
    expect(migration129).toContain('ALTER TABLE public.health_rules_config')
    expect(migration129).toMatch(/ALTER COLUMN good_within_days\s+SET DEFAULT 30/)
    expect(migration129).toMatch(/ALTER COLUMN warning_after_days\s+SET DEFAULT 60/)
    expect(migration129).toMatch(/ALTER COLUMN cold_after_days\s+SET DEFAULT 180/)
  })

  it('does not edit migrations 001-128 (this file only touches 129)', () => {
    expect(migration129).toContain('Do NOT edit migrations 001-128')
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration129).toContain('HUMAN-GATED')
    expect(migration129).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration129.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
