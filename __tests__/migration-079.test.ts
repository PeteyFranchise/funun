import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/079_project_membership_auto.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural
// assertions ("no DISABLE RLS", "no bare USING (true)", "no
// uuid_generate_v4") must run against this rather than the raw file,
// because 079's header prose legitimately *discusses* the dead
// split_sheet_parties.user_id column by concept. Mirrors
// __tests__/migration-064.test.ts / __tests__/migration-078.test.ts's
// pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 079 — auto-membership SECURITY DEFINER trigger (writer claim -> viewer)', () => {
  describe('sync_project_membership_for_sheet() function', () => {
    const fn = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.sync_project_membership_for_sheet'),
      migration.indexOf('DROP TRIGGER IF EXISTS sync_project_membership_on_party_change')
    )

    it('is declared with the migration-064/078 DEFINER safety shape', () => {
      expect(migration).toContain(
        'CREATE OR REPLACE FUNCTION public.sync_project_membership_for_sheet()'
      )
      expect(fn).toContain('RETURNS TRIGGER')
      expect(fn).toContain('LANGUAGE plpgsql')
      expect(fn).toContain('SECURITY DEFINER')
      expect(fn).toContain("SET search_path = ''")
    })

    it('fully qualifies every table it reads/writes (search-path hijack mitigation)', () => {
      expect(fn).toContain('public.project_members')
      expect(fn).toContain('public.collaborators')
      expect(fn).toContain('public.split_sheets')
      expect(fn).toContain('public.split_sheet_parties')
      expect(fn).not.toMatch(/FROM split_sheets\b/)
      expect(fn).not.toMatch(/FROM split_sheet_parties\b/)
      expect(fn).not.toMatch(/FROM collaborators\b/)
      expect(fn).not.toMatch(/INTO project_members\b/)
    })

    it('resolves the party through collaborators.claimed_by — the ONLY verified-identity signal (RESEARCH Pitfall 2)', () => {
      expect(fn).toContain('public.collaborators')
      expect(fn).toMatch(/claimed_by IS NOT NULL/)
      // Positive assertion on the resolution path, not a negative grep on
      // the dead column's exact dotted literal (grep-gate hygiene).
      expect(fn).toMatch(/c\.claimed_by|collaborators\.claimed_by|\.claimed_by/)
    })

    it('inserts into project_members with the literal role viewer, guarded by ON CONFLICT DO NOTHING', () => {
      expect(fn).toContain('INSERT INTO public.project_members')
      expect(fn).toMatch(/'viewer'/)
      expect(fn).toContain('ON CONFLICT (project_id, user_id) DO NOTHING')
      // Never any other role literal reachable from this function's INSERT.
      expect(fn).not.toMatch(/'owner'|'co-owner'|'editor'/)
    })

    it('gates the grant on the sheet being linked (vault_project_id present) and having left draft', () => {
      expect(fn).toMatch(/vault_project_id IS NOT NULL/)
      expect(fn).toMatch(/status\s*(<>|!=)\s*'draft'/)
    })

    it('never reads the dead split_sheet_parties.user_id column as the identity signal', () => {
      // Positive-only per Task 1 instruction: assert the resolution path is
      // collaborator_id -> collaborators.claimed_by, not a negative grep on
      // the exact dotted literal.
      expect(fn).toMatch(/collaborator_id/)
      expect(fn).not.toMatch(/p\.user_id|NEW\.user_id|parties\.user_id/)
    })

    it('branches per TG_TABLE_NAME so one function serves all three fire sites', () => {
      expect(fn).toContain('TG_TABLE_NAME')
      expect(fn).toContain("'split_sheet_parties'")
      expect(fn).toContain("'split_sheets'")
      expect(fn).toContain("'collaborators'")
    })
  })

  describe('EXECUTE privilege lockdown (trigger-internal only, migration 070 revoke-only precedent)', () => {
    it('revokes the default PostgREST RPC exposure — no client ever calls this directly', () => {
      expect(migration).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.sync_project_membership_for_sheet\(\) FROM PUBLIC, anon, authenticated;/
      )
    })
  })

  describe('trigger attachment — all three fire sites (RESEARCH architecture diagram)', () => {
    it('attaches AFTER INSERT OR UPDATE on split_sheet_parties', () => {
      expect(migration).toContain(
        'DROP TRIGGER IF EXISTS sync_project_membership_on_party_change ON public.split_sheet_parties;'
      )
      expect(migration).toMatch(
        /CREATE TRIGGER sync_project_membership_on_party_change\s+AFTER INSERT OR UPDATE ON public\.split_sheet_parties/
      )
    })

    it('attaches AFTER UPDATE OF status, vault_project_id on split_sheets', () => {
      expect(migration).toContain(
        'DROP TRIGGER IF EXISTS sync_project_membership_on_sheet_change ON public.split_sheets;'
      )
      expect(migration).toMatch(
        /CREATE TRIGGER sync_project_membership_on_sheet_change\s+AFTER UPDATE OF status, vault_project_id ON public\.split_sheets/
      )
    })

    it('attaches AFTER UPDATE OF claimed_by on collaborators', () => {
      expect(migration).toContain(
        'DROP TRIGGER IF EXISTS sync_project_membership_on_claim ON public.collaborators;'
      )
      expect(migration).toMatch(
        /CREATE TRIGGER sync_project_membership_on_claim\s+AFTER UPDATE OF claimed_by ON public\.collaborators/
      )
    })

    it('every trigger executes the same shared function (one place, three orderings)', () => {
      const triggerCount = (migration.match(
        /EXECUTE FUNCTION public\.sync_project_membership_for_sheet\(\);/g
      ) ?? []).length
      expect(triggerCount).toBe(3)
    })
  })

  describe('schema-cache reload', () => {
    it('closes with NOTIFY pgrst', () => {
      expect(migration.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    })
  })

  describe('migration conventions and safety', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint|human-gated/i)
    })

    it('documents that this migration (079) is sequenced after 078', () => {
      expect(migration).toContain('078')
      expect(migration).toContain('079')
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    })

    it('never uses uuid_generate_v4() in executable SQL', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('never grants any role other than viewer via this migration', () => {
      expect(sql).not.toMatch(/INSERT INTO public\.project_members[\s\S]*?'owner'/)
      expect(sql).not.toMatch(/INSERT INTO public\.project_members[\s\S]*?'co-owner'/)
      expect(sql).not.toMatch(/INSERT INTO public\.project_members[\s\S]*?'editor'/)
    })
  })
})
