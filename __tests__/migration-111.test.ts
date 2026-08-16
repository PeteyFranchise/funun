import { readFileSync } from 'fs'
import path from 'path'

const migration111 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/111_selects.sql'),
  'utf8'
)

// ─── 111 (31-02 Task 1) ─────────────────────────────────────────────────
// Text-based lock on the Selects domain: the four tables, the tracks(id)
// FK (Pitfall 3 guard), the unguessable share_token, the D-02 download-gate
// columns, RLS-enabled + fail-closed REVOKE posture, and the exact reaction
// CHECK values — mirrors the migration-110 text-test convention (no local
// Postgres in this test harness).

describe('111', () => {
  it('creates all four Selects tables', () => {
    expect(migration111).toContain('CREATE TABLE public.selects ')
    expect(migration111).toContain('CREATE TABLE public.selects_tracks')
    expect(migration111).toContain('CREATE TABLE public.selects_reactions')
    expect(migration111).toContain('CREATE TABLE public.selects_saved_searches')
  })

  it('references public.tracks(id) for selects_tracks.track_id, not a generic text ref (Pitfall 3)', () => {
    expect(migration111).toContain('REFERENCES public.tracks(id)')
    expect(migration111).not.toContain('track_ref text')
  })

  it('share_token is an unguessable UNIQUE token, never a sequential id', () => {
    expect(migration111).toContain("UNIQUE DEFAULT encode(extensions.gen_random_bytes(16), 'hex')")
  })

  it('carries the D-02 download-gate columns', () => {
    expect(migration111).toContain('download_enabled    BOOLEAN NOT NULL DEFAULT true')
    expect(migration111).toContain('download_max_seconds INT')
  })

  it('enables row level security on all four tables', () => {
    expect(migration111).toContain('ALTER TABLE public.selects ENABLE ROW LEVEL SECURITY')
    expect(migration111).toContain('ALTER TABLE public.selects_tracks ENABLE ROW LEVEL SECURITY')
    expect(migration111).toContain('ALTER TABLE public.selects_reactions ENABLE ROW LEVEL SECURITY')
    expect(migration111).toContain('ALTER TABLE public.selects_saved_searches ENABLE ROW LEVEL SECURITY')
  })

  it('REVOKEs the staff-internal tables (selects_tracks, selects_saved_searches) from authenticated, anon', () => {
    expect(migration111).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_tracks FROM authenticated, anon;'
    )
    expect(migration111).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.selects_saved_searches FROM authenticated, anon;'
    )
  })

  it('REVOKEs destructive grants and locks down columns on selects (the buyer-readable table)', () => {
    expect(migration111).toContain('REVOKE INSERT, UPDATE, DELETE ON public.selects FROM authenticated, anon;')
    expect(migration111).toContain('REVOKE SELECT ON public.selects FROM authenticated, anon;')
    expect(migration111).not.toMatch(/GRANT SELECT \([^)]*\bcreated_by\b[^)]*\) ON public\.selects TO authenticated/)
  })

  it('the buyer-readable arm on selects is scoped to non-draft status via is_buyer_org_member', () => {
    expect(migration111).toContain('CREATE POLICY "selects_select_buyer_sent" ON public.selects')
    expect(migration111).toContain("status IN ('sent', 'approved', 'changes_requested')")
    expect(migration111).toContain('public.is_buyer_org_member(selects.buyer_org_id, auth.uid())')
  })

  it('the reaction CHECK lists exactly love/pass/more_like_this', () => {
    expect(migration111).toContain("CHECK (reaction IN ('love', 'pass', 'more_like_this'))")
  })

  it('a buyer may only insert/select their own reaction rows (reacted_by = auth.uid())', () => {
    expect(migration111).toContain('CREATE POLICY "selects_reactions_insert_own" ON public.selects_reactions')
    expect(migration111).toContain('reacted_by = auth.uid()')
  })

  it('does not add ae_user_id or any routing internal to an authenticated GRANT', () => {
    expect(migration111).not.toMatch(/GRANT SELECT[^;]*ae_user_id[^;]*TO authenticated/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration111).toContain('HUMAN-GATED')
    expect(migration111).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration111.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
