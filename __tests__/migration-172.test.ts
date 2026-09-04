import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/172_audit_integrity_hardening.sql'),
  'utf8'
)
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('migration 172 — audit integrity hardening', () => {
  it('blocks contributors from changing owner-only graduation linkage', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.guard_work_graduation_owner_only()')
    expect(sqlOnly).toContain('NEW.graduated_project_id IS DISTINCT FROM OLD.graduated_project_id')
    expect(sqlOnly).toContain('auth.uid() IS DISTINCT FROM OLD.user_id')
    expect(sqlOnly).toContain('BEFORE UPDATE OF graduated_project_id ON public.works')
  })

  it('replaces split parties and optional sheet state in one service-only transaction', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.replace_split_sheet_parties_transactional')
    expect(sqlOnly).toContain('WHERE id = p_sheet_id\n  FOR UPDATE')
    expect(sqlOnly).toContain('DELETE FROM public.split_sheet_parties WHERE split_sheet_id = p_sheet_id')
    expect(sqlOnly).toContain('last_change_summary = CASE')
    expect(sqlOnly).toContain('GRANT EXECUTE ON FUNCTION public.replace_split_sheet_parties_transactional')
    expect(sqlOnly).toContain('TO service_role')
  })

  it('commits member admission and an optional writer promotion together', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.add_work_member_transactional')
    expect(sqlOnly).toContain('INSERT INTO public.work_members')
    expect(sqlOnly).toContain('PERFORM public.replace_split_sheet_parties_transactional')
  })

  it('claims and completes blanket agreements with listing fan-out atomically', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.claim_blanket_agreement_completion')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.complete_blanket_agreement_completion')
    expect(sqlOnly).toContain("SET status = 'pending_admit'")
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.reconcile_blanket_agreement_listings')
  })

  it('makes recording completion, branching, and collections transactional and idempotent', () => {
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.complete_idea_recording_transactional')
    expect(sqlOnly).toContain("'idea-recording:' || p_recording_id::TEXT")
    expect(sqlOnly).toContain('ON CONFLICT DO NOTHING')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.branch_idea_transactional')
    expect(sqlOnly).toContain('branch_request_id')
    expect(sqlOnly.match(/branch_request_id = p_request_id/g)).toHaveLength(2)
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.add_idea_to_collection_transactional')
    expect(sqlOnly).toContain('CREATE OR REPLACE FUNCTION public.remove_idea_from_collection_transactional')
  })

  it('preserves the original recorder when adding one Idea take to a work', () => {
    expect(sqlOnly).toContain('COALESCE(recording_row.created_by, p_actor)')
    expect(sqlOnly).toContain('FOR UPDATE')
  })

  it('keeps every mutation function private to the service role', () => {
    for (const name of [
      'replace_split_sheet_parties_transactional',
      'add_work_member_transactional',
      'claim_blanket_agreement_completion',
      'complete_blanket_agreement_completion',
      'complete_idea_recording_transactional',
      'branch_idea_transactional',
      'add_idea_to_collection_transactional',
      'remove_idea_from_collection_transactional',
    ]) {
      expect(sqlOnly).toContain(`REVOKE ALL ON FUNCTION public.${name}`)
    }
  })
})
