import { readFileSync } from 'fs'
import path from 'path'
import {
  STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES,
  WORKSPACE_PERMISSION_VALUES,
} from '@/lib/workspaces/permissions'

// ─── migration 195 — public.workspace_permission_requests (R-19 / WSR-28) ──
// Text-lock + structural test, in the established style of
// __tests__/migration-191.test.ts, __tests__/migration-192.test.ts and
// __tests__/migration-193.test.ts. This project's migrations are
// human-gated: an agent never pushes them and there is no live-DB harness
// in this repository, so this file IS the pre-push review evidence for
// R-19/WSR-28.
//
// LIMITATION, STATED UP FRONT: this suite proves what the SQL DECLARES. It
// cannot execute a policy, cannot fire a trigger, and never touches a
// database. The behavioural half belongs to the owner's joint-push
// verification window alongside 190-194.
//
// WHAT THIS SUITE IS REALLY FOR: the single most important property of this
// migration is a NEGATIVE one — a permission request is NOT a grant, and no
// authorization path reads this table. A negative property is exactly the
// kind that decays silently under later edits, so the "is not a grant"
// block below is the first and largest section here on purpose.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/195_workspace_permission_requests.sql'),
  'utf8'
)

// Executable SQL only, with `--` comment lines stripped, so "the migration
// does not do X" assertions cannot be defeated (or falsely tripped) by
// prose. Mirrors migration-186's / migration-192's / migration-193's pattern.
const sqlOnly = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// The same view with COMMENT ON bodies removed too, for assertions about
// what the migration DOES rather than what its documentation discusses —
// several COMMENT ON strings deliberately name the things the executable
// SQL must never do.
const sqlNoDocs = sqlOnly.replace(/COMMENT ON [\s\S]*?';\n/g, '')

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const commentProse = normalizeWhitespace(
  migration
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--'))
    .map((line) => line.replace(/^--\s?/, ''))
    .join(' ')
)

const TABLE = 'public.workspace_permission_requests'

const POLICY_NAMES = [
  'workspace_permission_requests_member_select',
  'workspace_permission_requests_member_decide',
  'workspace_permission_requests_workspace_select',
  'workspace_permission_requests_workspace_insert',
  'workspace_permission_requests_workspace_withdraw',
] as const

/**
 * Returns the executable text of one CREATE POLICY statement, from its name
 * to the terminating semicolon. Policy bodies in this file contain no
 * semicolons of their own, so the first `;` after the name reliably ends the
 * statement.
 */
function policyBody(name: string): string {
  const start = sqlNoDocs.indexOf(`CREATE POLICY "${name}"`)
  expect(start).toBeGreaterThan(-1)
  const end = sqlNoDocs.indexOf(';', start)
  expect(end).toBeGreaterThan(start)
  return normalizeWhitespace(sqlNoDocs.slice(start, end))
}

/** The WITH CHECK clause of a policy, or '' when it has none. */
function withCheckClause(name: string): string {
  const body = policyBody(name)
  const marker = 'WITH CHECK'
  const at = body.indexOf(marker)
  return at === -1 ? '' : body.slice(at)
}

/** The USING clause of a policy, up to WITH CHECK when one follows. */
function usingClause(name: string): string {
  const body = policyBody(name)
  const at = body.indexOf('USING')
  if (at === -1) return ''
  const check = body.indexOf('WITH CHECK')
  return check === -1 ? body.slice(at) : body.slice(at, check)
}

// ─── A REQUEST IS NOT A GRANT ─────────────────────────────────────────────
describe('migration 195 — a permission request is not a grant', () => {
  it('declares no parent_grant_id column, and never mentions one in executable SQL', () => {
    expect(sqlNoDocs).not.toContain('parent_grant_id')
  })

  it('is never walked by the grant lineage: workspace_grant_lineage_live is not referenced', () => {
    expect(sqlNoDocs).not.toContain('workspace_grant_lineage_live')
  })

  it('is never read by the authorization helper: workspace_project_permission is not referenced', () => {
    expect(sqlNoDocs).not.toContain('workspace_project_permission')
  })

  it('does not touch workspace_grants at all — no column, constraint or index on it', () => {
    expect(sqlNoDocs).not.toContain('workspace_grants')
  })

  it("does not relax migration 191's consent-root-or-lineage constraint", () => {
    // The whole design of R-19 is that the ask lives OUTSIDE the lineage
    // precisely so 191's constraint can stay as strict as it is. Naming it
    // in executable SQL at all would mean this file is dropping, widening
    // or replacing it.
    expect(sqlNoDocs).not.toContain('workspace_grants_consent_root_or_lineage_check')
    expect(sqlNoDocs).not.toMatch(/DROP\s+CONSTRAINT/i)
  })

  it('creates no policy on, and drops no policy from, any other table', () => {
    const createdPolicyTables = Array.from(
      sqlNoDocs.matchAll(/CREATE POLICY\s+"[^"]+"\s+ON\s+(\S+)/g)
    ).map((match) => match[1])

    expect(createdPolicyTables.length).toBe(POLICY_NAMES.length)
    for (const table of createdPolicyTables) {
      expect(table).toBe(TABLE)
    }
    expect(sqlNoDocs).not.toMatch(/DROP\s+POLICY/i)
  })

  it('redefines no pre-existing function — the only functions it creates are its own two triggers', () => {
    const createdFunctions = Array.from(
      sqlNoDocs.matchAll(/CREATE OR REPLACE FUNCTION\s+(public\.[a-z_]+)/g)
    ).map((match) => match[1])

    expect(createdFunctions).toEqual([
      'public.workspace_permission_request_member_matches_relationship',
      'public.workspace_permission_request_transition_guard',
    ])
  })

  it('creates exactly one table, and it is this one', () => {
    const createdTables = Array.from(sqlNoDocs.matchAll(/CREATE TABLE\s+(\S+)/g)).map(
      (match) => match[1]
    )
    expect(createdTables).toEqual([TABLE])
  })

  it('states the not-an-authorization-path property emphatically in its header', () => {
    expect(commentProse).toContain(
      'A PERMISSION REQUEST IS NOT A GRANT. THIS TABLE IS NOT CONSULTED BY ANY AUTHORIZATION PATH'
    )
  })
})

// ─── TABLE SHAPE ──────────────────────────────────────────────────────────
describe('migration 195 — table shape', () => {
  const REQUIRED_COLUMNS = [
    'id',
    'workspace_id',
    'relationship_id',
    'member_user_id',
    'permission',
    'project_id',
    'requested_by',
    'requested_at',
    'state',
    'decided_at',
    'decided_by',
    'note',
  ]

  it.each(REQUIRED_COLUMNS)('declares the %s column', (column) => {
    expect(sqlNoDocs).toMatch(new RegExp(`^\\s+${column}\\s+`, 'm'))
  })

  it('mints its id with gen_random_uuid(), never uuid_generate_v4()', () => {
    expect(sqlNoDocs).toContain('UUID PRIMARY KEY DEFAULT gen_random_uuid()')
    expect(sqlNoDocs).not.toContain('uuid_generate_v4')
  })

  it('makes both security foreign keys NOT NULL (the F22/R-16 lesson, applied at birth)', () => {
    expect(sqlNoDocs).toMatch(
      /relationship_id\s+UUID NOT NULL REFERENCES public\.workspace_roster_relationships/
    )
    expect(sqlNoDocs).toMatch(/member_user_id\s+UUID NOT NULL REFERENCES auth\.users/)
    expect(sqlNoDocs).toMatch(/workspace_id\s+UUID NOT NULL REFERENCES public\.workspaces/)
  })

  it('constrains state to the four lifecycle values, defaulting to pending', () => {
    expect(sqlNoDocs).toContain("state           TEXT NOT NULL DEFAULT 'pending'")
    expect(sqlNoDocs).toContain(
      "CHECK (state IN ('pending', 'approved', 'declined', 'withdrawn'))"
    )
  })

  it('admits no half-recorded decision — pending carries neither decision column, decided carries both', () => {
    const constraint = sqlNoDocs.slice(
      sqlNoDocs.indexOf('workspace_permission_requests_decision_pair_check')
    )
    expect(constraint).toContain(
      "(state = 'pending' AND decided_at IS NULL AND decided_by IS NULL)"
    )
    expect(constraint).toContain(
      "(state <> 'pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)"
    )
  })

  it('enables row level security on the new table', () => {
    expect(sqlNoDocs).toContain(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`)
  })

  it('revokes every client write path, matching the house posture on every workspace table', () => {
    expect(sqlNoDocs).toContain(
      `REVOKE INSERT, UPDATE, DELETE ON ${TABLE} FROM authenticated, anon;`
    )
  })

  it('reloads the PostgREST schema cache', () => {
    expect(sqlNoDocs).toContain("NOTIFY pgrst, 'reload schema'")
  })
})

// ─── THE PERMISSION CATALOGUE AND D-42's STRUCTURAL EXCLUSION ─────────────
describe('migration 195 — permission values', () => {
  const catalogueCheck = sqlNoDocs.slice(
    sqlNoDocs.indexOf('CHECK (permission IN ('),
    sqlNoDocs.indexOf('project_id      UUID')
  )

  it.each(WORKSPACE_PERMISSION_VALUES)(
    'admits the grantable catalogue value %s',
    (permission) => {
      expect(catalogueCheck).toContain(`'${permission}'`)
    }
  )

  it('admits exactly the nineteen catalogue values and nothing else', () => {
    const listed = Array.from(catalogueCheck.matchAll(/'([a-z_]+)'/g)).map((match) => match[1])
    expect(listed).toEqual([...WORKSPACE_PERMISSION_VALUES])
  })

  it.each(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES)(
    'names %s in its own structural-exclusion constraint (D-42 belt and braces)',
    (excluded) => {
      const exclusion = sqlNoDocs.slice(
        sqlNoDocs.indexOf('workspace_permission_requests_structural_exclusion_check')
      )
      expect(exclusion.slice(0, 400)).toContain(`'${excluded}'`)
    }
  )

  it.each(STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES)(
    'never admits %s through the catalogue CHECK either',
    (excluded) => {
      expect(catalogueCheck).not.toContain(`'${excluded}'`)
    }
  )

  it('says in prose that the two literals and permissions.ts must change together', () => {
    expect(commentProse).toContain(
      'THESE TWO LITERALS AND `STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES` IN lib/workspaces/permissions.ts MUST CHANGE TOGETHER'
    )
  })
})

// ─── ONE OPEN ASK PER SCOPE ───────────────────────────────────────────────
describe('migration 195 — the partial unique index', () => {
  const index = normalizeWhitespace(
    sqlNoDocs.slice(
      sqlNoDocs.indexOf('CREATE UNIQUE INDEX idx_workspace_permission_requests_open'),
      sqlNoDocs.indexOf('CREATE INDEX idx_workspace_permission_requests_member_state')
    )
  )

  it('keys on relationship, permission and the coalesced project scope', () => {
    expect(index).toContain(
      "(relationship_id, permission, (COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)))"
    )
  })

  it('is partial on pending only, so terminal rows accumulate freely as history', () => {
    expect(index).toContain("WHERE state = 'pending'")
  })
})

// ─── THE TRIGGERS — the invariants service-role cannot bypass ─────────────
describe('migration 195 — integrity triggers', () => {
  it('asserts the denormalised member_user_id against the relationship on INSERT and UPDATE', () => {
    expect(sqlNoDocs).toContain(
      'CREATE TRIGGER workspace_permission_requests_member_matches'
    )
    expect(sqlNoDocs).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.workspace_permission_requests[\s\S]*?workspace_permission_request_member_matches_relationship\(\)/
    )
    expect(sqlNoDocs).toContain('IF NEW.member_user_id <> v_member_user_id THEN')
  })

  it('also pins the denormalised workspace_id to the relationship', () => {
    expect(sqlNoDocs).toContain('IF NEW.workspace_id <> v_workspace_id THEN')
  })

  it('makes approved, declined and withdrawn terminal', () => {
    expect(sqlNoDocs).toContain("IF OLD.state <> 'pending' THEN")
    expect(sqlNoDocs).toContain(
      'CREATE TRIGGER workspace_permission_requests_transition_guard'
    )
    expect(sqlNoDocs).toMatch(
      /BEFORE UPDATE ON public\.workspace_permission_requests[\s\S]*?workspace_permission_request_transition_guard\(\)/
    )
  })

  it('makes the subject of a request immutable', () => {
    const guard = sqlNoDocs.slice(
      sqlNoDocs.indexOf('FUNCTION public.workspace_permission_request_transition_guard')
    )
    for (const column of [
      'relationship_id',
      'workspace_id',
      'member_user_id',
      'permission',
      'project_id',
      'requested_by',
      'requested_at',
    ]) {
      expect(guard).toContain(`NEW.${column}`)
    }
  })

  it('adds no SECURITY DEFINER body to the schema', () => {
    // Neither trigger needs definer privilege: both read one row the
    // writing transaction can already read. A definer body here would be
    // an unexplained privilege escalation surface.
    expect(sqlNoDocs).not.toContain('SECURITY DEFINER')
  })

  it("pins both trigger functions' search_path", () => {
    const definitions = Array.from(sqlNoDocs.matchAll(/LANGUAGE plpgsql\s+SET search_path = ''/g))
    expect(definitions).toHaveLength(2)
  })
})

// ─── THE POLICIES ─────────────────────────────────────────────────────────
describe('migration 195 — RLS policies', () => {
  it.each(POLICY_NAMES)('creates the %s policy', (name) => {
    expect(sqlNoDocs).toContain(`CREATE POLICY "${name}" ON ${TABLE}`)
  })

  it('lets the Member read their own asks with no join and no workspace role helper', () => {
    const body = policyBody('workspace_permission_requests_member_select')
    expect(body).toContain('USING (member_user_id = (SELECT auth.uid()))')
    expect(body).not.toContain('workspace_member_role')
    expect(body).not.toContain('is_workspace_owner')
    expect(body).not.toContain('EXISTS')
  })

  it('lets ONLY the Member move a pending row to approved or declined', () => {
    const using = usingClause('workspace_permission_requests_member_decide')
    const check = withCheckClause('workspace_permission_requests_member_decide')

    expect(using).toContain('member_user_id = (SELECT auth.uid())')
    expect(using).toContain("state = 'pending'")
    expect(check).toContain('member_user_id = (SELECT auth.uid())')
    expect(check).toContain("state IN ('approved', 'declined')")
    // Withdrawing is the asking workspace's act, not the Member's.
    expect(check).not.toContain('withdrawn')
  })

  it('[the property this table exists to protect] gives NO workspace member of any role a path to approved or declined', () => {
    for (const name of [
      'workspace_permission_requests_workspace_select',
      'workspace_permission_requests_workspace_insert',
      'workspace_permission_requests_workspace_withdraw',
    ]) {
      const body = policyBody(name)
      expect(body).not.toContain('approved')
      expect(body).not.toContain('declined')
    }
  })

  it('lets a workspace insert only a pending row', () => {
    const check = withCheckClause('workspace_permission_requests_workspace_insert')
    expect(check).toContain("state = 'pending'")
  })

  it('lets a workspace write exactly one state, and it is withdrawn', () => {
    const check = withCheckClause('workspace_permission_requests_workspace_withdraw')
    expect(check).toContain("state = 'withdrawn'")
    const using = usingClause('workspace_permission_requests_workspace_withdraw')
    expect(using).toContain("state = 'pending'")
  })

  it('restricts the workspace side to owners and admins — never ordinary members, contractors or guests', () => {
    for (const name of [
      'workspace_permission_requests_workspace_select',
      'workspace_permission_requests_workspace_insert',
      'workspace_permission_requests_workspace_withdraw',
    ]) {
      const body = policyBody(name)
      expect(body).toContain('(SELECT public.is_workspace_owner(workspace_id, auth.uid()))')
      expect(body).toContain(
        "(SELECT public.workspace_member_role(workspace_id, auth.uid())) = 'admin'"
      )
    }
  })

  it('wraps every helper call in a policy body as a scalar subselect (migration 192 recursion doctrine)', () => {
    for (const name of POLICY_NAMES) {
      const body = policyBody(name)
      const bareCalls = body.match(/(?<!\(SELECT )public\.(is_workspace_owner|workspace_member_role)\(/g)
      expect(bareCalls).toBeNull()
    }
  })

  it('contains no cross-table EXISTS in any policy body', () => {
    for (const name of POLICY_NAMES) {
      expect(policyBody(name)).not.toContain('EXISTS')
    }
  })

  it('scopes every policy to the authenticated role — anon reaches nothing here', () => {
    for (const name of POLICY_NAMES) {
      expect(policyBody(name)).toContain('TO authenticated')
    }
  })
})

// ─── HEADER DISCIPLINE ────────────────────────────────────────────────────
describe('migration 195 — header discipline', () => {
  it('restates the human-gated convention', () => {
    expect(commentProse).toContain('HUMAN-GATED')
    expect(commentProse).toContain('never runs `supabase db push`')
  })

  it('records the 195 renumbering decision and that 196-198 stay reserved', () => {
    expect(commentProse).toContain('R-19 REASSIGNS 195 to this phase')
    expect(commentProse).toContain('196 remains reserved for Phase 38.0.2')
  })

  it('records that it pushes with 190-194, never alone', () => {
    expect(commentProse).toContain('push TOGETHER WITH THIS FILE in ONE window')
  })

  it('names the two sibling proposal objects (R-08 evidence, R-12/D-05 relationship)', () => {
    expect(commentProse).toContain('R-08')
    expect(commentProse).toContain('D-05')
    expect(commentProse).toContain('PROPOSAL OBJECT')
  })
})
