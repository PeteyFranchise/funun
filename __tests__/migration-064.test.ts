import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/064_fix_split_sheet_rls_recursion.sql'),
  'utf8'
)

const migration018 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/018_collaborators_split_sheets.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural assertions
// ("no WITH CHECK", "no uuid_generate_v4") must run against this rather than
// the raw file, because 064's header prose legitimately *discusses* both.
// Safe here: no string literal in this migration contains a `--` sequence
// (the COMMENT ON bodies use em-dashes).
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 064 — break the split_sheets ↔ split_sheet_parties RLS recursion', () => {
  describe('is_split_sheet_initiator() helper', () => {
    it('is declared with the no_block() safety shape (migration 035 precedent)', () => {
      expect(migration).toContain(
        'CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator(sheet_id UUID, uid UUID)'
      )
      const fn = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator'),
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party')
      )
      expect(fn).toContain('RETURNS BOOLEAN')
      expect(fn).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(fn).toContain("SET search_path = ''")
    })

    it('fully qualifies the table it reads (search-path hijack mitigation, T-08-04)', () => {
      const fn = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator'),
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party')
      )
      expect(fn).toContain('FROM public.split_sheets')
      expect(fn).not.toMatch(/FROM split_sheets\b/)
    })

    it('preserves migration 018\'s initiator predicate exactly (no widening)', () => {
      const fn = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_initiator'),
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party')
      )
      expect(fn).toContain('WHERE id = sheet_id AND initiator_user_id = uid')
      // 018's original body tested the same two columns.
      expect(migration018).toContain('WHERE id = split_sheet_parties.split_sheet_id AND initiator_user_id = auth.uid()')
    })
  })

  describe('is_split_sheet_party() helper', () => {
    it('is declared with the no_block() safety shape', () => {
      expect(migration).toContain(
        'CREATE OR REPLACE FUNCTION public.is_split_sheet_party(sheet_id UUID, uid UUID)'
      )
      const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party'))
      expect(fn).toContain('RETURNS BOOLEAN')
      expect(fn).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(fn).toContain("SET search_path = ''")
    })

    it('fully qualifies the table it reads', () => {
      const fn = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party'),
        migration.indexOf('-- Intended for use inside RLS policy USING clauses')
      )
      expect(fn).toContain('FROM public.split_sheet_parties')
      expect(fn).not.toMatch(/FROM split_sheet_parties\b/)
    })

    it('preserves migration 018\'s party predicate exactly (no widening)', () => {
      const fn = migration.slice(
        migration.indexOf('CREATE OR REPLACE FUNCTION public.is_split_sheet_party'),
        migration.indexOf('-- Intended for use inside RLS policy USING clauses')
      )
      expect(fn).toContain('WHERE split_sheet_id = sheet_id AND user_id = uid')
      expect(migration018).toContain('WHERE split_sheet_id = split_sheets.id AND user_id = auth.uid()')
    })
  })

  describe('EXECUTE privilege lockdown (migration 035 no_block precedent)', () => {
    it('revokes the default PostgREST RPC exposure from PUBLIC, anon, and authenticated', () => {
      expect(migration).toContain(
        'REVOKE EXECUTE ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) FROM PUBLIC, anon, authenticated;'
      )
      expect(migration).toContain(
        'REVOKE EXECUTE ON FUNCTION public.is_split_sheet_party(uuid, uuid) FROM PUBLIC, anon, authenticated;'
      )
    })

    it('grants EXECUTE back to authenticated only — never to anon', () => {
      expect(migration).toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.is_split_sheet_initiator\(uuid, uuid\) TO authenticated;/
      )
      expect(migration).toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.is_split_sheet_party\(uuid, uuid\) TO authenticated;/
      )
      expect(migration).not.toMatch(/GRANT\s+EXECUTE ON FUNCTION public\.is_split_sheet_\w+\([^)]*\)[^;]*\banon\b/)
    })

    it('documents both helpers as policy-body helpers, not client RPCs', () => {
      expect(migration).toContain('COMMENT ON FUNCTION public.is_split_sheet_initiator(uuid, uuid) IS')
      expect(migration).toContain('COMMENT ON FUNCTION public.is_split_sheet_party(uuid, uuid) IS')
      const comments = migration.slice(migration.indexOf('COMMENT ON FUNCTION public.is_split_sheet_initiator'))
      expect(comments).toContain('not as a client-invoked RPC')
    })
  })

  describe('policy rewrite — the actual recursion cut', () => {
    it('replaces "Initiator sees all parties" with a helper call', () => {
      expect(migration).toContain('DROP POLICY IF EXISTS "Initiator sees all parties" ON split_sheet_parties;')
      expect(migration).toContain('CREATE POLICY "Initiator sees all parties" ON split_sheet_parties')
      expect(migration).toContain(
        '(SELECT public.is_split_sheet_initiator(split_sheet_parties.split_sheet_id, auth.uid()))'
      )
    })

    it('replaces "Parties can view split sheets" with a helper call', () => {
      expect(migration).toContain('DROP POLICY IF EXISTS "Parties can view split sheets" ON split_sheets;')
      expect(migration).toContain('CREATE POLICY "Parties can view split sheets" ON split_sheets')
      expect(migration).toContain('(SELECT public.is_split_sheet_party(split_sheets.id, auth.uid()))')
    })

    it('wraps helper calls as (SELECT ...) so the planner caches per statement', () => {
      expect(migration).toMatch(/USING \(\s*\(SELECT public\.is_split_sheet_initiator\(/)
      expect(migration).toMatch(/USING \(\s*\(SELECT public\.is_split_sheet_party\(/)
    })

    it('leaves NO cross-table EXISTS subquery in either rewritten policy — the cycle is cut', () => {
      const policyBlock = migration.slice(migration.indexOf('DROP POLICY IF EXISTS "Initiator sees all parties"'))
      // The whole point: neither rewritten policy body may read the other table directly.
      expect(policyBlock).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM split_sheets/)
      expect(policyBlock).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM split_sheet_parties/)
    })

    it('scopes both rewritten policies to authenticated (anon gets [] , not a function-permission error)', () => {
      expect(migration).toMatch(
        /CREATE POLICY "Initiator sees all parties" ON split_sheet_parties\s+FOR SELECT TO authenticated/
      )
      expect(migration).toMatch(
        /CREATE POLICY "Parties can view split sheets" ON split_sheets\s+FOR SELECT TO authenticated/
      )
    })

    it('keeps both policies SELECT-only — no new write path is opened', () => {
      const policyBlock = sql.slice(sql.indexOf('DROP POLICY IF EXISTS "Initiator sees all parties"'))
      expect(policyBlock).not.toContain('WITH CHECK')
      expect(policyBlock).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/)
    })
  })

  describe('security must not regress', () => {
    it('does not touch the two non-recursive policies that scope base access', () => {
      // "Party sees own row" and "Initiator manages split sheet" carry the
      // owner/self predicates. Dropping either would widen or break access.
      expect(migration).not.toContain('DROP POLICY IF EXISTS "Party sees own row"')
      expect(migration).not.toContain('DROP POLICY IF EXISTS "Initiator manages split sheet"')
      expect(migration).not.toMatch(/CREATE POLICY "Party sees own row"/)
      expect(migration).not.toMatch(/CREATE POLICY "Initiator manages split sheet"/)
    })

    it('never disables or forces-off RLS as a shortcut', () => {
      expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
      expect(migration).not.toMatch(/USING \(\s*true\s*\)/i)
    })

    it('does not widen party visibility to co-parties on the same sheet', () => {
      // A named party must still see only their OWN party row. A helper keyed
      // on sheet membership (rather than user_id) in the parties policy would
      // silently expose every co-writer's contact + split data.
      expect(migration).not.toMatch(
        /CREATE POLICY[^;]*ON split_sheet_parties[^;]*is_split_sheet_party\(/
      )
    })

    it('does not grant client write privileges back on the esign tables', () => {
      expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*esign_/)
    })
  })

  describe('migration conventions', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })

    it('notes the 062-066 migration-number collision risk with Phase 16', () => {
      expect(migration).toMatch(/collision/i)
      expect(migration).toContain('062-066')
    })

    it('does not reintroduce uuid_generate_v4() (extensions schema is off the search_path)', () => {
      // Header prose explains WHY not to use it; executable SQL must not.
      expect(sql).not.toContain('uuid_generate_v4')
      expect(migration).toContain('gen_random_uuid()')
    })

    it('documents the root cause and the rewrite-before-ACL ordering', () => {
      expect(migration).toContain('42P17')
      expect(migration).toContain('42501')
      expect(migration).toMatch(/rewrite/i)
    })
  })
})
