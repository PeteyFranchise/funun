import { existsSync, readFileSync } from 'fs'
import path from 'path'

const file = path.join(process.cwd(), 'supabase/migrations/243_email_suppressions.sql')
const sql = existsSync(file) ? readFileSync(file, 'utf8') : ''

// Header prose may mention CREATE POLICY / GRANT; strip line comments before
// the negative checks so the prose cannot self-invalidate them.
const code = sql
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

describe('243 email_suppressions', () => {
  it('exists', () => {
    expect(existsSync(file)).toBe(true)
  })

  it('creates the email_suppressions table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.email_suppressions')
  })

  it('makes email the primary key and enforces a normalized, non-empty value', () => {
    expect(code).toMatch(/email\s+TEXT PRIMARY KEY/)
    expect(code).toMatch(/CHECK \(email = lower\(btrim\(email\)\)\)/)
    expect(code).toMatch(/CHECK \(length\(email\) > 0\)/)
  })

  it('has a required non-empty reason, nullable source_event_id and created_at default', () => {
    expect(code).toMatch(/reason\s+TEXT NOT NULL/)
    expect(code).toMatch(/CHECK \(length\(btrim\(reason\)\) > 0\)/)
    expect(code).toMatch(/source_event_id\s+TEXT,/)
    expect(code).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/)
  })

  it('is service-role-only: RLS on, zero policies, zero grants, full REVOKE ALL', () => {
    expect(code).toContain('ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;')
    expect(code).toContain(
      'REVOKE ALL ON public.email_suppressions FROM PUBLIC, anon, authenticated;'
    )
    expect(code).not.toMatch(/CREATE POLICY/i)
    expect(code).not.toMatch(/\bGRANT\b/i)
  })

  it('carries a human-gated table comment', () => {
    expect(code).toContain('COMMENT ON TABLE public.email_suppressions')
    expect(code).toMatch(/HUMAN-GATED: never `supabase db push` from an agent\./)
  })

  it('has no em dashes and no transaction wrapper', () => {
    expect(sql).not.toContain('—')
    expect(code).not.toMatch(/\b(BEGIN|COMMIT)\b/)
  })
})
