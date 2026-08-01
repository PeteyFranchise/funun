import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/078_project_members.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural
// assertions ("no DISABLE RLS", "no uuid_generate_v4") must run against
// this rather than the raw file, because 078's header prose legitimately
// *discusses* both. Mirrors __tests__/migration-064.test.ts's pattern.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('migration 078 — project_members guest-list table + RLS rewrite', () => {
  describe('project_members table', () => {
    it('creates the table with the expected columns and constraints', () => {
      expect(migration).toContain('CREATE TABLE public.project_members')
      expect(migration).toContain('id         UUID PRIMARY KEY DEFAULT gen_random_uuid()')
      expect(migration).toContain(
        'project_id UUID REFERENCES public.vault_projects ON DELETE CASCADE NOT NULL'
      )
      expect(migration).toContain('user_id    UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL')
      expect(migration).toContain('UNIQUE (project_id, user_id)')
    })

    it('references auth.users directly, not user_profiles/artist_profiles (RESEARCH A4)', () => {
      const table = migration.slice(
        migration.indexOf('CREATE TABLE public.project_members'),
        migration.indexOf('CREATE INDEX idx_project_members_project_id')
      )
      expect(table).not.toMatch(/REFERENCES\s+(public\.)?(user_profiles|artist_profiles)/)
    })

    it('the role CHECK constraint lists exactly the four roles', () => {
      expect(migration).toContain(
        "role       TEXT NOT NULL CHECK (role IN ('owner', 'co-owner', 'editor', 'viewer'))"
      )
    })

    it('enables row level security', () => {
      expect(migration).toContain('ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;')
    })

    it('revokes INSERT/UPDATE/DELETE from authenticated and anon (no client write path in v1)', () => {
      expect(migration).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM authenticated, anon;'
      )
    })

    it('has its own least-privilege SELECT policy: own row, or owner, or co-owner', () => {
      expect(migration).toContain('CREATE POLICY "project_members_select" ON public.project_members')
      const policy = migration.slice(migration.indexOf('CREATE POLICY "project_members_select"'))
      expect(policy).toContain('user_id = (SELECT auth.uid())')
      expect(policy).toContain('(SELECT public.is_project_owner(project_id, auth.uid()))')
      expect(policy).toContain("(SELECT public.project_member_role(project_id, auth.uid())) = 'co-owner'")
    })
  })

  describe('is_project_owner() helper', () => {
    const fn = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.is_project_owner'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.project_member_role')
    )

    it('is declared with the migration-064 safety shape', () => {
      expect(migration).toContain(
        'CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID, p_uid UUID)'
      )
      expect(fn).toContain('RETURNS BOOLEAN')
      expect(fn).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(fn).toContain("SET search_path = ''")
    })

    it('fully qualifies the table it reads (search-path hijack mitigation, T-08-04)', () => {
      expect(fn).toContain('FROM public.vault_projects')
      expect(fn).not.toMatch(/FROM vault_projects\b/)
    })

    it('checks project ownership by id + user_id', () => {
      expect(fn).toContain('WHERE id = p_project_id AND user_id = p_uid')
    })
  })

  describe('project_member_role() helper', () => {
    const fn = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.project_member_role'),
      migration.indexOf('REVOKE EXECUTE ON FUNCTION public.is_project_owner')
    )

    it('is declared with the migration-064 safety shape', () => {
      expect(migration).toContain(
        'CREATE OR REPLACE FUNCTION public.project_member_role(p_project_id UUID, p_uid UUID)'
      )
      expect(fn).toContain('RETURNS TEXT')
      expect(fn).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(fn).toContain("SET search_path = ''")
    })

    it('fully qualifies the table it reads', () => {
      expect(fn).toContain('FROM public.project_members')
      expect(fn).not.toMatch(/FROM project_members\b/)
    })

    it('resolves role by project_id + user_id', () => {
      expect(fn).toContain('WHERE project_id = p_project_id AND user_id = p_uid')
    })
  })

  describe('EXECUTE privilege lockdown (migration 064 precedent — grant, not revoke-only)', () => {
    it('revokes the default PostgREST RPC exposure from PUBLIC, anon, and authenticated', () => {
      expect(migration).toContain(
        'REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;'
      )
      expect(migration).toContain(
        'REVOKE EXECUTE ON FUNCTION public.project_member_role(uuid, uuid) FROM PUBLIC, anon, authenticated;'
      )
    })

    it('grants EXECUTE back to authenticated only — never to anon (RLS policy bodies invoke these as the querying role)', () => {
      expect(migration).toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.is_project_owner\(uuid, uuid\) TO authenticated;/
      )
      expect(migration).toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.project_member_role\(uuid, uuid\) TO authenticated;/
      )
      expect(migration).not.toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.(is_project_owner|project_member_role)\([^)]*\)[^;]*\banon\b/
      )
    })

    it('documents both helpers as policy-body helpers, not client RPCs', () => {
      expect(migration).toContain('COMMENT ON FUNCTION public.is_project_owner(uuid, uuid) IS')
      expect(migration).toContain('COMMENT ON FUNCTION public.project_member_role(uuid, uuid) IS')
      const comments = migration.slice(migration.indexOf('COMMENT ON FUNCTION public.is_project_owner'))
      expect(comments).toContain('not a client-invoked RPC')
    })
  })

  describe('vault_projects — per-operation policy split', () => {
    it('drops the old single combined policy', () => {
      expect(migration).toContain(
        'DROP POLICY IF EXISTS "Artists manage own vault projects" ON public.vault_projects;'
      )
    })

    it('creates a SELECT policy widened to owner OR any member role', () => {
      expect(migration).toContain(
        'CREATE POLICY "vault_projects_select_owner_or_member" ON public.vault_projects'
      )
      const policy = migration.slice(
        migration.indexOf('CREATE POLICY "vault_projects_select_owner_or_member"'),
        migration.indexOf('CREATE POLICY "vault_projects_update_owner_or_editor"')
      )
      expect(policy).toContain('FOR SELECT TO authenticated')
      expect(policy).toContain('(SELECT public.project_member_role(id, auth.uid())) IS NOT NULL')
    })

    it('creates an UPDATE policy scoped to owner OR co-owner/editor, with matching WITH CHECK', () => {
      expect(migration).toContain(
        'CREATE POLICY "vault_projects_update_owner_or_editor" ON public.vault_projects'
      )
      const policy = migration.slice(
        migration.indexOf('CREATE POLICY "vault_projects_update_owner_or_editor"'),
        migration.indexOf('CREATE POLICY "vault_projects_insert_own"')
      )
      expect(policy).toContain('FOR UPDATE TO authenticated')
      expect(policy).toContain("IN ('co-owner', 'editor')")
      expect(policy).toContain('WITH CHECK')
    })

    it('creates an owner-only INSERT policy', () => {
      expect(migration).toContain('CREATE POLICY "vault_projects_insert_own" ON public.vault_projects')
      const policy = migration.slice(
        migration.indexOf('CREATE POLICY "vault_projects_insert_own"'),
        migration.indexOf('CREATE POLICY "vault_projects_delete_owner_only"')
      )
      expect(policy).toContain('FOR INSERT TO authenticated')
      expect(policy).toContain('WITH CHECK ((SELECT auth.uid()) = user_id)')
    })

    it('creates an owner-only DELETE policy', () => {
      expect(migration).toContain(
        'CREATE POLICY "vault_projects_delete_owner_only" ON public.vault_projects'
      )
      const policy = migration.slice(
        migration.indexOf('CREATE POLICY "vault_projects_delete_owner_only"'),
        migration.indexOf('-- ─── (f)')
      )
      expect(policy).toContain('FOR DELETE TO authenticated')
      expect(policy).toContain('USING ((SELECT auth.uid()) = user_id)')
    })

    it('wraps every helper call as (SELECT ...) so the planner caches per statement', () => {
      const block = migration.slice(
        migration.indexOf('DROP POLICY IF EXISTS "Artists manage own vault projects"'),
        migration.indexOf('-- ─── (f)')
      )
      // vault_projects' own policies only ever need project_member_role
      // (is_project_owner reads vault_projects itself, so it is used by
      // project_members' and the child tables' policies, not here).
      expect(block).toMatch(/\(SELECT public\.project_member_role\(/)
      expect(block).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?project_members/)
    })

    it('does not drop or touch the untouched public-discoverability policy', () => {
      expect(migration).not.toMatch(/DROP POLICY[^;]*"Public vault projects discoverable"/)
    })
  })

  describe('child-table rewrite — project-scoped, not row-owner-scoped (Pitfall 1)', () => {
    const childTables: Array<{
      table: string
      oldPolicy: string
      selectPolicy: string
      writePolicy: string
      nullableFallback: boolean
    }> = [
      {
        table: 'tracks',
        oldPolicy: '"Artists manage own tracks"',
        selectPolicy: '"tracks_select_project_owner_or_member"',
        writePolicy: '"tracks_write_project_owner_or_editor"',
        nullableFallback: false,
      },
      {
        table: 'vault_assets',
        oldPolicy: '"Artists manage own assets"',
        selectPolicy: '"vault_assets_select_project_owner_or_member"',
        writePolicy: '"vault_assets_write_project_owner_or_editor"',
        nullableFallback: false,
      },
      {
        table: 'vault_documents',
        oldPolicy: '"Artists manage own documents"',
        selectPolicy: '"vault_documents_select_project_owner_or_member"',
        writePolicy: '"vault_documents_write_project_owner_or_editor"',
        nullableFallback: true,
      },
      {
        table: 'tool_outputs',
        oldPolicy: '"Artists manage own outputs"',
        selectPolicy: '"tool_outputs_select_project_owner_or_member"',
        writePolicy: '"tool_outputs_write_project_owner_or_editor"',
        nullableFallback: true,
      },
    ]

    it.each(childTables)(
      '$table: drops the old row-owner policy and creates project-scoped SELECT + write policies',
      ({ table, oldPolicy, selectPolicy, writePolicy }) => {
        expect(migration).toContain(`DROP POLICY IF EXISTS ${oldPolicy} ON public.${table};`)
        expect(migration).toContain(`CREATE POLICY ${selectPolicy} ON public.${table}`)
        expect(migration).toContain(`CREATE POLICY ${writePolicy} ON public.${table}`)

        const selectStart = migration.indexOf(`CREATE POLICY ${selectPolicy}`)
        const writeStart = migration.indexOf(`CREATE POLICY ${writePolicy}`)
        const selectBlock = migration.slice(selectStart, writeStart)
        expect(selectBlock).toContain('(SELECT public.is_project_owner(project_id, auth.uid()))')
        expect(selectBlock).toContain(
          '(SELECT public.project_member_role(project_id, auth.uid())) IS NOT NULL'
        )

        const writeBlock = migration.slice(writeStart, writeStart + 700)
        expect(writeBlock).toContain('FOR ALL TO authenticated')
        expect(writeBlock).toContain(
          "(SELECT public.project_member_role(project_id, auth.uid())) IN ('co-owner', 'editor')"
        )
        expect(writeBlock).toContain('WITH CHECK')
      }
    )

    it('tracks and vault_assets do NOT get the nullable project_id fallback (project_id is NOT NULL on both)', () => {
      const tracksBlock = migration.slice(
        migration.indexOf('CREATE POLICY "tracks_select_project_owner_or_member"'),
        migration.indexOf('-- vault_assets (project_id NOT NULL')
      )
      expect(tracksBlock).not.toContain('project_id IS NULL')

      const assetsBlock = migration.slice(
        migration.indexOf('CREATE POLICY "vault_assets_select_project_owner_or_member"'),
        migration.indexOf('-- vault_documents (project_id NULLABLE')
      )
      expect(assetsBlock).not.toContain('project_id IS NULL')
    })

    it('vault_documents and tool_outputs DO get the nullable project_id fallback on SELECT and write', () => {
      const documentsBlock = migration.slice(
        migration.indexOf('CREATE POLICY "vault_documents_select_project_owner_or_member"'),
        migration.indexOf('-- tool_outputs (project_id NULLABLE')
      )
      // 3 occurrences: SELECT policy's USING (1) + write policy's USING (1)
      // + write policy's WITH CHECK (1).
      expect(documentsBlock.match(/project_id IS NULL AND user_id = \(SELECT auth\.uid\(\)\)/g)?.length).toBe(3)

      const outputsBlock = migration.slice(
        migration.indexOf('CREATE POLICY "tool_outputs_select_project_owner_or_member"'),
        migration.indexOf('-- ─── (g)')
      )
      expect(outputsBlock.match(/project_id IS NULL AND user_id = \(SELECT auth\.uid\(\)\)/g)?.length).toBe(3)
    })
  })

  describe('owner-membership backfill', () => {
    it('inserts an owner row for every pre-existing vault_projects row, idempotently', () => {
      expect(migration).toContain('INSERT INTO public.project_members (project_id, user_id, role, added_by)')
      expect(migration).toContain('SELECT id, user_id, \'owner\', user_id')
      expect(migration).toContain('FROM public.vault_projects')
      expect(migration).toContain('ON CONFLICT (project_id, user_id) DO NOTHING;')
    })
  })

  describe('readiness trigger — confirmed not redefined', () => {
    it('documents that calculate_vault_readiness() is already SECURITY DEFINER as of migration 070', () => {
      expect(migration).toMatch(/calculate_vault_readiness\(\)[\s\S]*SECURITY DEFINER[\s\S]*migration 070/)
    })

    it('does not redefine calculate_vault_readiness() in this migration', () => {
      expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.calculate_vault_readiness')
    })
  })

  describe('schema-cache reload', () => {
    it('closes with NOTIFY pgrst', () => {
      expect(migration.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    })
  })

  describe('migration conventions and safety', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })

    it('documents the 078/079 numbering + Phase-20 076/077 sequencing note', () => {
      expect(migration).toContain('077')
      expect(migration).toContain('079')
      expect(migration).toMatch(/AFTER Phase 20's 076\/077/)
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    })

    it('uses gen_random_uuid(), never uuid_generate_v4(), in executable SQL', () => {
      expect(sql).toContain('gen_random_uuid()')
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('does not grant client write privileges on project_members', () => {
      expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*project_members/)
    })
  })
})
