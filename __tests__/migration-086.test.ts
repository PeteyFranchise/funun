import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/086_restore_buyer_branch_handle_new_user.sql'),
  'utf8'
)

describe('migration 086 — restore the buyer branch in handle_new_user() (fixes the 085 regression)', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  it('RESTORES the buyer early-return branch that migration 085 dropped', () => {
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN")
    const buyerIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'buyer'")
    const buyerBranch = migration.slice(buyerIdx, buyerIdx + 120)
    expect(buyerBranch).toContain('RETURN NEW;')
  })

  it('orders the branches curator → buyer → industry → artist (buyer early-return BEFORE any insert)', () => {
    const curatorIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'curator'")
    const buyerIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'buyer'")
    const industryIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    const artistIdx = migration.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
    expect(curatorIdx).toBeGreaterThan(-1)
    expect(buyerIdx).toBeGreaterThan(curatorIdx)
    expect(industryIdx).toBeGreaterThan(buyerIdx)
    expect(artistIdx).toBeGreaterThan(industryIdx)
  })

  it('the buyer branch is a BARE RETURN NEW — no user_profiles/subscriptions insert between buyer and industry', () => {
    const buyerIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'buyer'")
    const industryIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    const betweenBuyerAndIndustry = migration.slice(buyerIdx, industryIdx)
    expect(betweenBuyerAndIndustry).toContain('RETURN NEW;')
    expect(betweenBuyerAndIndustry).not.toContain('INSERT INTO public.user_profiles')
    expect(betweenBuyerAndIndustry).not.toContain('INSERT INTO public.subscriptions')
  })

  it('retains the curator early-return branch', () => {
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN")
  })

  it('retains migration 085 industry capability grant insert (source=signup, approved) inside the industry branch', () => {
    const industryIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    const industryBranch = migration.slice(industryIdx, industryIdx + 2500)
    expect(industryBranch).toContain('INSERT INTO public.capability_grants')
    expect(industryBranch).toContain("'approved'")
    expect(industryBranch).toContain("'signup'")
  })

  it('retains the artist default branch (bare user_profiles insert + claim_collaborators)', () => {
    expect(migration).toContain('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
    expect(migration).toContain('public.claim_collaborators(NEW.id, NEW.email)')
  })

  it('is function-only — does NOT re-run migration 085 already-applied parts (backfill / Green Room policy)', () => {
    // (green_room_posts is referenced only in the explanatory header comment — the real
    // invariant is that 086 performs no policy DDL and no backfill, only the function replace.)
    expect(migration).not.toContain('CREATE POLICY')
    expect(migration).not.toContain('DROP POLICY')
    expect(migration).not.toContain("'backfill'")
  })

  it('does not delete/drop anything or reference the dead industry_profiles table', () => {
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).not.toContain('DELETE')
    expect(migration).not.toContain('industry_profiles')
  })

  it('is human-gated — carries a comment noting the owner pushes it, never an agent', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
  })
})
