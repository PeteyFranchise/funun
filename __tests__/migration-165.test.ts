import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/165_writer_room_take_workflow_handoff.sql'),
  'utf8'
)
const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe("migration 165 — Writer's Room take workflow and producer handoff", () => {
  it('adds a same-work active working-take pointer and clears it on archive', () => {
    expect(sqlOnly).toContain('ADD COLUMN working_version_id UUID REFERENCES public.work_versions(id) ON DELETE SET NULL')
    expect(sqlOnly).toContain('version.work_id = NEW.id')
    expect(sqlOnly).toContain('version.archived_at IS NULL')
    expect(sqlOnly).toContain('CREATE TRIGGER trg_validate_work_working_version')
    expect(sqlOnly).toContain('CREATE TRIGGER trg_clear_archived_working_version')
    expect(sqlOnly).toContain('SET working_version_id = NULL')
  })

  it('stores immutable private handoffs with member-only reads', () => {
    expect(sqlOnly).toContain('CREATE TABLE public.work_recording_handoffs')
    expect(sqlOnly).toContain('UNIQUE (rough_version_id)')
    expect(sqlOnly).toContain('ALTER TABLE public.work_recording_handoffs ENABLE ROW LEVEL SECURITY')
    expect(sqlOnly).toContain('CREATE POLICY work_recording_handoffs_select')
    expect(sqlOnly).toContain('REVOKE ALL ON public.work_recording_handoffs FROM PUBLIC, anon, authenticated')
    expect(sqlOnly).toContain('GRANT SELECT ON public.work_recording_handoffs TO authenticated')
    expect(sqlOnly).not.toMatch(/GRANT (INSERT|UPDATE|DELETE).*work_recording_handoffs/)
  })

  it('binds the saved rough, session creator and another claimed room recipient', () => {
    expect(sqlOnly).toContain('session.rendered_version_id = NEW.rough_version_id')
    expect(sqlOnly).toContain("session.status = 'saved'")
    expect(sqlOnly).toContain("version.source = 'recording'")
    expect(sqlOnly).toContain('NEW.recipient_user_id = NEW.created_by')
    expect(sqlOnly).toContain('public.work_member_tier(NEW.work_id, NEW.recipient_user_id) IS NOT NULL')
  })

  it('captures the handoff in the append-only diary without touching formal master or rights state', () => {
    expect(sqlOnly).toContain("'producer_handoff'")
    expect(sqlOnly).toContain('CREATE TRIGGER trg_capture_work_recording_handoff')
    expect(sqlOnly).toContain("'roughVersionId', NEW.rough_version_id")
    expect(sqlOnly).not.toContain('song_passport_master_designations')
    expect(sqlOnly).not.toContain('split_sheets')
    expect(sqlOnly).not.toContain('vault_projects')
  })
})
