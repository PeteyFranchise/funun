import { readFileSync } from 'fs'
import path from 'path'

// Structural assertions on migration 116 (audit #7 — durable rate limiter).
const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/116_durable_rate_limiter.sql'),
  'utf8'
)
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 116 — durable rate limiter', () => {
  it('creates the rate_limit_hits table + a (key, hit_at) index', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.rate_limit_hits/)
    expect(sql).toMatch(/CREATE INDEX[\s\S]*rate_limit_hits \(key, hit_at\)/)
  })

  it('defines check_rate_limit as SECURITY DEFINER with a locked search_path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.check_rate_limit(')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
  })

  it('serializes per key with an advisory lock so the count→insert is atomic', () => {
    expect(sql).toContain('pg_advisory_xact_lock(hashtext(p_key))')
  })

  it('grants EXECUTE only to service_role and revokes it from anon/authenticated', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.check_rate_limit[\s\S]*authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.check_rate_limit[\s\S]*TO service_role/)
  })

  it('locks the rate_limit_hits table from authenticated/anon (RLS + REVOKE)', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(/REVOKE ALL ON public\.rate_limit_hits FROM authenticated, anon/)
  })
})
