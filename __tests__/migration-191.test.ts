import { readFileSync } from 'fs'
import path from 'path'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'

// ─── migration 191 — consent root, delegation lineage, NOT NULL, evidence ──
//                     confirmation
// Text-lock + structural test, in the established style of
// __tests__/migration-184.test.ts and __tests__/migration-185.test.ts. This
// project's migrations are human-gated: an agent never pushes them, so this
// file IS the pre-push review evidence for R-01/WSR-01, R-01/WSR-02,
// R-08/WSR-14 and R-16/WSR-24. A green run here proves the SQL TEXT matches
// what was authored; it does NOT prove any constraint is enforced against
// live Postgres, that a member-consent root row is actually insertable, or
// that a delegated grant whose parent is revoked actually resolves as dead
// at read time — that behavioural proof is plan 11's joint push checkpoint,
// against the real database, not this suite.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/191_workspace_consent_lineage_schema.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-184's / migration-187's pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

describe('migration 191 — consent root, delegation lineage, NOT NULL, evidence confirmation', () => {
  // ══ Section (a) — consent root and delegation lineage ══════════════════
  describe('workspace_grants gains the member-consent source and parent_grant_id lineage', () => {
    it('widens the source CHECK to admit the member-consent literal', () => {
      expect(sql).toContain(
        "CHECK (source IN ('bundle', 'individual', 'member_consent'))"
      )
    })

    it('the member-consent literal is byte-identical to MEMBER_CONSENT_SOURCE exported by lib/workspaces/grant-lineage.ts', () => {
      expect(MEMBER_CONSENT_SOURCE).toBe('member_consent')
      expect(sql).toContain(`'${MEMBER_CONSENT_SOURCE}'`)
    })

    it('adds parent_grant_id as a self-referencing foreign key with ON DELETE RESTRICT', () => {
      const start = sql.indexOf('ADD COLUMN parent_grant_id')
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf(';', start)
      const statement = normalizeWhitespace(sql.slice(start, end))
      expect(statement).toContain('REFERENCES public.workspace_grants(id)')
      expect(statement).toContain('ON DELETE RESTRICT')
    })

    it('adds an index on parent_grant_id', () => {
      expect(sql).toMatch(
        /CREATE INDEX idx_workspace_grants_parent_grant_id\s*\n?\s*ON public\.workspace_grants \(parent_grant_id\);/
      )
    })

    it('adds a table CHECK coupling member-consent source to a NULL parent and every other source to a non-NULL parent', () => {
      const start = sql.indexOf('ADD CONSTRAINT workspace_grants_consent_root_or_lineage_check')
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf(');', start)
      const block = normalizeWhitespace(sql.slice(start, end))
      expect(block).toContain("source = 'member_consent' AND parent_grant_id IS NULL")
      expect(block).toContain("source <> 'member_consent' AND parent_grant_id IS NOT NULL")
    })
  })

  // ══ Section (b) — NOT NULL tightening (D-PF-02 = GO) ════════════════════
  describe('relationship_id is NOT NULL on both workspace_grants and workspace_attachments', () => {
    it('sets workspace_grants.relationship_id NOT NULL', () => {
      expect(sql).toContain(
        'ALTER TABLE public.workspace_grants ALTER COLUMN relationship_id SET NOT NULL;'
      )
    })

    it('sets workspace_attachments.relationship_id NOT NULL', () => {
      expect(sql).toContain(
        'ALTER TABLE public.workspace_attachments ALTER COLUMN relationship_id SET NOT NULL;'
      )
    })

    it('both ALTER COLUMN ... SET NOT NULL statements are present independently (count = 2)', () => {
      const matches = sql.match(/ALTER COLUMN relationship_id SET NOT NULL/g) ?? []
      expect(matches).toHaveLength(2)
    })
  })

  // ══ Section (c) — evidence confirmation (R-08/WSR-14) ═══════════════════
  describe('workspace_agreement_evidence gains a subject-confirmation pair with a document-required gate', () => {
    it('adds confirmed_by_subject_at as TIMESTAMPTZ', () => {
      expect(sql).toContain(
        'ALTER TABLE public.workspace_agreement_evidence ADD COLUMN confirmed_by_subject_at TIMESTAMPTZ;'
      )
    })

    it('adds confirmed_by_subject as a UUID referencing auth.users', () => {
      expect(sql).toContain(
        'ALTER TABLE public.workspace_agreement_evidence ADD COLUMN confirmed_by_subject UUID REFERENCES auth.users;'
      )
    })

    it('a CHECK couples the two confirmation columns (both NULL or both set)', () => {
      const start = sql.indexOf('ADD CONSTRAINT workspace_agreement_evidence_confirmation_pair_check')
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf(');', start)
      const block = normalizeWhitespace(sql.slice(start, end))
      expect(block).toContain('confirmed_by_subject_at IS NULL AND confirmed_by_subject IS NULL')
      expect(block).toContain('confirmed_by_subject_at IS NOT NULL AND confirmed_by_subject IS NOT NULL')
    })

    it('a CHECK requires document_id when confirmation is present', () => {
      const start = sql.indexOf('ADD CONSTRAINT workspace_agreement_evidence_confirmed_requires_document_check')
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf(');', start)
      const block = normalizeWhitespace(sql.slice(start, end))
      expect(block).toContain('confirmed_by_subject_at IS NULL OR document_id IS NOT NULL')
    })
  })

  // ══ Section (d) — write lockdown restatement ═════════════════════════════
  describe('write lockdown restatement names all three tables', () => {
    it('revokes INSERT/UPDATE/DELETE on all three tables from authenticated and anon in one statement', () => {
      expect(sql).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON public.workspace_grants, public.workspace_attachments, public.workspace_agreement_evidence FROM authenticated, anon;'
      )
    })
  })

  // ══ Negative structural guarantees ═══════════════════════════════════════
  describe('negative assertions — no policy touched, no scope creep', () => {
    it('creates no policy', () => {
      expect(sql).not.toMatch(/CREATE POLICY/i)
    })

    it('drops no policy', () => {
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('never redefines or references handle_new_user', () => {
      expect(sql).not.toMatch(/handle_new_user/)
    })

    it('never touches member_type', () => {
      expect(sql).not.toMatch(/member_type/)
    })

    it('never touches industry_roles', () => {
      expect(sql).not.toMatch(/industry_roles/)
    })

    it('never touches capability_grants', () => {
      expect(sql).not.toMatch(/capability_grants/)
    })

    it('never touches project_members', () => {
      expect(sql).not.toMatch(/project_members/)
    })

    it('never uses uuid_generate_v4', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/HUMAN-GATED/)
    })

    it('states the migration numbering: 190 is plan 02, 192-194 later plans, 195-196 Phase 38.0.2, 197-198 Phase 38.2', () => {
      expect(migration).toContain('190')
      expect(migration).toContain('192-194')
      expect(migration).toMatch(/195-196[\s\S]*?38\.0\.2/)
      expect(migration).toMatch(/197-198[\s\S]*?38\.2/)
    })

    it('states the PUSH ORDERING hold — pushed together with 190 and 192, not alone', () => {
      expect(migration).toMatch(/PUSH ORDERING/)
      expect(migration).toMatch(/Do not push 191 alone/)
    })

    it('states why no backfill exists — every workspace table is empty in production', () => {
      expect(migration).toMatch(/WHY NO BACKFILL EXISTS/)
      expect(migration).toMatch(/EMPTY/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
