import { readFileSync } from 'fs'
import path from 'path'

const migration130 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/130_playbook_rbac.sql'),
  'utf8'
)

// ─── 130 (31.2-01 Task 1) ───────────────────────────────────────────────
// Text-based lock on the data-driven Playbook RBAC + authoring model:
// playbook_rooms (6 rooms seeded to reproduce Phase 33), playbook_room_
// role_grants (role<>'leadership' CHECK — structural last-admin
// protection), playbook_room_leads, playbook_sub_groups, playbook_entries
// (SOP/Topic draft->publish), the zero-policy + REVOKE fail-closed
// posture on every new table, and the migration-128/129 HUMAN-GATED
// provenance/footer doctrine.

describe('130', () => {
  it('creates all five new tables', () => {
    expect(migration130).toContain('CREATE TABLE public.playbook_rooms')
    expect(migration130).toContain('CREATE TABLE public.playbook_room_role_grants')
    expect(migration130).toContain('CREATE TABLE public.playbook_room_leads')
    expect(migration130).toContain('CREATE TABLE public.playbook_sub_groups')
    expect(migration130).toContain('CREATE TABLE public.playbook_entries')
  })

  it('excludes role=leadership from playbook_room_role_grants via a structural CHECK (Pitfall 5)', () => {
    expect(migration130).toMatch(/role\s+TEXT NOT NULL CHECK \(/)
    expect(migration130).toContain("role <> 'leadership'")
  })

  it('seeds the six Phase-33 rooms in nav.ts order', () => {
    for (const key of ['company-wide', 'ar', 'ae-sales', 'it-team', 'tms', 'leadership']) {
      expect(migration130).toContain(`'${key}'`)
    }
    expect(migration130).toContain(
      "('company-wide', 'Company-wide', 1, false, true),"
    )
  })

  it('marks it-team and leadership as the sensitive rooms, non-sensitive for the other four', () => {
    expect(migration130).toContain("('it-team',      'IT Team',      4, true,  false),")
    expect(migration130).toContain("('leadership',   'Leadership',   6, true,  true)")
  })

  it('seeds the it-team room grantable to role \'it\' — reproduces Phase 33 exact behavior (Pitfall 6)', () => {
    expect(migration130).toMatch(/SELECT r\.id, 'it'\s*\n\s*FROM public\.playbook_rooms r\s*\n\s*WHERE r\.key = 'it-team'/)
  })

  it('seeds the four non-sensitive rooms with every non-leadership operational role', () => {
    expect(migration130).toContain(
      "CROSS JOIN (VALUES ('ae'), ('bd'), ('anr'), ('legal'), ('tms'), ('accounting'), ('marketing')) AS g(role)"
    )
    expect(migration130).toContain(
      "WHERE r.key IN ('company-wide', 'ar', 'ae-sales', 'tms')"
    )
  })

  it('grants zero rows to the leadership room (leadership-only, structural)', () => {
    // No INSERT statement targets the leadership room key on its own.
    expect(migration130).not.toMatch(/WHERE r\.key = 'leadership'/)
    expect(migration130).not.toMatch(/WHERE r\.key IN \([^)]*'leadership'[^)]*\)/)
  })

  it('creates playbook_room_leads with UNIQUE(room_id, user_id) (D-31.2-02)', () => {
    expect(migration130).toContain('UNIQUE (room_id, user_id)')
  })

  it('creates playbook_sub_groups with UNIQUE(room_id, key) (D-31.2-04)', () => {
    expect(migration130).toContain('UNIQUE (room_id, key)')
  })

  it('creates playbook_entries with the draft/publish status CHECK and an entry_type CHECK (D-31.2-05/06)', () => {
    expect(migration130).toContain("entry_type IN ('sop', 'topic')")
    expect(migration130).toContain("status IN ('draft_pending', 'published')")
    expect(migration130).toContain("DEFAULT 'draft_pending'")
  })

  it('enables row level security on every new table', () => {
    expect(migration130).toContain('ALTER TABLE public.playbook_rooms           ENABLE ROW LEVEL SECURITY;')
    expect(migration130).toContain('ALTER TABLE public.playbook_room_role_grants ENABLE ROW LEVEL SECURITY;')
    expect(migration130).toContain('ALTER TABLE public.playbook_room_leads       ENABLE ROW LEVEL SECURITY;')
    expect(migration130).toContain('ALTER TABLE public.playbook_sub_groups       ENABLE ROW LEVEL SECURITY;')
    expect(migration130).toContain('ALTER TABLE public.playbook_entries          ENABLE ROW LEVEL SECURITY;')
  })

  it('declares zero CREATE POLICY statements for any new table', () => {
    expect(migration130).not.toMatch(/^\s*CREATE POLICY/m)
  })

  it('REVOKEs all five new tables from authenticated, anon (staff-only)', () => {
    expect(migration130).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_rooms           FROM authenticated, anon;'
    )
    expect(migration130).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_room_role_grants FROM authenticated, anon;'
    )
    expect(migration130).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_room_leads       FROM authenticated, anon;'
    )
    expect(migration130).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_sub_groups       FROM authenticated, anon;'
    )
    expect(migration130).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.playbook_entries          FROM authenticated, anon;'
    )
  })

  it('never GRANTs any new-table column to authenticated', () => {
    expect(migration130).not.toMatch(/GRANT SELECT[^;]*TO authenticated/)
  })

  it('never GRANTs any new-table column to anon', () => {
    expect(migration130).not.toMatch(/GRANT SELECT[^;]*TO anon/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration130).toContain('HUMAN-GATED')
    expect(migration130).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration130.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
