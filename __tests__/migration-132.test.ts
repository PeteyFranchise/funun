import { readFileSync } from 'fs'
import path from 'path'

const migration132 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/132_selects_engagement.sql'),
  'utf8'
)

// ─── 132 (31.2-01 Task 2) ───────────────────────────────────────────────
// Text-based lock on the Selects engagement telemetry model:
// selects_track_engagement (raw per-track+viewer delta rows, 0<delta<=15
// CHECK, R13/D-31.2-12), selects_opens (open/view events), the
// SECURITY DEFINER abuse-cap trigger shipped IN THIS FILE (mirrors
// migration 117 exactly, T-31.2-03), the zero-policy + REVOKE fail-closed
// posture on every new table, and the migration-128/129/130/131
// HUMAN-GATED provenance/footer doctrine.

describe('132', () => {
  it('creates both new tables', () => {
    expect(migration132).toContain('CREATE TABLE public.selects_track_engagement')
    expect(migration132).toContain('CREATE TABLE public.selects_opens')
  })

  it('bounds delta_seconds to the per-heartbeat abuse ceiling 0 < delta <= 15 (Pitfall 2)', () => {
    expect(migration132).toContain('delta_seconds    NUMERIC(7,2) NOT NULL CHECK (delta_seconds > 0 AND delta_seconds <= 15),')
  })

  it('constrains event to the heartbeat/pause/ended/unload lifecycle', () => {
    expect(migration132).toContain("event IN ('heartbeat', 'pause', 'ended', 'unload')")
  })

  it('references selects and selects_tracks with ON DELETE CASCADE', () => {
    expect(migration132).toContain('selects_id       UUID NOT NULL REFERENCES public.selects ON DELETE CASCADE,')
    expect(migration132).toContain('selects_track_id UUID NOT NULL REFERENCES public.selects_tracks ON DELETE CASCADE,')
  })

  it('ships the abuse-cap trigger function and trigger IN THIS FILE (T-31.2-03, mirrors migration 117)', () => {
    expect(migration132).toContain('CREATE OR REPLACE FUNCTION public.enforce_selects_track_engagement_cap()')
    expect(migration132).toContain('SECURITY DEFINER')
    expect(migration132).toContain("SET search_path = ''")
    expect(migration132).toMatch(/RAISE EXCEPTION[^;]*USING ERRCODE = 'check_violation';/)
    expect(migration132).toContain('CREATE TRIGGER selects_track_engagement_cap')
    expect(migration132).toContain('BEFORE INSERT ON public.selects_track_engagement')
  })

  it('revokes EXECUTE on the cap function from PUBLIC/anon/authenticated', () => {
    expect(migration132).toContain(
      'REVOKE EXECUTE ON FUNCTION public.enforce_selects_track_engagement_cap() FROM PUBLIC, anon, authenticated;'
    )
  })

  it('enables row level security on both new tables', () => {
    expect(migration132).toContain('ALTER TABLE public.selects_track_engagement ENABLE ROW LEVEL SECURITY;')
    expect(migration132).toContain('ALTER TABLE public.selects_opens            ENABLE ROW LEVEL SECURITY;')
  })

  it('declares zero CREATE POLICY statements for any new table', () => {
    expect(migration132).not.toMatch(/^\s*CREATE POLICY/m)
  })

  it('REVOKEs both new tables from authenticated, anon (staff-only)', () => {
    expect(migration132).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_track_engagement FROM authenticated, anon;'
    )
    expect(migration132).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_opens            FROM authenticated, anon;'
    )
  })

  it('never GRANTs any new-table column to authenticated or anon', () => {
    expect(migration132).not.toMatch(/GRANT SELECT[^;]*TO authenticated/)
    expect(migration132).not.toMatch(/GRANT SELECT[^;]*TO anon/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration132).toContain('HUMAN-GATED')
    expect(migration132).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration132.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
