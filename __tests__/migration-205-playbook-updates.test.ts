import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), '.planning/quick/260908-playbook-change-broadcast/205_playbook_change_broadcasts.sql'),
  'utf8'
)

describe('Playbook migration candidate 205', () => {
  it('stays human-gated and records the reserved dependency sequence', () => {
    expect(migration).toContain('CANDIDATE migration 205')
    expect(migration).toContain('DEPENDS ON Playbook candidates 201, 202, and 204')
    expect(migration).toContain('Migration 200 is taken')
    expect(migration).toContain('migration 203 is permanently retired')
    expect(migration).toContain('HUMAN-GATED')
  })

  it('models revision-linked internal updates and exact audiences', () => {
    expect(migration).toContain('CREATE TABLE public.playbook_change_broadcasts')
    expect(migration).toContain('revision_number       INTEGER NOT NULL')
    expect(migration).toContain("audience_kind IN ('all_team', 'role', 'user')")
    expect(migration).toContain("priority IN ('standard', 'important', 'urgent')")
    expect(migration).toContain('CREATE TABLE public.playbook_change_broadcast_reads')
  })

  it('keeps browser roles away from service-mediated update data', () => {
    for (const table of ['playbook_change_broadcasts', 'playbook_change_broadcast_reads']) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(migration).toContain(`REVOKE SELECT, INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon`)
    }
  })

  it('publishes the broadcast, assignments, and notifications atomically', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.publish_playbook_change_broadcast')
    expect(migration).toContain('INSERT INTO public.playbook_reading_assignments')
    expect(migration).toContain('INSERT INTO public.notifications')
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.publish_playbook_change_broadcast[\s\S]*FROM PUBLIC, authenticated, anon;/)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.publish_playbook_change_broadcast[\s\S]*TO service_role;/)
  })

  it('makes published update history append-only while leaving per-user read state mutable', () => {
    expect(migration).toContain('Published Playbook change broadcasts are append-only')
    expect(migration).toContain('protect_playbook_change_broadcast_history')
    expect(migration).not.toContain('BEFORE UPDATE OR DELETE ON public.playbook_change_broadcast_reads')
  })

  it('uses hardened search paths and revokes browser execution from its trigger helper', () => {
    expect(migration).not.toMatch(/SET search_path\s*=\s*(?:public|pg_catalog\s*,\s*public)/i)
    expect(migration.match(/SET search_path = ''/g)?.length).toBe(2)
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.prevent_playbook_change_broadcast_mutation() FROM PUBLIC, authenticated, anon;')
  })
})
