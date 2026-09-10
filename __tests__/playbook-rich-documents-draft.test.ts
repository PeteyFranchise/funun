import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
  path.join(process.cwd(), '.planning/quick/260907-playbook-rich-documents/DRAFT-MIGRATION.sql'),
  'utf8'
)

describe('Playbook rich-document draft migration', () => {
  it('is explicitly human-gated and remains outside the migration chain', () => {
    expect(sql).toContain('DRAFT ONLY — DO NOT APPLY')
    expect(sql).toContain('HUMAN-GATED')
  })

  it('adds documents without removing executable SOP and Topic types', () => {
    expect(sql).toContain("CHECK (entry_type IN ('sop', 'topic', 'document'))")
  })

  it('keeps published content live while a proposed revision is pending', () => {
    expect(sql).toContain("SET status = 'published'")
    expect(sql).toContain("WHERE status = 'draft_pending'")
    expect(sql).toContain("AND content <> '{}'::jsonb")
    expect(sql).toContain('AND draft_content IS NOT NULL')
  })

  it('adds independent locks for published revisions and pending drafts', () => {
    expect(sql).toContain('revision_number INTEGER NOT NULL DEFAULT 1')
    expect(sql).toContain('draft_version INTEGER NOT NULL DEFAULT 0')
    expect(sql).toContain('UNIQUE (entry_id, revision_number)')
  })

  it('tracks adopted sources without permitting duplicate source ownership', () => {
    expect(sql).toContain("source_kind IN ('native', 'adopted_markdown')")
    expect(sql).toContain('draft_source_hash TEXT')
    expect(sql).toContain('idx_playbook_entries_adopted_source')
    expect(sql).toContain("WHERE source_kind = 'adopted_markdown' AND source_path IS NOT NULL")
  })

  it('enforces same-room subgroup assignment at the database layer', () => {
    expect(sql).toContain('FOREIGN KEY (sub_group_id, room_id)')
    expect(sql).toContain('REFERENCES public.playbook_sub_groups (id, room_id)')
  })

  it('keeps immutable revisions inaccessible to browser roles', () => {
    expect(sql).toContain('ALTER TABLE public.playbook_entry_revisions ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entry_revisions FROM authenticated, anon'
    )
    expect(sql).not.toMatch(/^\s*CREATE POLICY/m)
  })

  it('connects doctrine to Member CRM Gameplans through a fail-closed table', () => {
    expect(sql).toContain('CREATE TABLE public.playbook_entry_game_plan_links')
    expect(sql).toContain('member_template_id UUID NOT NULL REFERENCES public.member_game_plan_templates')
    expect(sql).toContain('ALTER TABLE public.playbook_entry_game_plan_links ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entry_game_plan_links FROM authenticated, anon'
    )
  })

  it('restricts the transactional metadata function to the service role', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_playbook_entry_metadata')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_playbook_entry_metadata[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_playbook_entry_metadata[\s\S]*TO service_role;/)
  })

  it('records restored retired entries as a new immutable revision', () => {
    expect(sql).toContain("OLD.revision_number + CASE WHEN OLD.published_at IS NOT NULL THEN 1 ELSE 0 END")
    expect(sql).toContain("WHEN OLD.status IN ('archived', 'superseded') THEN 'restore'")
  })

  it('queues each exact owner review reminder once through a service-only function', () => {
    expect(sql).toContain('CREATE TABLE public.playbook_review_reminders')
    expect(sql).toContain('UNIQUE (entry_id, owner_id, review_due_at)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enqueue_due_playbook_review_reminders')
    expect(sql).toContain("'playbook_review_due'")
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.enqueue_due_playbook_review_reminders[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.enqueue_due_playbook_review_reminders[\s\S]*TO service_role;/)
  })

  it('stores revision-specific reading assignments and acknowledgements behind service-role access', () => {
    expect(sql).toContain('CREATE TABLE public.playbook_reading_assignments')
    expect(sql).toContain("target_kind IN ('user', 'role')")
    expect(sql).toContain('required_revision INTEGER NOT NULL CHECK (required_revision > 0)')
    expect(sql).toContain('CREATE TABLE public.playbook_reading_acknowledgements')
    expect(sql).toContain('UNIQUE (assignment_id, user_id, revision_number)')
    expect(sql).toContain('ALTER TABLE public.playbook_reading_assignments ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_reading_assignments FROM authenticated, anon'
    )
    expect(sql).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_reading_acknowledgements FROM authenticated, anon'
    )
  })

  it('queues due-soon and overdue reading reminders once per reader and revision', () => {
    expect(sql).toContain('CREATE TABLE public.playbook_reading_reminders')
    expect(sql).toContain('UNIQUE (assignment_id, user_id, revision_number, reminder_kind)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.enqueue_playbook_reading_reminders')
    expect(sql).toContain("'playbook_reading_due'")
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.enqueue_playbook_reading_reminders[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.enqueue_playbook_reading_reminders[\s\S]*TO service_role;/)
  })
})
