import { readFileSync } from 'fs'
import path from 'path'

const migration133 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/133_user_id_for_email.sql'),
  'utf8'
)

// ─── 133 (260825-m2k Task 1) ─────────────────────────────────────────────
// Text-based lock on user_id_for_email(text) — the id-returning sibling of
// email_has_account (migration 097), locked down byte-for-byte the same
// way: SECURITY DEFINER, SET search_path = public, EXECUTE revoked from
// PUBLIC/anon/authenticated, granted only to service_role, HUMAN-GATED
// footer, schema-cache reload at end of file.

describe('133', () => {
  it('creates user_id_for_email(text) returning uuid', () => {
    expect(migration133).toContain('CREATE OR REPLACE FUNCTION public.user_id_for_email(p_email TEXT)')
    expect(migration133).toContain('RETURNS UUID')
  })

  it('is SECURITY DEFINER with search_path pinned to public', () => {
    expect(migration133).toContain('SECURITY DEFINER')
    expect(migration133).toContain('SET search_path = public')
  })

  it('selects the id from auth.users by case-insensitive email match, limited to one row', () => {
    expect(migration133).toContain(
      'SELECT id FROM auth.users WHERE LOWER(email) = LOWER(p_email) LIMIT 1;'
    )
  })

  it('revokes EXECUTE from PUBLIC/anon/authenticated and grants only to service_role — same lockdown as email_has_account (097)', () => {
    expect(migration133).toContain(
      'REVOKE EXECUTE ON FUNCTION public.user_id_for_email(text) FROM PUBLIC, anon, authenticated;'
    )
    expect(migration133).toContain(
      'GRANT  EXECUTE ON FUNCTION public.user_id_for_email(text) TO service_role;'
    )
  })

  it('never grants EXECUTE to PUBLIC, anon, or authenticated anywhere in the file', () => {
    expect(migration133).not.toMatch(/GRANT\s+EXECUTE[^;]*TO\s+(PUBLIC|anon|authenticated)/)
  })

  it('references email_has_account and supabase/auth#880 in its documentation', () => {
    expect(migration133).toContain('email_has_account')
    expect(migration133).toContain('supabase/auth#880')
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration133).toContain('HUMAN-GATED')
    expect(migration133).toMatch(/never `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration133.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })

  it('declares zero CREATE POLICY statements (no table touched by this migration)', () => {
    expect(migration133).not.toMatch(/^\s*CREATE POLICY/m)
  })
})
