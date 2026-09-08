import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { WORKSPACE_OWNER_FLOOR_MESSAGE } from '@/lib/workspaces/membership'

// ─── migration 197 — workspace structural integrity ────────────────────────
//
// LIMITATION, STATED FIRST, as __tests__/migration-196.test.ts does: a
// text-lock test proves what the SQL SAYS. It CANNOT prove any of these
// triggers behaves this way in a live Postgres, because this repo has no
// live-Postgres harness. That limitation is EXACTLY how the bug migration
// 196 fixed reached production — migration 190's suite was green, its
// function existed, the route called it correctly, and the sanctioned
// custody RPC still raised 42501 because a second, differently-named
// trigger also fired and refused it. The behavioural proof for migration
// 197 is plan 17's owner-run single-shot production harness (R-30), not
// this file. This file is the PRE-PUSH REVIEW EVIDENCE for migration 197,
// and nothing more.
//
// THIS SUITE IS EXTENDED BY PLANS 07 AND 09 as they append sections to the
// migration. A later plan ADDS describe blocks and reuses the harness
// below; it never rewrites these. The harness (migration/sql/prose/
// executable/normalizeWhitespace/functionBlock/tableBlock) is deliberately
// at module scope for that reason.

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/197_workspace_structural_integrity.sql'),
  'utf8'
)

// HARNESS 1 — `sql`: executable SQL only, with every `--` comment LINE
// stripped, so "the migration does not do X" assertions can neither be
// defeated nor falsely tripped by header prose. Every negative assertion in
// this file runs against `sql` or `executable`, never against `migration`.
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

// HARNESS 2 — collapse runs of whitespace, so assertions test what the SQL
// SAYS rather than where its 79-column line breaks happen to fall.
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// HARNESS 3 — `prose`: the header text, de-wrapped. `--` markers removed
// and whitespace collapsed, so a sentence that spans three wrapped lines
// still matches as one sentence.
const prose = normalizeWhitespace(
  migration
    .split('\n')
    .filter((line) => line.trimStart().startsWith('--'))
    .map((line) => line.trimStart().replace(/^--\s?/, ''))
    .join(' ')
)

// HARNESS 4 — `executable`: `sql` with every COMMENT ON statement removed.
// Those statements are DOCUMENTATION inside a string literal; they quote
// column names, function names and rule text verbatim, so leaving them in
// scope would let a COMMENT string satisfy (or falsely trip) a structural
// negative assertion. Migration 196's suite does this for its single
// COMMENT ON FUNCTION; migration 197 has six, so the strip is global.
const executable = sql.replace(/COMMENT ON [\s\S]*?';(\n|$)/g, '')

// HARNESS 5 — isolate one function body, from its CREATE OR REPLACE line to
// its closing `$$;`, so a body assertion cannot be satisfied by text
// belonging to a different function in the same file.
function functionBlock(header: string): string {
  const start = sql.indexOf(header)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n$$;', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

// HARNESS 6 — isolate one CREATE TABLE body, for the same reason.
function tableBlock(tableName: string): string {
  const header = `CREATE TABLE public.${tableName} (`
  const start = sql.indexOf(header)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n);', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

// ─── The ownership state literals — a CROSS-PLAN drift guard ───────────────
// lib/workspaces/ownership-transfer.ts is authored by plan 01, which runs
// CONCURRENTLY with plan 05 off the same base commit. A static
// `import { OWNERSHIP_TRANSFER_STATE_VALUES } from '@/lib/workspaces/
// ownership-transfer'` would therefore fail `npx tsc --noEmit` and fail
// this suite outright whenever plan 01's file is not yet in the tree —
// which is the state plan 05 executes in, by construction.
//
// So the literals are read from that module's SOURCE TEXT when it exists,
// and fall back to the canonical set the custody analogue already uses
// (RESEARCH §7.1: "same state set") when it does not. The drift guard is
// real either way: once plan 01 lands, a change to its array that is not
// mirrored in the SQL CHECK fails HERE. See the SUMMARY's cross-plan note.
const OWNERSHIP_TRANSFER_MODULE = path.join(
  process.cwd(),
  'lib/workspaces/ownership-transfer.ts'
)
const CANONICAL_OWNERSHIP_STATES = ['offered', 'accepted', 'declined', 'withdrawn']
const ownershipModuleExists = existsSync(OWNERSHIP_TRANSFER_MODULE)

function ownershipStateValues(): string[] {
  if (!ownershipModuleExists) return CANONICAL_OWNERSHIP_STATES
  const source = readFileSync(OWNERSHIP_TRANSFER_MODULE, 'utf8')
  const match = source.match(/OWNERSHIP_TRANSFER_STATE_VALUES[^=]*=\s*\[([\s\S]*?)\]/)
  if (!match) return CANONICAL_OWNERSHIP_STATES
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
}

const OWNERSHIP_STATES = ownershipStateValues()

// The four function headers this plan installs.
const NOMINATION_GUARD =
  'CREATE OR REPLACE FUNCTION public.guard_ownership_nomination_by_active_owner()'
const TRANSITION_GUARD =
  'CREATE OR REPLACE FUNCTION public.guard_ownership_transfer_transition()'
const OWNER_ROLE_GUARD =
  'CREATE OR REPLACE FUNCTION public.guard_workspace_owner_role_change()'
const OWNER_FLOOR =
  'CREATE OR REPLACE FUNCTION public.guard_workspace_never_zero_owners()'

// ─── HARNESS 7 (plan 07) — isolate ONE statement ───────────────────────────
// Slices `sql` from the first line of a statement to its terminating `;`, so
// an assertion about one trigger, policy or REVOKE cannot be satisfied by
// text belonging to the next one. functionBlock cannot do this job: these
// statements have no `$$` body to close on.
function statementBlock(header: string): string {
  const start = sql.indexOf(header)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf(';', start)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end + 1)
}

// ─── HARNESS 8 (plan 07) — the declared `RETURNS TABLE (...)` column list ──
// The security contract itself, sliced away from the body so an assertion
// about the contract cannot be satisfied (or tripped) by the body. Same
// slicing rule as __tests__/migration-194.test.ts's `returnColumnList`.
function returnColumnList(header: string): string {
  const block = functionBlock(header)
  const start = block.indexOf('RETURNS TABLE (')
  expect(start).toBeGreaterThanOrEqual(0)
  const end = block.indexOf('LANGUAGE sql', start)
  expect(end).toBeGreaterThan(start)
  return block.slice(start, end)
}

// The four function headers PLAN 07 installs (sections (e)-(h)), plus the
// migration 186 helper it narrows.
const APPEND_ONLY_GUARD =
  'CREATE OR REPLACE FUNCTION public.guard_workspace_audit_log_append_only()'
const PII_GUARD =
  'CREATE OR REPLACE FUNCTION public.guard_workspace_audit_log_no_restricted_pii()'
const AUDIT_ASSERTION =
  'CREATE OR REPLACE FUNCTION public.assert_workspace_change_is_audited()'
const AUDIT_PAGE = 'CREATE OR REPLACE FUNCTION public.workspace_audit_page('
const AUDIT_VISIBLE =
  'CREATE OR REPLACE FUNCTION public.workspace_audit_visible(p_row_id UUID, p_uid UUID)'

// The reviewed restricted-key set section (f) refuses at any depth. Iterated
// per key below so a key silently dropped from the SQL fails with a message
// naming WHICH key, not a bare array mismatch.
const RESTRICTED_PII_KEYS = [
  'email',
  'phone',
  'contact_email',
  'contact_phone',
  'address',
  'tax_id',
  'token',
  'token_hash',
  'ipi',
  'isni',
] as const

// The complete, reviewed return contract of public.workspace_audit_page.
// Asserted verbatim and IN ORDER, so adding a column is a deliberate,
// visible edit to this file — migration 194's rule, applied to the audit
// surface. Ten columns; `changes_redacted` is the boolean that lets a reader
// distinguish "withheld" from "genuinely empty" without a second query.
const DECLARED_AUDIT_RETURN_LIST =
  'RETURNS TABLE ( id UUID, actor_user_id UUID, subject_member_id UUID, ' +
  'action TEXT, permission_relied_on TEXT, target_type TEXT, target_id UUID, ' +
  'changes JSONB, changes_redacted BOOLEAN, created_at TIMESTAMPTZ )'

describe('migration 197 — workspace structural integrity (plans 05, 07, 09)', () => {
  // ══ Harness sanity — every negative assertion below depends on this ══
  describe('the stripped views are non-empty (no assertion passes vacuously)', () => {
    // If a future edit broke the comment-stripping and left `sql` or
    // `executable` empty, EVERY `not.toMatch` in this file would pass
    // silently and the text-lock would be worse than none. These three
    // assertions are what make the rest of the suite mean something.
    it('sql retains substantial executable content, and no comment lines', () => {
      expect(sql.length).toBeGreaterThan(4000)
      expect(sql.split('\n').filter((line) => line.trimStart().startsWith('--'))).toEqual([])
    })

    it('executable retains the DDL but none of the COMMENT ON statements', () => {
      expect(executable.length).toBeGreaterThan(3000)
      expect(executable).toContain('CREATE TABLE public.workspace_ownership_transfers')
      expect(executable).toContain('CREATE TABLE public.workspace_cohorts')
      expect(executable).not.toMatch(/COMMENT ON/)
    })

    it('prose retains the header, and functionBlock isolates one body', () => {
      expect(prose.length).toBeGreaterThan(4000)
      const block = functionBlock(OWNER_FLOOR)
      expect(block).toContain('v_remaining_owners')
      // Isolation is real: the floor body must not leak the owner-role
      // guard's text, or every (c)/(d) assertion could cross-satisfy.
      expect(block).not.toContain('guard_workspace_owner_role_change')
      expect(block).not.toContain("TG_OP = 'INSERT'")
    })
  })

  // ══ Header discipline ════════════════════════════════════════════════
  describe('header carries the phase SQL doctrine', () => {
    it('is HUMAN-GATED and names every database command an agent must not run', () => {
      expect(prose).toMatch(/HUMAN-GATED/)
      expect(prose).toMatch(/never runs `supabase db push`/)
      expect(prose).toMatch(/supabase db reset/)
      expect(prose).toMatch(/supabase migration up/)
      expect(prose).toMatch(/supabase db query/)
      expect(prose).toMatch(/No agent opened a database connection of any kind/)
    })

    it('states that the file is INCOMPLETE until plan 09 closes it', () => {
      expect(prose).toMatch(/DELIBERATELY INCOMPLETE UNTIL PLAN 09/)
      expect(prose).toMatch(/plans 07 and 09 APPEND/i)
    })

    it('states that 197 pushes WITH 198 and is never staged alone', () => {
      expect(prose).toMatch(/PUSHED WITH 198 — NEVER STAGED ALONE/)
      expect(prose).toMatch(/no legal path to change an owner row/i)
    })

    it('names the LIVE LEDGER as the authoritative source of the number', () => {
      expect(prose).toMatch(/LIVE LEDGER in `\.planning\/ROADMAP\.md`/)
      expect(prose).toMatch(/SUPERSEDES EVERY MIGRATION-FILE HEADER, INCLUDING THIS ONE/)
      expect(prose).toMatch(/SIX stale-migration-number incidents/)
    })

    it('allocates 197, 198, 199-200 and 201-202 to the right workstreams', () => {
      expect(prose).toMatch(/197 \(this file\)\s+Phase 38\.0\.2/)
      expect(prose).toMatch(/198\s+Phase 38\.0\.2/)
      expect(prose).toMatch(/199-200\s+Phase 38\.2/)
      expect(prose).toMatch(/201-202\s+The Playbook rich-content model/)
      expect(prose).toMatch(/DO NOT TAKE THESE/)
    })

    it('states plainly that SECURITY DEFINER does not bypass triggers', () => {
      expect(prose).toMatch(/IT DOES NOT BYPASS TRIGGERS/)
      expect(prose).toMatch(/139/)
      expect(prose).toMatch(/production outage/i)
      expect(prose).toMatch(/196/)
    })

    it('records the 190/196 exemption as ROLE-scoped and does not churn them', () => {
      expect(prose).toMatch(/ROLE-SCOPED EXEMPTION, RECORDED NOT CHURNED/)
      expect(prose).toMatch(/THOSE SENTENCES DESCRIBE AN INTENT THE CODE DOES NOT ENFORCE/)
      expect(prose).toMatch(/MIGRATIONS 190 AND 196 ARE NOT EDITED HERE/)
      expect(prose).toMatch(/transfer_vault_project_custody\(\)/)
    })

    it('states the promote-then-demote write order and the 42501 it prevents', () => {
      expect(prose).toMatch(/PROMOTE, THEN DEMOTE/)
      expect(prose).toMatch(/statement 1: promote the successor/)
      expect(prose).toMatch(/statement 2: demote the incumbent/)
      expect(prose).toMatch(/REVERSE order it counts zero and raises 42501/)
      expect(prose).toMatch(/NEVER issue a multi-row UPDATE against workspace_members/)
    })

    it('records that no backfill exists and restates the UUID default rule', () => {
      expect(prose).toMatch(/WHY NO BACKFILL EXISTS/)
      expect(prose).toMatch(/ZERO rows on production on 2026-09-07/)
      expect(prose).toMatch(/gen_random_uuid\(\), never uuid_generate_v4\(\)/)
    })

    it('records the R-21 Option A limitation rather than glossing it', () => {
      expect(prose).toMatch(/R-21 OPTION A/)
      expect(prose).toMatch(/PARTIAL satisfaction of R-05/)
      expect(prose).toMatch(/never accept a role parameter|never accept a role|never accepts a role/)
    })
  })

  // ══ (a) workspace_ownership_transfers ════════════════════════════════
  describe('(a) public.workspace_ownership_transfers — the nomination diary', () => {
    it('creates the table', () => {
      expect(sql).toContain('CREATE TABLE public.workspace_ownership_transfers')
    })

    it('mints its id with gen_random_uuid()', () => {
      expect(tableBlock('workspace_ownership_transfers')).toContain(
        'UUID PRIMARY KEY DEFAULT gen_random_uuid()'
      )
      expect(sql).not.toContain('uuid_generate_v4')
    })

    it('carries every literal from OWNERSHIP_TRANSFER_STATE_VALUES in the state CHECK, and no other', () => {
      const block = normalizeWhitespace(tableBlock('workspace_ownership_transfers'))
      const check = block.match(/CHECK \(state IN \(([^)]*)\)\)/)
      expect(check).not.toBeNull()
      const literals = [...(check ? check[1] : '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      expect(OWNERSHIP_STATES.length).toBeGreaterThanOrEqual(4)
      expect(literals.sort()).toEqual([...OWNERSHIP_STATES].sort())
    })

    it('reports whether the plan-01 module was present for that comparison', () => {
      // Not a failure either way — this records, in the suite output, which
      // side of the cross-plan race this run observed.
      expect(typeof ownershipModuleExists).toBe('boolean')
      expect(OWNERSHIP_STATES).toEqual(expect.arrayContaining(CANONICAL_OWNERSHIP_STATES))
    })

    it('forbids self-dealing with BOTH structural CHECKs', () => {
      const block = normalizeWhitespace(tableBlock('workspace_ownership_transfers'))
      expect(block).toContain('CHECK (from_user_id <> to_user_id)')
      expect(block).toContain('CHECK (offered_by <> to_user_id)')
    })

    it('scopes the one-live-nomination unique index to the workspace, WHERE state = offered', () => {
      const index = normalizeWhitespace(
        sql.slice(
          sql.indexOf('CREATE UNIQUE INDEX idx_workspace_ownership_transfers_one_live_offer'),
          sql.indexOf('CREATE INDEX idx_workspace_ownership_transfers_to_user_state')
        )
      )
      expect(index).toContain('ON public.workspace_ownership_transfers (workspace_id)')
      expect(index).toContain("WHERE state = 'offered'")
      // Custody's equivalent is per PROJECT; ownership is per WORKSPACE.
      expect(index).not.toContain('project_id')
    })

    it('indexes the successor read on (to_user_id, state)', () => {
      expect(sql).toContain(
        'CREATE INDEX idx_workspace_ownership_transfers_to_user_state\n  ON public.workspace_ownership_transfers (to_user_id, state);'
      )
    })

    it('enables row level security', () => {
      expect(sql).toContain(
        'ALTER TABLE public.workspace_ownership_transfers ENABLE ROW LEVEL SECURITY;'
      )
    })

    it('revokes INSERT, UPDATE and DELETE from authenticated and anon', () => {
      expect(sql).toContain(
        'REVOKE INSERT, UPDATE, DELETE ON public.workspace_ownership_transfers FROM authenticated, anon;'
      )
    })

    it('records that the REVOKE does not rely on any platform default', () => {
      expect(prose).toMatch(/2026-10-30/)
      expect(prose).toMatch(/does not rely on a default in EITHER direction|nothing in this file relies on a default in EITHER direction/)
    })

    it('wraps every helper call in the SELECT policy as a scalar subselect', () => {
      const policyRegion = sql.slice(
        sql.indexOf('CREATE POLICY "workspace_ownership_transfers_select"'),
        sql.indexOf('REVOKE INSERT, UPDATE, DELETE ON public.workspace_ownership_transfers')
      )
      expect(policyRegion.length).toBeGreaterThan(0)
      const pattern = /public\.[a-z_]+\s*\(/g
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
      // And no bare cross-table EXISTS inlined in the policy body.
      expect(policyRegion).not.toMatch(/EXISTS\s*\(\s*SELECT/i)
    })

    it('stamps updated_at through the shared update_updated_at() trigger', () => {
      expect(sql).toContain(
        'CREATE TRIGGER workspace_ownership_transfers_updated_at\n  BEFORE UPDATE ON public.workspace_ownership_transfers\n  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();'
      )
    })
  })

  // ══ The nomination guard ═════════════════════════════════════════════
  describe('guard_ownership_nomination_by_active_owner — BEFORE INSERT', () => {
    it('is plain plpgsql with an empty search path, and is NOT SECURITY DEFINER', () => {
      const block = normalizeWhitespace(functionBlock(NOMINATION_GUARD))
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql')
      expect(block).toContain("SET search_path = ''")
      expect(block).not.toContain('SECURITY DEFINER')
    })

    it('is attached BEFORE INSERT on the diary, for each row', () => {
      expect(sql).toContain(
        'CREATE TRIGGER guard_ownership_nomination_by_active_owner\n  BEFORE INSERT ON public.workspace_ownership_transfers\n  FOR EACH ROW EXECUTE FUNCTION public.guard_ownership_nomination_by_active_owner();'
      )
    })

    it('requires offered_by to equal from_user_id', () => {
      expect(normalizeWhitespace(functionBlock(NOMINATION_GUARD))).toContain(
        'IF NEW.offered_by <> NEW.from_user_id THEN'
      )
    })

    it('requires the nominator to hold an ACTIVE, UNEXPIRED owner seat', () => {
      const block = normalizeWhitespace(functionBlock(NOMINATION_GUARD))
      expect(block).toContain('m.user_id = NEW.from_user_id')
      expect(block).toContain("m.status = 'active'")
      expect(block).toContain('(m.expires_at IS NULL OR m.expires_at > now())')
      expect(block).toContain("IF v_nominator_role IS DISTINCT FROM 'owner' THEN")
    })

    it('requires the successor to hold an active, unexpired, non-owner seat', () => {
      const block = normalizeWhitespace(functionBlock(NOMINATION_GUARD))
      expect(block).toContain('m.user_id = NEW.to_user_id')
      expect(block).toContain('IF v_successor_role IS NULL THEN')
      expect(block).toContain("IF v_successor_role = 'owner' THEN")
    })

    it('raises insufficient_privilege on every refusal', () => {
      const block = functionBlock(NOMINATION_GUARD)
      const raises = block.match(/RAISE EXCEPTION/g) ?? []
      const errcodes = block.match(/USING ERRCODE = 'insufficient_privilege'/g) ?? []
      expect(raises.length).toBeGreaterThanOrEqual(4)
      expect(errcodes).toHaveLength(raises.length)
    })

    it('revokes EXECUTE from PUBLIC, anon and authenticated', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_ownership_nomination_by_active_owner()\n  FROM PUBLIC, anon, authenticated;'
      )
    })
  })

  // ══ The transition guard ═════════════════════════════════════════════
  describe('guard_ownership_transfer_transition — BEFORE UPDATE, terminal states', () => {
    it('refuses any UPDATE of a row whose OLD.state is not offered', () => {
      expect(normalizeWhitespace(functionBlock(TRANSITION_GUARD))).toContain(
        "IF OLD.state <> 'offered' THEN"
      )
    })

    it('constrains NEW.state to exactly the three legal exits', () => {
      const block = normalizeWhitespace(functionBlock(TRANSITION_GUARD))
      const exits = block.match(/NEW\.state NOT IN \(([^)]*)\)/)
      expect(exits).not.toBeNull()
      const literals = [...(exits ? exits[1] : '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      expect(literals.sort()).toEqual(['accepted', 'declined', 'withdrawn'])
      // The three exits plus 'offered' must be the whole state set.
      expect([...literals, 'offered'].sort()).toEqual([...OWNERSHIP_STATES].sort())
    })

    it('makes the four identity columns immutable', () => {
      const block = normalizeWhitespace(functionBlock(TRANSITION_GUARD))
      expect(block).toContain('NEW.workspace_id <> OLD.workspace_id')
      expect(block).toContain('NEW.from_user_id <> OLD.from_user_id')
      expect(block).toContain('NEW.to_user_id <> OLD.to_user_id')
      expect(block).toContain('NEW.offered_by <> OLD.offered_by')
    })

    it('is attached BEFORE UPDATE and revoked from every client role', () => {
      expect(sql).toContain(
        'CREATE TRIGGER guard_ownership_transfer_transition\n  BEFORE UPDATE ON public.workspace_ownership_transfers\n  FOR EACH ROW EXECUTE FUNCTION public.guard_ownership_transfer_transition();'
      )
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_ownership_transfer_transition()\n  FROM PUBLIC, anon, authenticated;'
      )
    })

    it('records that workspace_custody_transfers still lacks this guard', () => {
      expect(prose).toMatch(/workspace_custody_transfers has NO such guard today/)
      expect(prose).toMatch(/`\.eq\('state', 'offered'\)` CAS/)
      expect(prose).toMatch(/Plan 11 adds the custody equivalent/)
    })
  })

  // ══ (b) workspace_cohorts ════════════════════════════════════════════
  describe('(b) public.workspace_cohorts — the D-55 pilot bound', () => {
    it('creates the table with exactly ONE subject axis', () => {
      expect(sql).toContain('CREATE TABLE public.workspace_cohorts')
      const block = tableBlock('workspace_cohorts')
      expect(block).toContain('account_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE')
      // No second axis: neither Song Passport's work_id nor a workspace_id,
      // which is meaningless for the CREATION gate.
      expect(block).not.toMatch(/\bwork_id\b/)
      expect(block).not.toMatch(/\bworkspace_id\b/)
    })

    it('carries the three stage literals', () => {
      const block = normalizeWhitespace(tableBlock('workspace_cohorts'))
      const check = block.match(/CHECK \(stage IN \(([^)]*)\)\)/)
      expect(check).not.toBeNull()
      const literals = [...(check ? check[1] : '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
      expect(literals.sort()).toEqual(['general', 'internal', 'pilot'])
      expect(block).toContain("stage TEXT NOT NULL DEFAULT 'pilot'")
    })

    it('carries enabled, flags, and the ends_at > starts_at CHECK', () => {
      const block = normalizeWhitespace(tableBlock('workspace_cohorts'))
      expect(block).toContain('enabled BOOLEAN NOT NULL DEFAULT TRUE')
      expect(block).toContain("flags JSONB NOT NULL DEFAULT '{}'::JSONB")
      expect(block).toContain('starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW()')
      expect(block).toContain('CHECK (ends_at IS NULL OR ends_at > starts_at)')
    })

    it('requires a created_by, so seeding the cohort is an auditable act', () => {
      expect(normalizeWhitespace(tableBlock('workspace_cohorts'))).toContain(
        'created_by UUID NOT NULL REFERENCES auth.users'
      )
    })

    it('enforces one window per account per stage', () => {
      expect(sql).toContain(
        'CREATE UNIQUE INDEX idx_workspace_cohorts_account_stage\n  ON public.workspace_cohorts (account_user_id, stage);'
      )
    })

    it('is service-role-only: RLS enabled, REVOKE ALL, and NO SELECT policy', () => {
      expect(sql).toContain('ALTER TABLE public.workspace_cohorts ENABLE ROW LEVEL SECURITY;')
      expect(sql).toContain('REVOKE ALL ON public.workspace_cohorts FROM authenticated, anon;')
      // With RLS on and zero policies the table denies all
      // authenticated/anon access by construction.
      expect(sql).not.toMatch(/CREATE POLICY[^;]*workspace_cohorts/i)
    })

    it('stamps updated_at through the shared trigger', () => {
      expect(sql).toContain(
        'CREATE TRIGGER workspace_cohorts_updated_at\n  BEFORE UPDATE ON public.workspace_cohorts\n  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();'
      )
    })

    it('records R-29 and writes down the exact seeding statement', () => {
      expect(prose).toMatch(/THERE IS NO COHORT ADMIN SURFACE THIS PHASE/)
      expect(prose).toContain(
        'INSERT INTO public.workspace_cohorts (account_user_id, stage, created_by)'
      )
      expect(prose).toMatch(/set enabled = FALSE rather than deleting the row/)
      // The seeding statement is a COMMENT, never an executable INSERT.
      expect(executable).not.toMatch(/INSERT INTO/i)
    })
  })

  // ══ (c) guard_workspace_owner_role_change — WSR-07 ═══════════════════
  describe('(c) guard_workspace_owner_role_change — the trigger WSR-07 needs', () => {
    it('is created, plain plpgsql, empty search path, NOT SECURITY DEFINER', () => {
      const block = normalizeWhitespace(functionBlock(OWNER_ROLE_GUARD))
      expect(sql).toContain(OWNER_ROLE_GUARD)
      expect(block).toContain('RETURNS TRIGGER')
      expect(block).toContain('LANGUAGE plpgsql')
      expect(block).toContain("SET search_path = ''")
      // Elevating it would make the current_user test always take the
      // exemption branch and refuse nothing, ever.
      expect(block).not.toContain('SECURITY DEFINER')
    })

    it('exempts exactly one role literal, postgres — not a role allow-list', () => {
      const block = functionBlock(OWNER_ROLE_GUARD)
      const match = block.match(/current_user\s+IN\s*\(([^)]*)\)/)
      expect(match).not.toBeNull()
      const entries = (match ? match[1] : '').split(',').map((entry) => entry.trim())
      expect(entries).toEqual(["'postgres'"])
      expect(block).not.toMatch(/current_user[^;]*'service_role'/)
      expect(block).not.toMatch(/current_user[^;]*'authenticated'/)
      expect(block).not.toMatch(/current_user[^;]*'anon'/)
    })

    it('has an INSERT branch that refuses a non-definer owner INSERT', () => {
      const block = normalizeWhitespace(functionBlock(OWNER_ROLE_GUARD))
      expect(block).toContain("IF TG_OP = 'INSERT' THEN")
      expect(block).toContain("IF NEW.role = 'owner' THEN")
      expect(block).toContain('an owner seat is created only by the sanctioned workspace-creation RPC')
    })

    it('refuses promotion to owner', () => {
      expect(normalizeWhitespace(functionBlock(OWNER_ROLE_GUARD))).toContain(
        "IF TG_OP = 'UPDATE' AND OLD.role <> 'owner' AND NEW.role = 'owner' THEN"
      )
    })

    it('refuses any change to an existing owner row', () => {
      expect(normalizeWhitespace(functionBlock(OWNER_ROLE_GUARD))).toContain(
        "IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND (NEW.role, NEW.status) IS DISTINCT FROM (OLD.role, OLD.status) THEN"
      )
    })

    it('raises insufficient_privilege at least twice', () => {
      const block = functionBlock(OWNER_ROLE_GUARD)
      const errcodes = block.match(/USING ERRCODE = 'insufficient_privilege'/g) ?? []
      expect(errcodes.length).toBeGreaterThanOrEqual(3)
    })

    it('is attached BEFORE INSERT OR UPDATE on workspace_members, for each row', () => {
      expect(sql).toContain('BEFORE INSERT OR UPDATE ON public.workspace_members')
      expect(sql).toContain(
        'CREATE TRIGGER guard_workspace_member_owner_role_change\n  BEFORE INSERT OR UPDATE ON public.workspace_members\n  FOR EACH ROW EXECUTE FUNCTION public.guard_workspace_owner_role_change();'
      )
    })

    it('justifies the trigger name alphabetically against the owner floor', () => {
      expect(prose).toMatch(/sorts BEFORE 'guard_workspace_never_zero_owners' \('m' < 'n'\)/)
      expect(prose).toMatch(/BOTH GUARDS MUST ADMIT A STATEMENT FOR IT TO PROCEED/)
      expect(prose).toMatch(/workspace_members_updated_at, sorts last/)
    })

    it('documents itself as the DB twin of canManageOwners, with the role-scoped caveat', () => {
      const comment = sql.slice(
        sql.indexOf('COMMENT ON FUNCTION public.guard_workspace_owner_role_change()')
      )
      expect(comment).toContain('canManageOwners in lib/workspaces/membership.ts')
      expect(comment).toContain('THE EXEMPTION IS ROLE-SCOPED, NOT FUNCTION-SCOPED')
      expect(comment).toContain(
        'guard_workspace_never_zero_owners PROVIDES ZERO PROTECTION AGAINST UNAUTHORIZED PROMOTION'
      )
    })

    it('revokes EXECUTE from PUBLIC, anon and authenticated', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_workspace_owner_role_change()\n  FROM PUBLIC, anon, authenticated;'
      )
    })
  })

  // ══ (d) guard_workspace_never_zero_owners v2 — R-28 ══════════════════
  describe('(d) guard_workspace_never_zero_owners — replaced, now honours expires_at', () => {
    it('is replaced in place, keeping SECURITY DEFINER and the empty search path', () => {
      const block = normalizeWhitespace(functionBlock(OWNER_FLOOR))
      expect(sql).toContain(OWNER_FLOOR)
      expect(block).toContain('LANGUAGE plpgsql SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('BYTE-LOCKS the raise sentence to WORKSPACE_OWNER_FLOOR_MESSAGE', () => {
      // The shared contract across the TS and SQL layers. Phase 38 already
      // lost time to exactly this mismatch; migration 182's suite asserts
      // the same equality from the other end.
      expect(functionBlock(OWNER_FLOOR)).toContain(
        `RAISE EXCEPTION '${WORKSPACE_OWNER_FLOOR_MESSAGE}'`
      )
      expect(WORKSPACE_OWNER_FLOOR_MESSAGE).toBe(
        'A workspace must always have at least one active owner.'
      )
    })

    it('compares expires_at against now() at least three times in the body', () => {
      const comparisons =
        functionBlock(OWNER_FLOOR).match(/expires_at\s*(IS NULL|>|<=)\s*(now\(\)|OR)?/g) ?? []
      expect(comparisons.length).toBeGreaterThanOrEqual(3)
      const againstNow = functionBlock(OWNER_FLOOR).match(/expires_at\s*(>|<=)\s*now\(\)/g) ?? []
      expect(againstNow.length).toBeGreaterThanOrEqual(3)
    })

    it('excludes an already-expired owner from qualifying on DELETE and UPDATE', () => {
      const block = normalizeWhitespace(functionBlock(OWNER_FLOOR))
      const oldTests = block.match(/\(OLD\.expires_at IS NULL OR OLD\.expires_at > now\(\)\)/g) ?? []
      expect(oldTests.length).toBeGreaterThanOrEqual(2)
    })

    it('fires when an UPDATE pushes the last owner expires_at into the past', () => {
      expect(normalizeWhitespace(functionBlock(OWNER_FLOOR))).toContain(
        '(NEW.expires_at IS NOT NULL AND NEW.expires_at <= now())'
      )
    })

    it('counts only live owners in the remaining-owners query', () => {
      const block = normalizeWhitespace(functionBlock(OWNER_FLOOR))
      expect(block).toContain('SELECT COUNT(*) INTO v_remaining_owners')
      expect(block).toContain("role = 'owner'")
      expect(block).toContain("status = 'active'")
      expect(block).toContain('(expires_at IS NULL OR expires_at > now())')
      expect(block).toContain('id <> OLD.id')
    })

    it('does NOT drop and recreate migration 182 trigger', () => {
      // CREATE OR REPLACE FUNCTION is enough; 182's CREATE TRIGGER keeps
      // pointing at this same function. Dropping it would open a window in
      // which the floor is not enforced.
      expect(sql).not.toMatch(/DROP TRIGGER[^;]*guard_workspace_never_zero_owners/i)
      expect(sql).not.toMatch(/CREATE TRIGGER guard_workspace_never_zero_owners/)
      expect(prose).toMatch(/THE TRIGGER IS NOT DROPPED AND NOT RECREATED, DELIBERATELY/)
    })

    it('restates the trigger-internal REVOKE, since CREATE OR REPLACE preserves grants', () => {
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.guard_workspace_never_zero_owners() FROM PUBLIC, anon, authenticated;'
      )
    })

    it('updates its COMMENT to name R-28 and the new expires_at semantics', () => {
      const comment = sql.slice(
        sql.indexOf('COMMENT ON FUNCTION public.guard_workspace_never_zero_owners()')
      )
      expect(comment).toContain('R-28')
      expect(comment).toContain('honours expires_at on BOTH sides of its test')
      expect(comment).toContain('THIS FUNCTION DOES NOT AND NEVER DID GUARD PROMOTION')
    })
  })

  // ══ Negative structural guarantees — all against sql / executable ════
  // ══ (e) The audit lockdown — S1 / WSR-26 ═════════════════════════════
  describe('(e) the audit lockdown — three layers, each with its real scope', () => {
    it('layer 1 revokes all THREE privileges and names service_role explicitly', () => {
      const revoke = normalizeWhitespace(
        statementBlock('REVOKE UPDATE, DELETE, TRUNCATE ON public.workspace_audit_log')
      )
      // The three privileges check A10 found service_role holding. TRUNCATE
      // is the one migration 182's revoke did not even name.
      for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE']) {
        expect(revoke).toContain(privilege)
      }
      // And all four roles. service_role is the whole point: BYPASSRLS
      // confers no table privileges, so this statement — not any policy —
      // is what binds it, and a REVOKE from PUBLIC alone provably did not.
      for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
        expect(revoke).toContain(role)
      }
    })

    it('deliberately retains SELECT and INSERT — neither is revoked on the audit table', () => {
      // Revoking INSERT would silence the trail; revoking SELECT would
      // delete D-50's both-sides read. Asserted against the comment-stripped
      // view so the header prose explaining the choice cannot satisfy it.
      expect(sql).not.toMatch(/REVOKE[^;]*\bSELECT\b[^;]*workspace_audit_log/i)
      expect(sql).not.toMatch(/REVOKE[^;]*\bINSERT\b[^;]*workspace_audit_log/i)
    })

    it('the append-only guard refuses UNCONDITIONALLY — no branch, no exemption', () => {
      const block = functionBlock(APPEND_ONLY_GUARD)
      expect(block).toContain("USING ERRCODE = 'insufficient_privilege'")
      expect((block.match(/RAISE EXCEPTION/g) ?? [])).toHaveLength(1)
      // No conditional of any kind. An exemption here would admit every
      // SECURITY DEFINER function this phase adds — the role-scoped
      // exemption trap — and nothing legitimately rewrites an audit row.
      expect(block).not.toMatch(/\bIF\b/)
      expect(block).not.toMatch(/current_user/)
      expect(block).not.toMatch(/TG_OP/)
      expect(block).not.toMatch(/RETURN NEW/)
      expect(block).toContain("SET search_path = ''")
    })

    it('installs BOTH triggers, and the TRUNCATE one is at STATEMENT level', () => {
      const rowTrigger = normalizeWhitespace(
        statementBlock('CREATE TRIGGER guard_workspace_audit_log_no_row_change')
      )
      expect(rowTrigger).toContain('BEFORE UPDATE OR DELETE ON public.workspace_audit_log')
      expect(rowTrigger).toContain('FOR EACH ROW')
      expect(rowTrigger).not.toContain('FOR EACH STATEMENT')

      const truncateTrigger = normalizeWhitespace(
        statementBlock('CREATE TRIGGER guard_workspace_audit_log_no_truncate')
      )
      expect(truncateTrigger).toContain('BEFORE TRUNCATE ON public.workspace_audit_log')
      // THE ASSERTION THAT MATTERS. A row-level trigger does not fire for
      // TRUNCATE — there are no rows to fire per — so if these two levels
      // were ever swapped, TRUNCATE would walk straight past the guard and
      // the whole lockdown would be silently reopened.
      expect(truncateTrigger).toContain('FOR EACH STATEMENT')
      expect(truncateTrigger).not.toContain('FOR EACH ROW')

      // Both point at the same unconditional function.
      for (const trigger of [rowTrigger, truncateTrigger]) {
        expect(trigger).toContain(
          'EXECUTE FUNCTION public.guard_workspace_audit_log_append_only()'
        )
      }
    })

    it('layer 3 is RESTRICTIVE, scoped to authenticated and anon only', () => {
      const restrictive = [
        ...sql.matchAll(/CREATE POLICY "([a-z_]+)" ON public\.workspace_audit_log\s+AS RESTRICTIVE\s+FOR (\w+) TO ([^\n]+)/g),
      ]
      expect(restrictive.map((entry) => entry[1]).sort()).toEqual([
        'workspace_audit_log_no_delete',
        'workspace_audit_log_no_update',
      ])
      for (const entry of restrictive) {
        expect(normalizeWhitespace(entry[3])).toBe('authenticated, anon')
      }
    })

    it('no RESTRICTIVE policy on the audit table is FOR ALL — that would kill SELECT', () => {
      // RESEARCH §6.3 and the plan both wrote a single
      // `AS RESTRICTIVE FOR ALL ... USING (false)`. A restrictive policy is
      // AND-ed with the permissive ones for EVERY command it covers, and
      // FOR ALL covers SELECT — so that one policy would have made
      // workspace_audit_log unreadable to `authenticated`, silently deleting
      // D-50's both-sides read and section (h)'s own recreated policy. This
      // assertion is the lock that stops anyone "restoring" it.
      expect(sql).not.toMatch(/AS RESTRICTIVE\s+FOR ALL/)
      const commands = [...sql.matchAll(/AS RESTRICTIVE\s+FOR (\w+)/g)].map((m) => m[1])
      expect(commands.sort()).toEqual(['DELETE', 'UPDATE'])
    })

    it('states the limit honestly: append-only to every application role, not immutable', () => {
      expect(prose).toMatch(/"append-only to every application role", NOT "immutable"/)
      // And names the three ways the database owner can still get around it,
      // so the claim cannot later be read as stronger than it is.
      expect(prose).toMatch(/None of them constrains the database owner/)
      expect(prose).toMatch(/session_replication_role/)
      expect(prose).toMatch(/DISABLE\s+TRIGGER/)
    })

    it('names check A10 and the ALTER DEFAULT PRIVILEGES bootstrap as the root cause', () => {
      expect(prose).toMatch(/check\s+A10/)
      expect(prose).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES/)
      expect(prose).toMatch(/a REVOKE from PUBLIC never touches a direct grant/)
    })

    it('says plainly that the policy half of S1 is not the enforcement', () => {
      expect(prose).toMatch(/THE POLICY HALF IS INERT AGAINST service_role/)
      expect(prose).toMatch(/BYPASSRLS/)
    })
  })

  // ══ (f) The restricted-PII write guard — R-13 / WSR-19 ═══════════════
  describe('(f) the restricted-PII write guard', () => {
    it('recurses with jsonb_path_exists and NEVER uses the top-level-only ?| operator', () => {
      const block = functionBlock(PII_GUARD)
      expect(block).toContain('jsonb_path_exists')
      // `changes ?| ARRAY[...]` inspects TOP-LEVEL KEYS ONLY, and this
      // codebase already writes nested before/after diffs that would walk
      // straight past it (the invitation-revoked call site is one).
      expect(block).not.toContain('?|')
      // The recursive member accessor: `$.**."key"` matches at every depth
      // INCLUDING depth zero, so a top-level key is still caught.
      expect(block).toContain('$.**."')
      expect(block).toContain('::jsonpath')
    })

    it.each(RESTRICTED_PII_KEYS)('covers the restricted key %s', (key) => {
      const block = functionBlock(PII_GUARD)
      const keyList = block.slice(block.indexOf('FOREACH'), block.indexOf('] LOOP'))
      expect(keyList.length).toBeGreaterThan(0)
      // Named per key, so a key silently dropped from the SQL fails with a
      // message that says WHICH one rather than a bare array mismatch.
      expect(keyList).toContain(`'${key}'`)
    })

    it('covers exactly the reviewed key set — no more, no fewer', () => {
      const block = functionBlock(PII_GUARD)
      const keyList = block.slice(block.indexOf('FOREACH'), block.indexOf('] LOOP'))
      const declared = [...keyList.matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
      expect(declared.sort()).toEqual([...RESTRICTED_PII_KEYS].sort())
    })

    it('raises check_violation and fires BEFORE INSERT, per row', () => {
      const block = functionBlock(PII_GUARD)
      expect(block).toContain("USING ERRCODE = 'check_violation'")
      const trigger = normalizeWhitespace(
        statementBlock('CREATE TRIGGER guard_workspace_audit_log_no_restricted_pii')
      )
      expect(trigger).toContain('BEFORE INSERT ON public.workspace_audit_log')
      expect(trigger).toContain('FOR EACH ROW')
    })

    it('states the two things the guard does NOT claim', () => {
      // It is a key-name guard, not a content classifier...
      expect(prose).toMatch(/KEY-NAME guard, not a content classifier/)
      // ...and its cost on the write path has never been measured, because
      // the table is empty and no agent opened a database connection.
      expect(prose).toMatch(/HAS NOT BEEN MEASURED/)
      expect(prose).toMatch(/never to drop the guard/)
    })

    it('records where the invited address legitimately lives instead', () => {
      expect(prose).toMatch(/workspace_invitations\.email/)
      expect(prose).toMatch(/owner\/admin\s*only/)
      expect(prose).toMatch(/should carry the role and nothing else/)
    })
  })

  // ══ (g) The deferred audit-assertion triggers — R-06 / WSR-13 ════════
  describe('(g) the deferred audit-assertion triggers', () => {
    it('installs exactly four constraint triggers, all deferred and per-row', () => {
      const statements = [...sql.matchAll(/CREATE CONSTRAINT TRIGGER[\s\S]*?;/g)].map((m) =>
        normalizeWhitespace(m[0])
      )
      expect(statements).toHaveLength(4)
      for (const statement of statements) {
        // Deferred, so the check runs at COMMIT — after both the mutation
        // and the audit row exist, whichever order the RPC wrote them in.
        expect(statement).toContain('DEFERRABLE INITIALLY DEFERRED')
        expect(statement).toContain('FOR EACH ROW')
        expect(statement).toContain(
          'EXECUTE FUNCTION public.assert_workspace_change_is_audited()'
        )
      }
    })

    it('scopes each trigger to the columns that define a consequential change', () => {
      const pairs = [...sql.matchAll(/AFTER UPDATE OF ([a-z, ]+) ON public\.([a-z_]+)/g)].map(
        (entry) => `${entry[2]}(${normalizeWhitespace(entry[1])})`
      )
      // Asserted as a SET, so an omitted table fails by name rather than by
      // a count that a fifth trigger elsewhere could accidentally restore.
      expect(pairs.sort()).toEqual([
        'workspace_custody_transfers(state)',
        'workspace_invitations(status)',
        'workspace_members(role, status)',
        'workspace_roster_relationships(state)',
      ])
    })

    it('matches an audit row on BOTH target_id and created_at', () => {
      const block = functionBlock(AUDIT_ASSERTION)
      expect(block).toContain('FROM public.workspace_audit_log l')
      expect(block).toContain('l.target_id = NEW.id')
      // NOW() is transaction_timestamp() — one value per transaction — so
      // with target_id this is an effectively exact "audited in THIS
      // transaction" test. Dropping either half makes it meaningless.
      expect(block).toContain('l.created_at = now()')
      expect(block).toContain("USING ERRCODE = 'integrity_constraint_violation'")
    })

    it('records the contract on writers, the known offender, and the fallback', () => {
      expect(prose).toMatch(/MUTATED ROW'S OWN id/)
      expect(prose).toMatch(/invitations\/accept\/route\.ts/)
      expect(prose).toMatch(/targetId: pendingSeat\?\.id \?\? null/)
      // And it does not pretend R-06 alone bought this.
      expect(prose).toMatch(/IT DOES NOT MAKE THE AUDIT NON-BYPASSABLE/)
      expect(prose).toMatch(/It is a fallback, not the design/)
    })

    it('states the MEDIUM confidence and points at plan 17 as the proof', () => {
      expect(prose).toMatch(/never been observed on a running\s+database/)
      expect(prose).toMatch(/Plan 17's owner-run single-shot harness is the proof/)
    })
  })

  // ══ (h) The redacted audit read — R-13 / R-27 / WSR-19 ═══════════════
  describe('(h) the redacted audit read', () => {
    it('declares the exact ten-column return contract, in order', () => {
      expect(normalizeWhitespace(returnColumnList(AUDIT_PAGE))).toBe(DECLARED_AUDIT_RETURN_LIST)
    })

    it('binds p_uid to the caller and clamps the page to 200', () => {
      const block = functionBlock(AUDIT_PAGE)
      // The binding 38.0.1 Part B check B9 proved bites. The parameter is
      // explicit but can only ever name the caller.
      expect(block).toContain('AND p_uid = (SELECT auth.uid())')
      expect(block).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)')
      expect(block).toContain('OFFSET GREATEST(COALESCE(p_offset, 0), 0)')
      expect(block).toContain('LANGUAGE sql STABLE SECURITY DEFINER')
      expect(block).toContain("SET search_path = ''")
    })

    it('reads the D-56 kill switch and requires a live seat', () => {
      const block = functionBlock(AUDIT_PAGE)
      expect(block).toContain('AND public.workspace_access_enabled()')
      expect(block).toContain('AND public.workspace_member_role(l.workspace_id, p_uid) IS NOT NULL')
    })

    it('redacts by ALLOWLIST — the empty object, never a key subtraction', () => {
      const block = functionBlock(AUDIT_PAGE)
      expect(block).toContain("CASE WHEN v.full_view THEN l.changes ELSE '{}'::JSONB END")
      // A subtraction leaks whatever a future writer adds under a key nobody
      // thought to subtract — the same failure mode section (f) exists for.
      expect(block).not.toMatch(/changes\s*-\s*(ARRAY|\[|')/)
      expect(block).not.toMatch(/SELECT \*/)
      // And the boolean, so a reader can tell withheld from genuinely empty.
      expect(block).toContain('NOT v.full_view')
      expect(block).toContain('COALESCE(')
    })

    it('grants EXECUTE to authenticated, not service_role — unlike migration 198s family', () => {
      // Migration 198's WRITE RPCs are service-role-only (migration 123's
      // posture) because no session client may reach them. THIS is a
      // client-invoked READ, like migrations 193 and 194, so `authenticated`
      // keeps EXECUTE. The two postures are different on purpose.
      expect(sql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.workspace_audit_page(uuid, uuid, int, int)\n  FROM PUBLIC, anon, authenticated;'
      )
      expect(sql).toContain(
        'GRANT  EXECUTE ON FUNCTION public.workspace_audit_page(uuid, uuid, int, int)\n  TO authenticated;'
      )
      expect(sql).not.toMatch(/GRANT[^;]*workspace_audit_page[^;]*service_role/)
    })

    it('narrows workspace_audit_log_select: the broad live-seat branch is gone', () => {
      expect(sql).toContain(
        'DROP POLICY IF EXISTS "workspace_audit_log_select" ON public.workspace_audit_log;'
      )
      const policy = normalizeWhitespace(
        statementBlock('CREATE POLICY "workspace_audit_log_select"')
      )
      expect(policy).toContain('actor_user_id = (SELECT auth.uid())')
      expect(policy).toContain('subject_member_id = (SELECT auth.uid())')
      expect(policy).toContain(
        "(SELECT public.workspace_member_role(workspace_id, auth.uid())) IN ('owner', 'admin')"
      )
      // Migration 186's third branch — anyone with a live seat — is what put
      // a raw `changes` object in front of every member. It must be gone.
      expect(policy).not.toMatch(/IS NOT NULL/)
      expect(policy).not.toContain('workspace_audit_visible')
    })

    it('wraps every helper call in the recreated policy as a scalar subselect', () => {
      const policy = statementBlock('CREATE POLICY "workspace_audit_log_select"')
      const pattern = /public\.[a-z_]+\s*\(/g
      const unwrapped: string[] = []
      let match: RegExpExecArray | null
      while ((match = pattern.exec(policy)) !== null) {
        const preceding = policy.slice(Math.max(0, match.index - 8), match.index)
        if (!preceding.endsWith('(SELECT ')) {
          unwrapped.push(
            policy.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' ')
          )
        }
      }
      expect(unwrapped).toEqual([])
      // The sample is not empty — there IS a helper call to wrap.
      expect(policy).toMatch(/public\.workspace_member_role\s*\(/)
    })

    it('narrows the migration 186 helper in lockstep with the policy', () => {
      const block = functionBlock(AUDIT_VISIBLE)
      expect(block).toContain(
        "public.workspace_member_role(l.workspace_id, p_uid) IN ('owner', 'admin')"
      )
      expect(block).not.toMatch(/workspace_member_role\([^)]*\) IS NOT NULL/)
    })

    it('states the D-50 tension and that R-27 confirmed it, rather than glossing it', () => {
      expect(prose).toMatch(/THE D-50 TENSION, STATED RATHER THAN GLOSSED/)
      expect(prose).toMatch(/R-27 confirmed this is acceptable/)
      expect(prose).toMatch(/NO APP SURFACE READS workspace_audit_log TODAY/)
    })
  })

  describe('negative structural guarantees', () => {
    it('drops and disables no trigger, and never touches session_replication_role', () => {
      expect(executable).not.toMatch(/DROP TRIGGER/i)
      expect(executable).not.toMatch(/DISABLE TRIGGER/i)
      expect(executable).not.toMatch(/ALTER TRIGGER/i)
      expect(executable).not.toMatch(/session_replication_role/i)
    })

    it('never disables row level security', () => {
      expect(executable).not.toMatch(/DISABLE ROW LEVEL SECURITY/i)
    })

    it('touches nothing in the D-52 legacy surface', () => {
      expect(executable).not.toMatch(/handle_new_user/)
      expect(executable).not.toMatch(/member_type/)
      expect(executable).not.toMatch(/industry_roles/)
      expect(executable).not.toMatch(/capability_grants/)
      expect(executable).not.toMatch(/project_members/)
    })

    it('does not edit migration 190 or 196 guards, or the custody transfer function', () => {
      expect(executable).not.toMatch(/guard_owner_immutable/)
      expect(executable).not.toMatch(/guard_vault_projects_user_id_immutable/)
      expect(executable).not.toMatch(
        /CREATE OR REPLACE FUNCTION public\.transfer_vault_project_custody/
      )
    })

    it('issues no DML of any kind — this migration moves no data', () => {
      expect(executable).not.toMatch(/INSERT INTO/i)
      expect(executable).not.toMatch(/DELETE FROM/i)
      expect(executable).not.toMatch(/UPDATE public\./i)
    })

    // NARROWED BY PLAN 07 — the one plan-05 assertion this plan changed, and
    // the reason is written here rather than only in the SUMMARY.
    //
    // Plan 05 wrote `expect(executable).not.toMatch(/workspace_access_enabled/)`
    // for a file that never touched the switch. Section (h)'s redacted audit
    // reader must CALL public.workspace_access_enabled() — reading the switch
    // is precisely what makes that reader fail closed while the switch is off,
    // and every workspace read surface in the codebase reads it (migrations
    // 186, 192, 194). READING THE SWITCH IS NOT FLIPPING IT, and an assertion
    // that forbids the read would forbid the correct behaviour.
    //
    // So the assertion is narrowed to what it was always meant to catch: a
    // WRITE to the switch's backing table, or a REDEFINITION of the predicate
    // itself. Both of those are how this file could actually flip the switch,
    // and neither is possible now without failing here.
    it('does not flip the D-56 kill switch — it may read it, never write it', () => {
      expect(executable).not.toMatch(/workspace_access_config/)
      expect(executable).not.toMatch(
        /CREATE OR REPLACE FUNCTION public\.workspace_access_enabled/
      )
      expect(executable).not.toMatch(/kill_switch/i)
    })

    it('every appearance of workspace_access_enabled is a CALL, never a definition', () => {
      const appearances = executable.match(/workspace_access_enabled\s*\(/g) ?? []
      // The sample is not empty — section (h) reads the switch, so a future
      // edit that drops that conjunct fails the section (h) assertion below
      // rather than passing here vacuously.
      expect(appearances.length).toBeGreaterThanOrEqual(1)
      for (const site of executable.matchAll(/(.{0,40})workspace_access_enabled/g)) {
        expect(site[1]).not.toMatch(/FUNCTION public\.$/)
        expect(site[1]).not.toMatch(/DROP\s*$/)
      }
    })

    it('creates or alters no table outside the two it introduces', () => {
      const created = [...sql.matchAll(/CREATE TABLE public\.([a-z_]+)/g)].map((m) => m[1])
      expect(created.sort()).toEqual(['workspace_cohorts', 'workspace_ownership_transfers'])
      const altered = [...sql.matchAll(/ALTER TABLE public\.([a-z_]+)/g)].map((m) => m[1])
      expect([...new Set(altered)].sort()).toEqual([
        'workspace_cohorts',
        'workspace_ownership_transfers',
      ])
    })
  })

  // ══ File shape ═══════════════════════════════════════════════════════
  describe('file shape', () => {
    it("ends with NOTIFY pgrst, 'reload schema'; as its last statement, exactly once", () => {
      const lines = migration
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      // Counted against the comment-stripped view: the header QUOTES this
      // statement when it instructs plans 07 and 09 to keep it last, and a
      // raw count would see that quotation as a second reload.
      const notifies = sql.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })

    it('enables row level security on both new tables', () => {
      const enabled = sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []
      expect(enabled.length).toBeGreaterThanOrEqual(2)
    })

    it('contains at least one REVOKE and the HUMAN-GATED marker', () => {
      expect(sql).toMatch(/REVOKE/)
      expect(migration.match(/HUMAN-GATED/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
    })
  })
})
