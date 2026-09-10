import { readFileSync } from 'fs'
import path from 'path'

const candidateRoot = '.planning/quick/260907-playbook-doctrine-publication-uat'
const migration201 = readFileSync(path.join(process.cwd(), candidateRoot, '201_playbook_rich_documents.sql'), 'utf8')
const migration202 = readFileSync(path.join(process.cwd(), candidateRoot, '202_playbook_reading_operations.sql'), 'utf8')

describe('Playbook migrations 201–202', () => {
  it('uses the live-ledger reservation and stays human-gated', () => {
    expect(migration201).toContain('CANDIDATE migration 201 (reserved by the live migration ledger)')
    expect(migration202).toContain('CANDIDATE migration 202 (reserved by the live migration ledger)')
    expect(migration201).toContain('HUMAN-GATED')
    expect(migration202).toContain('HUMAN-GATED')
    expect(migration202).toContain('DEPENDS ON migration 201')
  })

  it('keeps rich-document schema and reading operations in dependency order', () => {
    expect(migration201).toContain("CHECK (entry_type IN ('sop', 'topic', 'document'))")
    expect(migration201).toContain('CREATE TABLE public.playbook_entry_revisions')
    expect(migration201).not.toContain('CREATE TABLE public.playbook_reading_assignments')
    expect(migration202).toContain('CREATE TABLE public.playbook_reading_assignments')
    expect(migration202).toContain('REFERENCES public.playbook_entries(id)')
  })

  it('installs approved rooms conservatively and never grants Trust and Safety implicitly', () => {
    expect(migration201).toContain("('talent-services',      'Talent Services & Member Success'")
    expect(migration201).toContain("('trust-safety',         'Trust & Safety'")
    expect(migration201).not.toMatch(/\('trust-safety',\s*'(?:ae|bd|anr|it|legal|tms|accounting|marketing)'\)/)
    expect(migration201).toContain('Leadership-only because no dedicated staff role exists')
  })

  it('keeps every new table inaccessible to browser roles', () => {
    for (const table of ['playbook_entry_revisions', 'playbook_entry_game_plan_links', 'playbook_review_reminders']) {
      expect(migration201).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration201).toContain(`REVOKE SELECT, INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon`)
    }
    for (const table of ['playbook_reading_assignments', 'playbook_reading_acknowledgements', 'playbook_reading_reminders']) {
      expect(migration202).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration202).toContain(`REVOKE SELECT, INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon`)
    }
  })

  it('restricts every new callable operation to service_role', () => {
    expect(migration201).toMatch(/REVOKE ALL ON FUNCTION public\.set_playbook_entry_metadata[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(migration201).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_playbook_entry_metadata[\s\S]*TO service_role;/)
    expect(migration201).toMatch(/REVOKE ALL ON FUNCTION public\.enqueue_due_playbook_review_reminders[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(migration202).toMatch(/REVOKE ALL ON FUNCTION public\.enqueue_playbook_reading_reminders[\s\S]*FROM PUBLIC, authenticated, anon;/)
  })

  it('hardens every candidate function with an empty search path', () => {
    expect(migration201).not.toContain('SET search_path = public')
    expect(migration202).not.toContain('SET search_path = public')
    expect(migration201.match(/SET search_path = ''/g)).toHaveLength(4)
    expect(migration202.match(/SET search_path = ''/g)).toHaveLength(1)
    expect(migration201).toMatch(/REVOKE ALL ON FUNCTION public\.prepare_playbook_entry_publication\(\)[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(migration201).toMatch(/REVOKE ALL ON FUNCTION public\.capture_playbook_entry_revision\(\)[\s\S]*FROM PUBLIC, authenticated, anon;/)
  })

  it('fails both reminder RPCs closed until activation exists', () => {
    for (const migration of [migration201, migration202]) {
      expect(migration).toContain("pg_catalog.to_regclass('public.playbook_feature_controls') IS NULL")
      expect(migration).toContain("pg_catalog.to_regclass('public.playbook_feature_cohort_grants') IS NULL")
      expect(migration).toContain("pg_catalog.to_regclass('public.playbook_beta_cohorts') IS NULL")
      expect(migration).toContain("pg_catalog.to_regclass('public.playbook_beta_cohort_members') IS NULL")
      expect(migration).toMatch(/THEN\s+RETURN 0;/)
    }
  })

  it('gates each notification recipient through an active cohort grant', () => {
    expect(migration201).toContain("control.feature_key = 'review_reminders'")
    expect(migration201).toContain('cohort_member.user_id = entry.owner_id')
    expect(migration202).toContain("control.feature_key = 'reading_reminders'")
    expect(migration202).toContain('cohort_member.user_id = staff.user_id')
    for (const migration of [migration201, migration202]) {
      expect(migration).toContain('control.enabled')
      expect(migration).toContain('NOT control.emergency_disabled')
      expect(migration).toContain("cohort.status = 'active'")
      expect(migration).toContain('feature_grant.revoked_at IS NULL')
      expect(migration).toContain('cohort_member.revoked_at IS NULL')
      expect(migration).toContain('cohort_member.expires_at > now()')
    }
  })
})
