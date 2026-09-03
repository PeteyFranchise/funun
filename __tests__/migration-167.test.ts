import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/167_returned_mix_review.sql'), 'utf8')
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 167 — optional returned-mix review', () => {
  it('stores one immutable member-private outcome per producer return', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoff_return_reviews')
    expect(sqlOnly).toContain('return_id    UUID PRIMARY KEY')
    expect(sqlOnly).toContain("outcome IN ('made_working', 'kept_current')")
    expect(sqlOnly).toContain('CREATE POLICY work_recording_handoff_return_reviews_select')
    expect(sqlOnly).toContain('REVOKE ALL ON public.work_recording_handoff_return_reviews FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*work_recording_handoff_return_reviews/)
  })

  it('atomically validates current room access and an active same-work returned take', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.review_producer_mix_return')
    expect(sqlOnly).toContain('public.is_work_owner(returned.work_id, p_reviewer)')
    expect(sqlOnly).toContain('public.work_member_tier(returned.work_id, p_reviewer) IS NOT NULL')
    expect(sqlOnly).toContain('version.id = returned.version_id')
    expect(sqlOnly).toContain('version.work_id = returned.work_id')
    expect(sqlOnly).toContain('version.archived_at IS NULL')
    expect(sqlOnly).toContain('ON CONFLICT (return_id) DO NOTHING')
  })

  it('updates only the creative working pointer for the made-working outcome', () => {
    expect(sqlOnly).toContain("IF p_outcome = 'made_working' THEN")
    expect(sqlOnly).toContain('SET working_version_id = returned.version_id')
    expect(sqlOnly).not.toContain('song_passport_master_designations')
    expect(sqlOnly).not.toContain('split_sheets')
    expect(sqlOnly).not.toContain('vault_projects')
    expect(sqlOnly).not.toMatch(/\b(approved|rejected)_at\b/)
  })

  it('captures the optional outcome in the private diary', () => {
    expect(sqlOnly).toContain("'producer_mix_reviewed'")
    expect(sqlOnly).toContain('trg_capture_producer_mix_review')
    expect(sqlOnly).toContain("'outcome', NEW.outcome")
  })
})
