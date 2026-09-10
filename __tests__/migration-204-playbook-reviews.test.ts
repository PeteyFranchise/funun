import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), '.planning/quick/260908-playbook-review-notes/204_playbook_review_threads.sql'),
  'utf8'
)

describe('Playbook migration candidate 204', () => {
  it('stays human-gated and records its dependency order', () => {
    expect(migration).toContain('HUMAN-GATED MIGRATION CANDIDATE')
    expect(migration).toContain('Depends on Playbook candidates 201 and 202')
    expect(migration).toContain('Migration 200 is taken')
    expect(migration).toContain('migration 203 is permanently retired')
  })

  it('stores exact review targets and distinguishes advisory suggestions from requested changes', () => {
    expect(migration).toContain('CREATE TABLE public.playbook_review_rounds')
    expect(migration).toContain('content_snapshot       JSONB NOT NULL')
    expect(migration).toContain("'awaiting_review', 'changes_requested', 'ready_for_rereview'")
    expect(migration).toContain("target_kind IN ('draft', 'published')")
    expect(migration).toContain('target_revision_number INTEGER NOT NULL')
    expect(migration).toContain('target_draft_version')
    expect(migration).toContain("feedback_kind IN ('suggestion', 'requested_change')")
  })

  it('protects review data from browser access and makes history append-only', () => {
    for (const table of ['playbook_review_rounds', 'playbook_review_threads', 'playbook_review_messages', 'playbook_review_mentions', 'playbook_review_events', 'playbook_review_round_events']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`REVOKE SELECT, INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon`)
    }
    expect(migration).toContain('Playbook review history is append-only')
    expect(migration).toContain('protect_playbook_review_messages')
    expect(migration).toContain('protect_playbook_review_events')
    expect(migration).toContain('protect_playbook_review_thread_identity')
    expect(migration).toContain('protect_playbook_review_round_identity')
  })

  it('restricts transactional write functions to the service role', () => {
    for (const fn of ['create_playbook_review_thread', 'reply_to_playbook_review_thread', 'transition_playbook_review_thread', 'resubmit_playbook_review_round', 'complete_playbook_review_round', 'record_playbook_review_decision_summary']) {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*FROM PUBLIC, authenticated, anon;`))
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*TO service_role;`))
    }
  })

  it('uses hardened search paths and revokes browser execution from trigger helpers', () => {
    expect(migration).not.toMatch(/SET search_path\s*=\s*(?:public|pg_catalog\s*,\s*public)/i)
    expect(migration.match(/SET search_path = ''/g)?.length).toBe(10)
    for (const fn of ['prevent_playbook_review_history_mutation', 'protect_playbook_review_round_identity', 'protect_playbook_review_thread_identity', 'complete_playbook_review_round_on_approval']) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, authenticated, anon;`)
    }
  })

  it('requires edits and addressed requests before creating a linked re-review round', () => {
    expect(migration).toContain('v_entry.draft_version <= COALESCE(v_previous.target_draft_version, 0)')
    expect(migration).toContain("feedback_kind = 'requested_change' AND status = 'open'")
    expect(migration).toContain("v_entry.draft_content, 'ready_for_rereview', p_actor_id, v_previous.id")
    expect(migration).toContain('complete_playbook_review_round_after_approval')
  })
})
