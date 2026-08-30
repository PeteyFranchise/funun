import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 136 — work_members, the helper pair, every policy ────────────
// Text-lock + structural test, in the established style of
// __tests__/migration-134.test.ts. Phase 37's migrations are human-gated: an
// agent never pushes them, so these four files ARE the pre-push review
// evidence.
//
// The load-bearing proof here is STRUCTURAL, not textual: every helper call
// inside a policy body must be wrapped as a scalar subselect. That wrapping is
// migration 078's 42P17 guard, and an inlined `EXISTS (SELECT 1 FROM ...)`
// hand-edited back in later would look perfectly reasonable in review while
// breaking every authenticated read at once, at REWRITE time, for every user.
// It should fail here instead of in production.

const migration136 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/136_work_members.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose.
const sqlOnly = migration136
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed. A COMMENT body is
// documentation that happens to live in the database, so a "this migration
// never READS table X" assertion must not be tripped by the very comment that
// explains why X is deliberately not read.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const commentProse = normalizeWhitespace(
  migration136
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

const HELPERS = ['is_work_owner', 'work_member_tier'] as const
const POLICED_TABLES = [
  'work_members',
  'works',
  'work_versions',
  'lyric_blocks',
  'ai_entries',
] as const

// The region of the file that contains the policies: from the first policy to
// the claim-bridge function that follows them all. Restricting the
// subselect-wrapping proof to this slice keeps the helpers' own CREATE / REVOKE
// / GRANT / COMMENT statements — which name the functions without calling them
// from a policy — out of the sample.
const policyRegion = sqlOnly.slice(
  sqlOnly.indexOf('CREATE POLICY'),
  sqlOnly.indexOf('CREATE OR REPLACE FUNCTION public.sync_work_membership_on_claim')
)

/** The body of a `CREATE OR REPLACE FUNCTION public.<name>` statement. */
function functionBlock(name: string): string {
  const start = sqlOnly.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sqlOnly.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sqlOnly.slice(start, end)
}

describe('migration 136 — membership, the helper pair, and every policy', () => {
  // ══ The guest list ════════════════════════════════════════════════════════
  describe('work_members exists and can hold a person who has not signed up yet', () => {
    it('creates the table', () => {
      expect(sqlOnly).toContain('CREATE TABLE public.work_members (')
    })

    it('leaves user_id nullable — an unclaimed invitee is a legitimate state', () => {
      const body = normalizeWhitespace(
        sqlOnly.slice(
          sqlOnly.indexOf('CREATE TABLE public.work_members ('),
          sqlOnly.indexOf('\n);', sqlOnly.indexOf('CREATE TABLE public.work_members ('))
        )
      )
      expect(body).toContain('user_id UUID REFERENCES auth.users ON DELETE CASCADE,')
      expect(body).toContain('collaborator_id UUID REFERENCES public.collaborators ON DELETE SET NULL,')
      expect(body).toContain("tier TEXT NOT NULL CHECK (tier IN ('contribute', 'administer'))")
    })

    it('uses two PARTIAL unique indexes, not one composite UNIQUE', () => {
      // A plain UNIQUE (work_id, user_id) treats every unclaimed invitee's NULL
      // as distinct, so the same person could be added twice — and it would not
      // constrain the collaborator axis at all.
      expect(normalizeWhitespace(sqlOnly)).toContain(
        'CREATE UNIQUE INDEX idx_work_members_unique_user ON public.work_members (work_id, user_id) WHERE user_id IS NOT NULL;'
      )
      expect(normalizeWhitespace(sqlOnly)).toContain(
        'CREATE UNIQUE INDEX idx_work_members_unique_collab ON public.work_members (work_id, collaborator_id) WHERE collaborator_id IS NOT NULL;'
      )
      expect(sqlOnly).not.toMatch(/UNIQUE\s*\(\s*work_id\s*,\s*user_id\s*\)/)
    })

    it('creates the two plain lookup indexes', () => {
      expect(sqlOnly).toContain('CREATE INDEX idx_work_members_work_id ON public.work_members (work_id);')
      expect(sqlOnly).toContain('CREATE INDEX idx_work_members_user_id ON public.work_members (user_id);')
    })

    it('enables row level security', () => {
      expect(sqlOnly).toContain('ALTER TABLE public.work_members ENABLE ROW LEVEL SECURITY;')
    })
  })

  // ══ T-37-03: membership is never writable over PostgREST ══════════════════
  describe('the guest list is unwritable over raw PostgREST (migration 078(b) posture)', () => {
    it('carries the write REVOKE verbatim', () => {
      expect(sqlOnly).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON public.work_members FROM authenticated, anon;'
      )
    })

    it('grants no table privilege on work_members back to any client role', () => {
      const tableGrants = sqlOnly.match(/GRANT[^;]*ON\s+(TABLE\s+)?public\.work_members[^;]*;/gi) ?? []
      expect(tableGrants).toEqual([])
    })

    it('creates no INSERT, UPDATE or DELETE policy on work_members', () => {
      const memberPolicies = sqlOnly.match(/CREATE POLICY[^;]*ON public\.work_members[^;]*;/g) ?? []
      expect(memberPolicies).toHaveLength(1)
      expect(memberPolicies[0]).toContain('FOR SELECT TO authenticated')
    })

    it('records WHY the grant is withheld rather than merely policed', () => {
      expect(commentProse).toMatch(
        /Membership is the capability that lets a person write audio and lyrics into SOMEBODY ELSE'S SONG/
      )
      expect(commentProse).toMatch(/service-role API route that has already proved the caller's tier/)
    })
  })

  // ══ T-37-01 / T-37-02: the SECURITY DEFINER helper pair ═══════════════════
  describe('the helper pair is SECURITY DEFINER, STABLE, and search-path-pinned', () => {
    it.each(HELPERS)('declares public.%s correctly', helper => {
      const block = normalizeWhitespace(functionBlock(helper))
      expect(block).toContain('(p_work_id UUID, p_uid UUID)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
      // Takes the uid as a parameter rather than calling auth.uid() internally,
      // so the empty search path never has to reach into the auth schema
      // (migration 078's own reasoning, and migration 064's before it).
      expect(block).not.toContain('auth.uid()')
    })

    it.each(HELPERS)('revokes then grants EXECUTE on public.%s', helper => {
      const revokeIndex = sqlOnly.indexOf(
        `REVOKE EXECUTE ON FUNCTION public.${helper}(uuid, uuid) FROM PUBLIC, anon, authenticated;`
      )
      const grantIndex = sqlOnly.indexOf(
        `GRANT  EXECUTE ON FUNCTION public.${helper}(uuid, uuid) TO authenticated;`
      )
      expect(revokeIndex).toBeGreaterThanOrEqual(0)
      expect(grantIndex).toBeGreaterThan(revokeIndex)
      // anon must never hold a SECURITY DEFINER oracle for "does user X own or
      // hold a tier on work Y".
      expect(sqlOnly).not.toMatch(
        new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${helper}\\(uuid, uuid\\) TO anon`)
      )
    })

    it.each(HELPERS)('documents public.%s as an RLS primitive, not a client RPC', helper => {
      const comment = sqlOnly.match(
        new RegExp(`COMMENT ON FUNCTION public\\.${helper}\\(uuid, uuid\\) IS[^;]*;`)
      )
      expect(comment).not.toBeNull()
      expect(comment![0]).toContain('SECURITY DEFINER')
      expect(comment![0]).toContain('42P17')
      expect(comment![0]).toContain('wrapped as (SELECT ...)')
      expect(comment![0]).toContain('not a client-invoked RPC')
    })

    it('records the recursion this pair exists to prevent', () => {
      expect(commentProse).toMatch(/WHY A HELPER PAIR AND NOT TWO CROSS-TABLE EXISTS SUBQUERIES/)
      expect(commentProse).toMatch(/SQLSTATE 42P17/)
      expect(commentProse).toMatch(/migration 018/)
      expect(commentProse).toMatch(/migration 064/)
      expect(commentProse).toMatch(/migration 078/)
    })
  })

  // ══ T-37-02, structurally: the scalar-subselect wrapping ══════════════════
  describe('every helper call inside a policy is wrapped as a scalar subselect', () => {
    it('finds helper calls in the policy region at all (the sample is not empty)', () => {
      const calls = policyRegion.match(/public\.(is_work_owner|work_member_tier)\s*\(/g) ?? []
      expect(calls.length).toBeGreaterThanOrEqual(10)
    })

    it('precedes every one of them with "(SELECT "', () => {
      const pattern = /public\.(is_work_owner|work_member_tier)\s*\(/g
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

    it('inlines no cross-table EXISTS subquery in any policy body', () => {
      // This is the exact shape that recursed in migration 018.
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT/i)
      expect(policyRegion).not.toMatch(/FROM\s+public\.work_members/i)
      expect(policyRegion).not.toMatch(/FROM\s+public\.works\b/i)
    })
  })

  // ══ Policies exist for all five tables ════════════════════════════════════
  describe('all five tables of the composition layer are policed here', () => {
    it.each(POLICED_TABLES)('creates at least one policy on public.%s', table => {
      const policies =
        sqlOnly.match(new RegExp(`CREATE POLICY "[^"]+" ON public\\.${table}\\b`, 'g')) ?? []
      expect(policies.length).toBeGreaterThanOrEqual(1)
    })

    it('gives works four per-operation policies, with DELETE owner-only', () => {
      expect(sqlOnly).toContain('CREATE POLICY "works_select_owner_or_member" ON public.works')
      expect(sqlOnly).toContain('CREATE POLICY "works_update_owner_or_member" ON public.works')
      expect(sqlOnly).toContain('CREATE POLICY "works_insert_own" ON public.works')
      expect(sqlOnly).toContain('CREATE POLICY "works_delete_owner_only" ON public.works')

      const del = normalizeWhitespace(
        sqlOnly.slice(sqlOnly.indexOf('CREATE POLICY "works_delete_owner_only"'))
      )
      expect(del).toContain('FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);')
    })

    it.each(['work_versions', 'lyric_blocks', 'ai_entries'])(
      '%s resolves access through work_id, never the row\'s own user column',
      table => {
        const select = normalizeWhitespace(
          sqlOnly.slice(
            sqlOnly.indexOf(`CREATE POLICY "${table}_select_owner_or_member"`),
            sqlOnly.indexOf(`CREATE POLICY "${table}_write_owner_or_member"`)
          )
        )
        expect(select).toContain(`ON public.${table} FOR SELECT TO authenticated`)
        expect(select).toContain('(SELECT public.is_work_owner(work_id, auth.uid()))')
        expect(select).toContain('(SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL')
        // Migration 078's Pitfall 1: a child row's own creator column is not an
        // access fact the moment a second writer exists.
        expect(select).not.toMatch(/auth\.uid\(\)\)\s*=\s*(user_id|created_by|author_user_id)/)
      }
    )

    it('gives every child table a FOR ALL write policy with a WITH CHECK', () => {
      for (const table of ['work_versions', 'lyric_blocks', 'ai_entries']) {
        const write = sqlOnly.slice(sqlOnly.indexOf(`CREATE POLICY "${table}_write_owner_or_member"`))
        const statement = write.slice(0, write.indexOf(';') + 1)
        expect(statement).toContain('FOR ALL TO authenticated')
        expect(statement).toContain('WITH CHECK')
      }
    })

    it('records that both tiers writing content today is a decision, not an omission', () => {
      expect(commentProse).toMatch(/WHAT THE TWO TIERS MEAN IN 37\.1/)
      expect(commentProse).toMatch(/ADMINISTER is NOT a row-write distinction in this phase/)
      expect(commentProse).toMatch(/In 37\.2 administer additionally gates the money and release doors/)
      expect(commentProse).toMatch(/graduated_project_id/)
      expect(commentProse).toMatch(/deliberate decision, not an oversight/)
    })
  })

  // ══ T-37-08: the claimed-collaborator bridge ══════════════════════════════
  describe('the claim bridge keys off the one verified-identity signal', () => {
    it('declares the bridge SECURITY DEFINER with an empty search path', () => {
      const block = normalizeWhitespace(functionBlock('sync_work_membership_on_claim'))
      expect(block).toContain('RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('updates ONLY rows whose user_id is still null (idempotency)', () => {
      const block = normalizeWhitespace(functionBlock('sync_work_membership_on_claim'))
      expect(block).toContain(
        'UPDATE public.work_members SET user_id = NEW.claimed_by WHERE collaborator_id = NEW.id AND user_id IS NULL;'
      )
    })

    it('fires AFTER UPDATE OF claimed_by on collaborators, only on a real change', () => {
      const trigger = normalizeWhitespace(
        sqlOnly.slice(sqlOnly.indexOf('CREATE TRIGGER sync_work_membership_on_claim'))
      )
      expect(trigger).toContain('AFTER UPDATE OF claimed_by ON public.collaborators')
      expect(trigger).toContain('FOR EACH ROW')
      expect(trigger).toContain('WHEN (NEW.claimed_by IS DISTINCT FROM OLD.claimed_by)')
      expect(sqlOnly).toContain(
        'DROP TRIGGER IF EXISTS sync_work_membership_on_claim ON public.collaborators;'
      )
    })

    it('never consults split_sheet_parties.user_id — the dead column', () => {
      expect(sqlNoDocs).not.toMatch(/split_sheet_parties/i)
      // The COMMENT ON body DOES name it — that is where the decision is
      // recorded — but no statement reads, joins or writes the table.
      expect(sqlOnly).toMatch(/never off split_sheet_parties\.user_id/)
      expect(commentProse).toMatch(/DEAD SIGNAL/)
      expect(commentProse).toMatch(/READ in three places in this codebase and WRITTEN nowhere/)
      expect(commentProse).toMatch(/Supabase-Auth-verified account email/)
    })

    it('is revoke-only — trigger-internal, never a client RPC', () => {
      expect(sqlOnly).toContain(
        'REVOKE EXECUTE ON FUNCTION public.sync_work_membership_on_claim() FROM PUBLIC, anon, authenticated;'
      )
      expect(sqlOnly).not.toMatch(
        /GRANT\s+EXECUTE ON FUNCTION public\.sync_work_membership_on_claim\(\) TO (authenticated|anon)/
      )
    })

    it('records why one fire site is enough where migration 079 needed three', () => {
      expect(commentProse).toMatch(/ONE FIRE SITE, NOT THREE/)
      expect(commentProse).toMatch(/always carries collaborator_id AT CREATION TIME/)
    })
  })

  // ══ Housekeeping ══════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('records that this file carries 135\'s policies and why', () => {
      expect(commentProse).toMatch(/THIS FILE CARRIES 135's POLICIES, AND THAT IS DELIBERATE/)
      expect(commentProse).toMatch(/The split cannot run the other way/)
      expect(commentProse).toMatch(/single `supabase db push` at one checkpoint/)
    })

    it('carries the standing human-gated push line', () => {
      expect(migration136).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('touches no already-landed migration', () => {
      expect(commentProse).toMatch(/Do NOT edit migrations 001-134/)
    })

    it('uses gen_random_uuid() and never uuid_generate_v4()', () => {
      expect(sqlOnly).toContain('gen_random_uuid()')
      expect(sqlOnly).not.toMatch(/uuid_generate_v4/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration136
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration136.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
