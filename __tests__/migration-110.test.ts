import { readFileSync } from 'fs'
import path from 'path'

const migration110 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/110_observability_config.sql'),
  'utf8'
)

// ─── 110 (32-01 Task 2) ────────────────────────────────────────────────
// Text-based lock on observability_recipients: the table + its columns,
// the role CHECK constraint, zero-policy RLS (enabled, no CREATE POLICY
// against this table), the HUMAN-GATED footer, and the trailing NOTIFY
// pgrst — mirrors the migration-100/108 text-test convention (no local
// Postgres in this test harness).

describe('110', () => {
  it('creates observability_recipients with id, email, role, created_at', () => {
    expect(migration110).toContain('CREATE TABLE public.observability_recipients')
    expect(migration110).toContain('id         uuid        PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(migration110).toContain('email      text        NOT NULL')
    expect(migration110).toContain("role       text        NOT NULL CHECK (role IN ('primary', 'backup', 'watcher'))")
    expect(migration110).toContain('created_at timestamptz NOT NULL DEFAULT now()')
  })

  it('enables row level security and defines ZERO policies against observability_recipients (service-role-only)', () => {
    expect(migration110).toContain('ALTER TABLE public.observability_recipients ENABLE ROW LEVEL SECURITY')
    expect(migration110).not.toMatch(/CREATE POLICY[\s\S]*?ON public\.observability_recipients/i)
  })

  it('documents the D-10/D-04 rationale on the table', () => {
    expect(migration110).toContain('COMMENT ON TABLE public.observability_recipients IS')
    expect(migration110).toContain('D-10')
    expect(migration110).toContain('D-04')
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration110).toContain('HUMAN-GATED')
    expect(migration110).toContain('never runs `supabase db push` from an agent')
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration110.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
