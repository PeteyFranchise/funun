import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/206_playbook_enablement_platform.sql'), 'utf8')

describe('Playbook enablement migration 206', () => {
  it('stays human-gated behind the reconciled migration sequence', () => {
    expect(migration).toContain('Migration 206 — HUMAN-GATED')
    expect(migration).toContain('DEPENDS ON migrations 201, 202, 204, and 205')
    expect(migration).toContain('HUMAN-GATED')
    expect(migration).toContain('Migration 203 is permanently')
  })

  it('contains the durable state for releases 17 through 26', () => {
    for (const table of ['playbook_media_assets','playbook_learning_paths','playbook_reader_feedback','playbook_assistant_runs','playbook_workflow_templates','playbook_exceptions','playbook_incidents','playbook_entry_translations','playbook_glossary_terms','playbook_user_preferences']) {
      expect(migration).toContain(`CREATE TABLE public.${table}`)
    }
  })

  it('pins operational work to published doctrine revisions', () => {
    expect(migration).toContain('source_revision_number INTEGER NOT NULL')
    expect(migration.match(/revision_number INTEGER NOT NULL CHECK \(revision_number > 0\)/g)?.length).toBeGreaterThanOrEqual(3)
    expect(migration).toContain('runbook_revision_number INTEGER CHECK')
  })

  it('enables RLS and revokes browser CRUD for every new table through a closed list', () => {
    expect(migration).toContain('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('REVOKE SELECT, INSERT, UPDATE, DELETE ON public.%I FROM authenticated, anon')
    expect(migration).toContain("'playbook_user_preferences'")
  })

  it('makes feedback, exception, and incident histories append-only', () => {
    expect(migration).toContain('Playbook enablement history is append-only')
    expect(migration).toContain('protect_playbook_feedback_events')
    expect(migration).toContain('protect_playbook_exception_events')
    expect(migration).toContain('protect_playbook_incident_events')
  })

  it('hardens the append-only trigger function against search-path and browser-role exposure', () => {
    expect(migration).not.toMatch(/SET search_path\s*=\s*(?:public|pg_catalog\s*,\s*public)/i)
    expect(migration).toContain("SET search_path = ''")
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.prevent_playbook_enablement_event_mutation() FROM PUBLIC, authenticated, anon;')
  })
})
