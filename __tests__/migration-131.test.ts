import { readFileSync } from 'fs'
import path from 'path'

const migration131 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/131_plays.sql'),
  'utf8'
)

// ─── 131 (31.2-01 Task 2) ───────────────────────────────────────────────
// Text-based lock on the Plays model: plays (one-active-at-a-time via a
// partial unique index, D-31.2-08), play_assignments (client_targeted |
// general_task, D-31.2-09/10), play_assignment_completions (idempotent
// per-(assignment, AE) completion key, D-31.2-11), the zero-policy +
// REVOKE fail-closed posture on every new table, and the migration-128/
// 129/130 HUMAN-GATED provenance/footer doctrine.

describe('131', () => {
  it('creates all three new tables', () => {
    expect(migration131).toContain('CREATE TABLE public.plays')
    expect(migration131).toContain('CREATE TABLE public.play_assignments')
    expect(migration131).toContain('CREATE TABLE public.play_assignment_completions')
  })

  it('enforces the one-active-play invariant via a partial unique index (D-31.2-08)', () => {
    expect(migration131).toContain(
      "CREATE UNIQUE INDEX plays_one_active_uniq ON public.plays ((1)) WHERE status = 'active';"
    )
  })

  it('constrains plays.status to active|retired', () => {
    expect(migration131).toContain("status IN ('active', 'retired')")
  })

  it('constrains play_assignments.kind to client_targeted|general_task (D-31.2-09)', () => {
    expect(migration131).toContain("kind IN ('client_targeted', 'general_task')")
  })

  it('gives client_targeted assignments health_band/pipeline_stage_key columns (D-31.2-09a)', () => {
    expect(migration131).toContain('health_band')
    expect(migration131).toContain('pipeline_stage_key')
  })

  it('gives general_task assignments content-carrying columns (D-31.2-09b/10)', () => {
    expect(migration131).toContain('link_url')
    expect(migration131).toContain('attachment_url')
    expect(migration131).toContain('content')
  })

  it('enforces one completion per (assignment, AE) via a UNIQUE constraint (D-31.2-11)', () => {
    expect(migration131).toContain('UNIQUE (assignment_id, ae_user_id)')
  })

  it('enables row level security on every new table', () => {
    expect(migration131).toContain('ALTER TABLE public.plays                       ENABLE ROW LEVEL SECURITY;')
    expect(migration131).toContain('ALTER TABLE public.play_assignments            ENABLE ROW LEVEL SECURITY;')
    expect(migration131).toContain('ALTER TABLE public.play_assignment_completions ENABLE ROW LEVEL SECURITY;')
  })

  it('declares zero CREATE POLICY statements for any new table', () => {
    expect(migration131).not.toMatch(/^\s*CREATE POLICY/m)
  })

  it('REVOKEs all three new tables from authenticated, anon (staff-only)', () => {
    expect(migration131).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.plays                       FROM authenticated, anon;'
    )
    expect(migration131).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.play_assignments            FROM authenticated, anon;'
    )
    expect(migration131).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.play_assignment_completions FROM authenticated, anon;'
    )
  })

  it('never GRANTs any new-table column to authenticated or anon', () => {
    expect(migration131).not.toMatch(/GRANT SELECT[^;]*TO authenticated/)
    expect(migration131).not.toMatch(/GRANT SELECT[^;]*TO anon/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration131).toContain('HUMAN-GATED')
    expect(migration131).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration131.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
