import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/087_green_room_eligibility_security_definer.sql'),
  'utf8'
)

describe('migration 087 — Green Room eligibility via SECURITY DEFINER helper (fixes the 085 inline-subquery RLS)', () => {
  it('defines is_green_room_eligible as a SECURITY DEFINER, STABLE, search_path-locked function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_green_room_eligible(p_uid uuid)')
    expect(migration).toMatch(/LANGUAGE sql STABLE SECURITY DEFINER/i)
    expect(migration).toMatch(/SET search_path = ''/)
  })

  it('the helper checks user_profiles member_type IN (artist, industry) for the passed uid', () => {
    const fnStart = migration.indexOf('is_green_room_eligible(p_uid uuid)')
    const fn = migration.slice(fnStart, fnStart + 400)
    expect(fn).toContain('FROM public.user_profiles')
    expect(fn).toContain('id = p_uid')
    expect(fn).toMatch(/member_type IN \(\s*'artist',\s*'industry'\s*\)/)
  })

  it('locks down EXECUTE — revokes from PUBLIC/anon/authenticated, grants only to authenticated (mirrors is_buyer_org_member)', () => {
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.is_green_room_eligible\(uuid\) FROM PUBLIC, anon, authenticated/)
    expect(migration).toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.is_green_room_eligible\(uuid\) TO authenticated/)
  })

  it('rewrites green_room_posts_insert_own to CALL the helper — no inline EXISTS subquery', () => {
    const policyStart = migration.indexOf('CREATE POLICY "green_room_posts_insert_own"')
    expect(policyStart).toBeGreaterThan(-1)
    const policy = migration.slice(policyStart, policyStart + 400)
    expect(policy).toContain('author_id = auth.uid()')
    expect(policy).toContain('public.is_green_room_eligible(auth.uid())')
    // the whole point: the policy must NOT hand-write an inline subquery against user_profiles
    expect(policy).not.toContain('EXISTS')
    expect(policy).not.toContain('FROM public.user_profiles')
  })

  it('DROP+CREATE (not stacked) and leaves green_room_posts_update_own untouched', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts')
    expect(migration).not.toContain('DROP POLICY IF EXISTS "green_room_posts_update_own"')
  })

  it('is function+policy only — no destructive DDL, does not touch migration 085 objects it should leave alone', () => {
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).not.toContain('DROP FUNCTION')
    expect(migration).not.toContain('handle_new_user')
    expect(migration).not.toContain('capability_grants')
  })

  it('is human-gated — carries the owner-push comment', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
  })
})
