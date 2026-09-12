import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/218_auth_diagnostic_events.sql'),
  'utf8'
)

describe('migration 218 auth diagnostics', () => {
  it('is human-gated and creates a constrained RLS table', () => {
    expect(sql).toContain('HUMAN-GATED MIGRATION')
    expect(sql).toContain('CREATE TABLE public.auth_diagnostic_events')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain("CHECK (correlation_id ~ '^AUTH-[A-F0-9]{12}$')")
  })

  it('revokes all browser grants and grants only the minimum service operations', () => {
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.auth_diagnostic_events TO service_role')
    expect(sql).not.toContain('GRANT SELECT, INSERT, DELETE ON TABLE public.auth_diagnostic_events TO service_role')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.prune_auth_diagnostic_events()')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain("SET search_path = ''")
    expect(sql).toContain("WHERE created_at < now() - interval '30 days'")
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.prune_auth_diagnostic_events()')
    expect(sql).not.toContain('GRANT UPDATE')
  })

  it.each(['email', 'user_id', 'ip_address', 'user_agent', 'provider_error', 'token'])(
    'does not define a sensitive %s column',
    column => {
      const createBody = sql.match(/CREATE TABLE[\s\S]*?\n\);/)?.[0] ?? ''
      expect(createBody).not.toMatch(new RegExp(`^\\s*${column}\\s`, 'm'))
    }
  )
})
