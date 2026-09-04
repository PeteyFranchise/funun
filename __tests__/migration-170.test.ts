import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/170_global_user_account_capture.sql'), 'utf8')
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 170 — User Account global capture', () => {
  it('structurally limits Ideas identities to User Accounts', () => {
    expect(sqlOnly).toContain('FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)')
    expect(sqlOnly).toContain('idea_members_user_account_fk')
    expect(sqlOnly).toContain('idea_share_links_claim_user_account_fk')
    expect(sqlOnly).toContain('idea_recordings_creator_user_account_fk')
    expect(sqlOnly).toContain('idea_comments_author_user_account_fk')
  })

  it('atomically and idempotently bridges one owned recording into an accessible room', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.add_idea_recording_to_work')
    expect(sqlOnly).toContain('FROM public.user_profiles profile')
    expect(sqlOnly).toContain('idea.user_id = p_actor')
    expect(sqlOnly).toContain('public.work_member_tier(p_work_id, p_actor) IS NOT NULL')
    expect(sqlOnly).toContain('IF existing_version_id IS NOT NULL THEN')
    expect(sqlOnly).toContain('INSERT INTO public.idea_work_version_links')
  })

  it('does not touch rights, splits, registrations, masters, or releases', () => {
    expect(sqlOnly).not.toContain('split_sheet_parties')
    expect(sqlOnly).not.toContain('split_percentage')
    expect(sqlOnly).not.toContain('vault_projects')
    expect(sqlOnly).not.toContain('song_passport_master_designations')
    expect(sqlOnly).not.toContain('rights_status')
  })

  it('keeps the bridge service-only', () => {
    expect(sqlOnly).toContain('REVOKE EXECUTE ON FUNCTION public.add_idea_recording_to_work')
    expect(sqlOnly).toContain('FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toContain('TO service_role')
  })
})
