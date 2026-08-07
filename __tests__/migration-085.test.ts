import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/085_industry_capability_green_room_gate.sql'),
  'utf8'
)

describe('migration 085 — industry capability grant write + Green Room member_type RLS gate', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  it('preserves the curator early-return branch verbatim', () => {
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN")
    expect(migration).toContain('RETURN NEW;')
  })

  it('preserves the artist default branch (bare user_profiles insert, no member_type column)', () => {
    expect(migration).toContain('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
  })

  it('inside the industry branch, writes an approved industry capability_grants row with source=signup', () => {
    const industryBranchStart = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    expect(industryBranchStart).toBeGreaterThan(-1)
    const industryBranch = migration.slice(industryBranchStart, industryBranchStart + 2500)
    expect(industryBranch).toContain('INSERT INTO public.capability_grants')
    expect(industryBranch).toContain("'industry'")
    expect(industryBranch).toContain("'approved'")
    expect(industryBranch).toContain("'signup'")
  })

  it('wraps the trigger-time capability_grants insert in a nested exception-isolation block', () => {
    const industryBranchStart = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    const industryBranch = migration.slice(industryBranchStart, industryBranchStart + 2500)
    const grantInsertIdx = industryBranch.indexOf('INSERT INTO public.capability_grants')
    const beforeGrant = industryBranch.slice(0, grantInsertIdx)
    const afterGrant = industryBranch.slice(grantInsertIdx)
    expect(beforeGrant.trim().endsWith('BEGIN')).toBe(true)
    expect(afterGrant).toContain('EXCEPTION WHEN OTHERS THEN')
  })

  it('backfills approved industry grants for existing member_type=industry profiles that lack one, idempotently', () => {
    expect(migration).toMatch(/INSERT INTO capability_grants[\s\S]*?SELECT[\s\S]*?FROM public\.user_profiles up/)
    expect(migration).toContain("up.member_type = 'industry'")
    expect(migration).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM capability_grants cg/)
    expect(migration).toContain("cg.capability = 'industry'")
    expect(migration).toContain("cg.status = 'approved'")
  })

  it('drops and re-creates green_room_posts_insert_own rather than stacking a second policy', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts')
    expect(migration).toContain('CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT TO authenticated')
  })

  it('the new green_room_posts_insert_own WITH CHECK keeps author_id=auth.uid() AND adds a member_type EXISTS gate', () => {
    const policyStart = migration.indexOf('CREATE POLICY "green_room_posts_insert_own" ON green_room_posts FOR INSERT')
    expect(policyStart).toBeGreaterThan(-1)
    const policy = migration.slice(policyStart, policyStart + 600)
    expect(policy).toContain('author_id = auth.uid()')
    expect(policy).toContain('EXISTS (')
    expect(policy).toContain('FROM public.user_profiles')
    expect(policy).toMatch(/member_type IN \(\s*'artist',\s*'industry'\s*\)/)
  })

  it('does not delete the curator branch, does not drop industry_profiles, does not stack a duplicate policy leftover', () => {
    expect(migration).not.toMatch(/DROP\s+.*curator.*branch/i)
    expect(migration).not.toContain("DELETE")
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).not.toContain('industry_profiles')
  })

  it('leaves green_room_posts_update_own untouched (no DROP POLICY for it)', () => {
    expect(migration).not.toContain('DROP POLICY IF EXISTS "green_room_posts_update_own"')
  })

  it('uses source=backfill (not a new enum value) for the backfill insert', () => {
    const backfillIdx = migration.indexOf('NOT EXISTS')
    const nearBackfill = migration.slice(Math.max(0, backfillIdx - 800), backfillIdx + 200)
    expect(nearBackfill).toContain("'backfill'")
  })

  it('is human-gated — carries a comment noting it must be pushed by the owner, never by an agent', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
  })
})
