import { readFileSync } from 'fs'
import path from 'path'

const migration112 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/112_client_partners_crm.sql'),
  'utf8'
)

// ─── 112 (31-02 Task 2) ─────────────────────────────────────────────────
// Text-based lock on the CRM-lite people layer: buyer_org_contacts +
// client_relationship_log creation/RLS, the WHERE is_primary partial
// unique index (D-08/D-09), buyer_orgs.website (private by default), the
// fail-closed REVOKE posture, the non-destructive legacy backfill, and the
// explicit Pitfall-6 legacy contact_* reconciliation note.

describe('112', () => {
  it('creates buyer_org_contacts and client_relationship_log', () => {
    expect(migration112).toContain('CREATE TABLE public.buyer_org_contacts')
    expect(migration112).toContain('CREATE TABLE public.client_relationship_log')
  })

  it('enables row level security on both new tables', () => {
    expect(migration112).toContain('ALTER TABLE public.buyer_org_contacts ENABLE ROW LEVEL SECURITY')
    expect(migration112).toContain('ALTER TABLE public.client_relationship_log ENABLE ROW LEVEL SECURITY')
  })

  it('enforces at most one primary contact per org via a partial unique index', () => {
    expect(migration112).toContain('CREATE UNIQUE INDEX buyer_org_contacts_one_primary_per_org')
    expect(migration112.toLowerCase()).toContain('where is_primary')
  })

  it('adds buyer_orgs.website as an additive column', () => {
    expect(migration112).toContain('ALTER TABLE public.buyer_orgs ADD COLUMN website TEXT;')
  })

  it('does NOT grant website to authenticated or anon (private by default, Pitfall 6)', () => {
    expect(migration112).not.toMatch(/GRANT SELECT[^;]*\bwebsite\b[^;]*TO authenticated/)
    expect(migration112).not.toMatch(/GRANT SELECT[^;]*\bwebsite\b[^;]*TO anon/)
  })

  it('REVOKEs both new tables from authenticated, anon (staff-only)', () => {
    expect(migration112).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.buyer_org_contacts FROM authenticated, anon;'
    )
    expect(migration112).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.client_relationship_log FROM authenticated, anon;'
    )
  })

  it('backfills a non-destructive primary contact per org from the legacy contact_* columns', () => {
    expect(migration112).toContain('INSERT INTO public.buyer_org_contacts (buyer_org_id, name, email, phone, is_primary)')
    expect(migration112).toContain('bo.contact_email')
    expect(migration112).toContain('bo.contact_phone')
    expect(migration112).toContain('true')
    expect(migration112).not.toMatch(/DROP COLUMN contact_/)
    expect(migration112).not.toMatch(/UPDATE public\.buyer_orgs SET contact_/)
  })

  it('names the legacy contact_* reconciliation explicitly (Pitfall 6 not-silent guard)', () => {
    expect(migration112).toMatch(/legacy/i)
    expect(migration112).toMatch(/contact_/)
    expect(migration112).toMatch(/095/)
  })

  it('carries the HUMAN-GATED footer (agents never run supabase db push)', () => {
    expect(migration112).toContain('HUMAN-GATED')
    expect(migration112).toMatch(/never runs `supabase db push` from an agent/)
  })

  it('ends with a schema-cache reload notification', () => {
    expect(migration112.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
