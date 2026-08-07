import { readFileSync } from 'fs'
import path from 'path'

const migration089 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/089_funun_staff_and_audit.sql'),
  'utf8'
)

const migration090 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/090_buyer_orgs_ae_assignment.sql'),
  'utf8'
)

describe('089', () => {
  it('creates funun_staff with the CHECK-constrained staff_role', () => {
    expect(migration089).toContain('CREATE TABLE IF NOT EXISTS public.funun_staff')
    expect(migration089).toContain("CHECK (staff_role IN ('leadership', 'ae', 'bd'))")
  })

  it('creates staff_audit_log with the audit-log column set', () => {
    expect(migration089).toContain('CREATE TABLE IF NOT EXISTS public.staff_audit_log')
    expect(migration089).toMatch(/actor_id\s+UUID REFERENCES auth\.users/)
    expect(migration089).toContain('action      TEXT NOT NULL')
    expect(migration089).toContain('target_type TEXT NOT NULL')
    expect(migration089).toContain('changes     JSONB')
  })

  it('funun_staff has the Team Member Directory contact-card fields, nullable', () => {
    const tableStart = migration089.indexOf('CREATE TABLE IF NOT EXISTS public.funun_staff')
    const tableBlock = migration089.slice(tableStart, migration089.indexOf(');', tableStart))
    expect(tableBlock).toMatch(/title\s+TEXT,/)
    expect(tableBlock).toMatch(/phone\s+TEXT,/)
    expect(tableBlock).toMatch(/avatar_url\s+TEXT,/)
  })

  it('both tables enable RLS and have zero CREATE POLICY statements', () => {
    expect(migration089).toMatch(/ALTER TABLE public\.funun_staff ENABLE ROW LEVEL SECURITY/)
    expect(migration089).toMatch(/ALTER TABLE public\.staff_audit_log ENABLE ROW LEVEL SECURITY/)
    expect(migration089).not.toContain('CREATE POLICY')
  })

  it('both tables REVOKE all access from authenticated and anon', () => {
    expect(migration089).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.funun_staff FROM authenticated, anon'
    )
    expect(migration089).toContain(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.staff_audit_log FROM authenticated, anon'
    )
  })

  it('documents funun_staff.staff_role as a display copy of the authoritative app_metadata.staff_role', () => {
    const commentStart = migration089.indexOf('COMMENT ON TABLE public.funun_staff')
    expect(commentStart).toBeGreaterThan(-1)
    const comment = migration089.slice(commentStart, migration089.indexOf(';', commentStart) + 1)
    expect(comment).toMatch(/DISPLAY COPY/)
    expect(comment).toContain('app_metadata.staff_role')
  })

  it('is human-gated — carries a comment noting it must be pushed by the owner, never by an agent', () => {
    expect(migration089).toMatch(/human-gated/i)
    expect(migration089).toMatch(/supabase db push/i)
  })

  it('ends with a schema-cache reload notify', () => {
    expect(migration089.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})

describe('090', () => {
  it('adds a nullable ae_user_id FK column with ON DELETE SET NULL', () => {
    expect(migration090).toMatch(
      /ALTER TABLE public\.buyer_orgs\s+ADD COLUMN ae_user_id UUID REFERENCES auth\.users ON DELETE SET NULL;/
    )
  })

  it('adds an index on ae_user_id', () => {
    expect(migration090).toContain(
      'CREATE INDEX idx_buyer_orgs_ae_user_id ON public.buyer_orgs (ae_user_id)'
    )
  })

  it('documents the deliberate omission from the authenticated GRANT list', () => {
    const commentStart = migration090.indexOf('COMMENT ON COLUMN public.buyer_orgs.ae_user_id')
    expect(commentStart).toBeGreaterThan(-1)
    const comment = migration090.slice(commentStart, migration090.indexOf(';', commentStart) + 1)
    expect(comment).toMatch(/NOT.*GRANT SELECT allowlist/)
  })

  it('no GRANT SELECT line in this file mentions the new column (region-scoped check)', () => {
    const grantSelectLines = migration090
      .split('\n')
      .filter((line) => line.trim().startsWith('GRANT SELECT'))
    expect(grantSelectLines.length).toBe(0)
    for (const line of grantSelectLines) {
      expect(line).not.toContain('ae_user_id')
    }
  })

  it('is human-gated — carries a comment noting it must be pushed by the owner, never by an agent', () => {
    expect(migration090).toMatch(/human-gated/i)
    expect(migration090).toMatch(/supabase db push/i)
  })

  it('ends with a schema-cache reload notify', () => {
    expect(migration090.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })
})
