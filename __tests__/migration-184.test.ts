import { readFileSync } from 'fs'
import path from 'path'
import {
  WORKSPACE_PERMISSION_VALUES,
  WORKSPACE_PERMISSION_BUNDLES,
  STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES,
  isBundleExcluded,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'

// ─── migration 184 — workspace grants and permission bundles ──────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-182.test.ts and __tests__/migration-183.test.ts. This
// project's migrations are human-gated: an agent never pushes them, so this
// file IS the pre-push review evidence for the D-42 structural exclusion,
// the D-40 bundle-exclusion guarantee, the D-19/D-49 catalogue-drift gate,
// migration 186's load-bearing indexes, and the write/column lockdown.
//
// <!-- planner-discipline-allow: manage_payouts -->
// <!-- planner-discipline-allow: view_tax_information -->
// The excluded-capability assertion below necessarily names the values it
// forbids; it runs against comment-stripped SQL, so the migration's own
// header/table-comment prose may still describe the rule in plain,
// category-level words without ever naming either literal value.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/184_workspace_permissions_grants.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped. Structural and
// negative assertions must run against this rather than the raw file.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** CHECK (col IN ('a', 'b', ...)) clause built from a *_VALUES array. */
function checkClause(column: string, values: readonly string[]): string {
  const list = values.map((v) => `'${v}'`).join(', ')
  return `${column} IN (${list})`
}

/** Extracts a seeded bundle's JSONB permission array from the INSERT block. */
function extractSeededPermissions(key: string): string[] {
  const pattern = new RegExp(`'${key}'[^\\[]*\\[([^\\]]*)\\]`)
  const match = sql.match(pattern)
  expect(match).not.toBeNull()
  return match![1]
    .split(',')
    .map((piece) => piece.trim().replace(/^"|"$/g, ''))
    .filter((piece) => piece.length > 0)
}

const TABLES = ['workspace_grants', 'workspace_permission_bundles'] as const

describe('migration 184 — workspace_grants, workspace_permission_bundles', () => {
  // ══ Table shape ═══════════════════════════════════════════════════════
  describe('both tables exist with row level security and gen_random_uuid() defaults', () => {
    it.each(TABLES)('creates public.%s', (table) => {
      expect(sql).toContain(`CREATE TABLE public.${table}`)
    })

    it.each(TABLES)('enables row level security on public.%s', (table) => {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
    })

    it.each(TABLES)('primary keys public.%s with gen_random_uuid()', (table) => {
      const start = sql.indexOf(`CREATE TABLE public.${table}`)
      const end = sql.indexOf('\n);', start)
      const body = normalizeWhitespace(sql.slice(start, end))
      expect(body).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    })
  })

  // ══ Catalogue agreement (WS-07) ═══════════════════════════════════════
  describe('workspace_grants.permission matches WORKSPACE_PERMISSION_VALUES byte-for-byte', () => {
    it('has 19 grantable permissions', () => {
      expect(WORKSPACE_PERMISSION_VALUES).toHaveLength(19)
    })

    it('the CHECK clause is built from the imported values array, in catalogue order', () => {
      expect(sql).toContain(checkClause('permission', WORKSPACE_PERMISSION_VALUES))
    })
  })

  // ══ Structural exclusion (WS-20, D-42) ══════════════════════════════════
  describe('payout/tax capabilities are structurally unstorable (D-42)', () => {
    it.each(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES)(
      'never contains the literal "%s" anywhere in comment-stripped SQL',
      (value) => {
        expect(sql).not.toContain(value)
      }
    )

    it('the CHECK list and the structurally-excluded set have an empty intersection', () => {
      const excluded = new Set<string>(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES)
      const overlap = WORKSPACE_PERMISSION_VALUES.filter((v) => excluded.has(v))
      expect(overlap).toEqual([])
    })
  })

  // ══ Bundle exclusion (WS-08, D-40) ══════════════════════════════════════
  describe('no seeded system bundle names a bundle-excluded permission (D-40)', () => {
    it.each(Object.keys(WORKSPACE_PERMISSION_BUNDLES))(
      'bundle "%s" names no bundle-excluded permission',
      (key) => {
        const permissions = extractSeededPermissions(key)
        expect(permissions.length).toBeGreaterThan(0)
        for (const permission of permissions) {
          expect(isBundleExcluded(permission as WorkspacePermission)).toBe(false)
        }
      }
    )

    it.each(Object.keys(WORKSPACE_PERMISSION_BUNDLES))(
      'every permission named by bundle "%s" is a member of WORKSPACE_PERMISSION_VALUES',
      (key) => {
        const permissions = extractSeededPermissions(key)
        for (const permission of permissions) {
          expect(WORKSPACE_PERMISSION_VALUES).toContain(permission)
        }
      }
    )
  })

  // ══ Seed agreement ══════════════════════════════════════════════════════
  describe('each seeded bundle equals the exported WORKSPACE_PERMISSION_BUNDLES array for its key', () => {
    it.each(Object.entries(WORKSPACE_PERMISSION_BUNDLES))(
      'bundle "%s" matches its exported permission list exactly',
      (key, expected) => {
        const seeded = extractSeededPermissions(key)
        expect(seeded).toEqual([...expected])
      }
    )

    it('seeds exactly four system bundles, all workspace_id NULL and is_system TRUE', () => {
      const insertBlock = sql.slice(
        sql.indexOf('INSERT INTO public.workspace_permission_bundles'),
        sql.indexOf('ON CONFLICT')
      )
      const rows = insertBlock.match(/\(\s*NULL,/g) ?? []
      expect(rows).toHaveLength(4)
      expect(insertBlock).not.toMatch(/,\s*FALSE\s*\)/)
    })

    it('the seed insert is idempotent via ON CONFLICT DO NOTHING', () => {
      expect(sql).toMatch(/ON CONFLICT \(key\) WHERE workspace_id IS NULL DO NOTHING;/)
    })
  })

  // ══ Index gates (WS-24 hot path) ══════════════════════════════════════
  describe('the three load-bearing indexes migration 186 depends on exist', () => {
    it('the unique partial index declares NULLS NOT DISTINCT and WHERE revoked_at IS NULL', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE UNIQUE INDEX idx_workspace_grants_unique_live'),
          sql.indexOf('CREATE INDEX idx_workspace_grants_covering')
        )
      )
      expect(block).toContain(
        'ON public.workspace_grants (workspace_id, relationship_id, project_id, permission) NULLS NOT DISTINCT'
      )
      expect(block).toContain('WHERE revoked_at IS NULL')
    })

    it('a covering index exists on (workspace_id, permission, project_id)', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE INDEX idx_workspace_grants_covering'),
          sql.indexOf('CREATE INDEX idx_workspace_grants_relationship')
        )
      )
      expect(block).toContain('ON public.workspace_grants (workspace_id, permission, project_id)')
      expect(block).toContain('WHERE revoked_at IS NULL')
    })

    it('an index exists on (relationship_id) filtered to live rows', () => {
      const block = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE INDEX idx_workspace_grants_relationship'),
          sql.indexOf('ALTER TABLE public.workspace_grants ENABLE ROW LEVEL SECURITY')
        )
      )
      expect(block).toContain('ON public.workspace_grants (relationship_id)')
      expect(block).toContain('WHERE revoked_at IS NULL')
    })
  })

  // ══ Write lockdown ══════════════════════════════════════════════════════
  describe('two-table write lockdown — no client PostgREST write path', () => {
    it.each(TABLES)('revokes INSERT/UPDATE/DELETE on public.%s from authenticated and anon', (table) => {
      expect(sql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${table} FROM authenticated, anon;`)
    })
  })

  // ══ Column-level lockdown (migration 080 §(g) convention) ══════════════
  describe('workspace_grants column-level SELECT lockdown withholds administrative columns', () => {
    it('revokes SELECT on workspace_grants from authenticated and anon', () => {
      expect(sql).toContain('REVOKE SELECT ON public.workspace_grants FROM authenticated, anon;')
    })

    it('GRANT SELECT lists non-administrative columns only, omitting granted_by and revoked_by', () => {
      const grant = sql.match(/GRANT SELECT \(([^)]*)\)\s*\n?\s*ON public\.workspace_grants TO authenticated;/)
      expect(grant).not.toBeNull()
      const columns = grant![1].split(',').map((c) => c.trim())
      expect(columns).not.toContain('granted_by')
      expect(columns).not.toContain('revoked_by')
      expect(columns).toEqual(
        expect.arrayContaining([
          'id',
          'workspace_id',
          'relationship_id',
          'project_id',
          'permission',
          'source',
          'granted_at',
          'revoked_at',
          'created_at',
        ])
      )
    })
  })

  // ══ Helper conventions ══════════════════════════════════════════════════
  describe('workspace_grant_visible_to_member is SECURITY DEFINER, STABLE, and search-path-pinned', () => {
    function functionBlock(name: string): string {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = sql.indexOf('\n$$;', start)
      expect(end).toBeGreaterThan(start)
      return sql.slice(start, end)
    }

    it('declares (p_grant_id UUID, p_uid UUID)', () => {
      const block = normalizeWhitespace(functionBlock('workspace_grant_visible_to_member'))
      expect(block).toContain('(p_grant_id UUID, p_uid UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('revokes then grants EXECUTE to authenticated only', () => {
      const revokeIndex = sql.indexOf(
        'REVOKE EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) FROM PUBLIC, anon, authenticated;'
      )
      const grantIndex = sql.indexOf(
        'GRANT  EXECUTE ON FUNCTION public.workspace_grant_visible_to_member(uuid, uuid) TO authenticated;'
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      expect(sql).not.toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.workspace_grant_visible_to_member\(uuid, uuid\) TO anon/
      )
    })

    it('documents it as an RLS primitive, not a client RPC', () => {
      const comment = sql.match(
        /COMMENT ON FUNCTION public\.workspace_grant_visible_to_member\(uuid, uuid\) IS[^;]*;/
      )
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('42P17')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })
  })

  // ══ Scalar-subselect wrapping — structural recursion guard ═══════════════
  describe('every helper call inside a policy body is scalar-subselect wrapped', () => {
    const policyRegion = sql.slice(sql.indexOf('CREATE POLICY'))
    const helperPattern = /public\.(workspace_member_role|workspace_grant_visible_to_member)\s*\(/g

    it('finds helper calls in the policy region at all (the sample is not empty)', () => {
      const calls = policyRegion.match(helperPattern) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(3)
    })

    it('precedes every one of them with "(SELECT "', () => {
      const pattern = new RegExp(helperPattern.source, 'g')
      const unwrapped: string[] = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(policyRegion)) !== null) {
        const preceding = policyRegion.slice(Math.max(0, match.index - 8), match.index)
        if (!preceding.endsWith('(SELECT ')) {
          unwrapped.push(
            policyRegion.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' ')
          )
        }
      }
      expect(unwrapped).toEqual([])
    })

    it('inlines no cross-table EXISTS subquery in any policy body (the 018 recursion shape)', () => {
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT 1 FROM (public\.)?workspace_grants/i)
    })
  })

  // ══ Scope guard ═══════════════════════════════════════════════════════
  describe('scope guard — Slice D policy work does not leak into this migration', () => {
    it('never touches vault_projects', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.vault_projects/i)
    })

    it('never touches tracks', () => {
      expect(sql).not.toMatch(/ALTER TABLE public\.tracks/i)
    })

    it('does not define a three-hop project-permission helper here', () => {
      expect(sql).not.toMatch(/workspace_project_permission/i)
    })
  })

  // ══ Negative assertions — nothing pre-existing touched ═════════════════
  describe('negative assertions — additive only, nothing pre-existing perturbed', () => {
    it('never uses uuid_generate_v4', () => {
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('never disables row level security', () => {
      expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('never drops a policy (nothing pre-existing is being rewritten here)', () => {
      expect(sql).not.toMatch(/DROP POLICY/i)
    })

    it('never redefines workspace_member_role, is_workspace_owner, or the 183 helper pair', () => {
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_member_role/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.is_workspace_owner/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_roster_relationship_is_live/)
      expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.workspace_agreement_evidence_visible/)
    })

    it('never opens a bare USING (true) policy', () => {
      expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint|HUMAN-GATED/i)
    })

    it('documents the 184 numbering and the 187/188 reservation for Phase 38.2', () => {
      expect(migration).toContain('184')
      expect(migration).toContain('187')
      expect(migration).toContain('188')
      expect(migration).toMatch(/RESERVED for Phase 38\.2/)
    })

    it('uses gen_random_uuid() and never uuid_generate_v4() anywhere', () => {
      expect(sql).toContain('gen_random_uuid()')
      expect(sql).not.toContain('uuid_generate_v4')
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
