import { readFileSync } from 'fs'
import path from 'path'

const migration100 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/100_waitlist_atomic_upsert.sql'),
  'utf8'
)

// ─── 100 (27-CODEX-REVIEW.md H2) ──────────────────────────────────────────
// Text-based lock on upsert_artist_waitlist(): the single-statement atomic
// upsert, its lockdown (SECURITY DEFINER, search_path='', REVOKE/GRANT),
// and that it targets the SAME functional index migration 097 created —
// mirrors the migration-095/098/099 text-test convention (no local
// Postgres in this test harness).

describe('100', () => {
  it('defines upsert_artist_waitlist as SECURITY DEFINER with a locked search_path', () => {
    expect(migration100).toContain('CREATE OR REPLACE FUNCTION public.upsert_artist_waitlist(')
    expect(migration100).toContain('SECURITY DEFINER')
    expect(migration100).toContain("SET search_path = ''")
  })

  it('does a single atomic INSERT ... ON CONFLICT (LOWER(email)) DO UPDATE', () => {
    expect(migration100).toContain('INSERT INTO public.artist_waitlist (email, name, note)')
    expect(migration100).toContain('ON CONFLICT (LOWER(email)) DO UPDATE')
  })

  it('always clears unsubscribed_at on conflict (D-19 auto-resubscribe, unchanged)', () => {
    const conflictStart = migration100.indexOf('ON CONFLICT (LOWER(email)) DO UPDATE')
    const conflictBlock = migration100.slice(conflictStart, migration100.indexOf('RETURNING', conflictStart))
    expect(conflictBlock).toContain('unsubscribed_at  = NULL')
  })

  it('revokes EXECUTE from PUBLIC/anon/authenticated and grants only to service_role', () => {
    expect(migration100).toContain(
      'REVOKE EXECUTE ON FUNCTION public.upsert_artist_waitlist(text, text, text) FROM PUBLIC, anon, authenticated;'
    )
    expect(migration100).toContain(
      'GRANT  EXECUTE ON FUNCTION public.upsert_artist_waitlist(text, text, text) TO service_role;'
    )
  })

  it('is never exposed to PostgREST directly (documented in the function comment)', () => {
    expect(migration100).toContain('Never exposed to PostgREST directly')
  })
})
