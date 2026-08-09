import { readFileSync } from 'fs'
import path from 'path'
import { INVITE_ALLOWLIST_SCENARIOS, type InviteAllowlistScenario } from '@/lib/invites/invite-fixtures'

// ─── migration 099 — the current/authoritative parity + structural test ───
// Supersedes __tests__/migration-098-gate.test.ts as the live parity test,
// mirroring this repo's existing 085-test/086-test split (migration 085's
// test still describes 085's frozen content; 086's test is the fix-forward
// authority). migration-098-gate.test.ts is left untouched — it still
// accurately describes migration 098's frozen text.
//
// 27-CODEX-REVIEW.md M2: the 098 parity test was SUBSTRING-based (it only
// checked that certain fragments existed somewhere in the file), so it
// could not have caught drift between the SQL gate and its TS twin, nor a
// staff branch that quietly stopped being a bare RETURN NEW. This test
// upgrades that in two ways Jest actually allows (Jest cannot execute
// PL/pgSQL directly, so neither test file "runs" the SQL against a real
// Postgres):
//   1. STRUCTURAL branch comparison — extracts the curator/buyer/industry
//      branch bodies from migration 099 and from migration 086 (the last
//      known-good body those branches must stay byte-faithful to) and
//      diffs them whitespace-normalized, rather than checking that isolated
//      substrings appear somewhere in the file.
//   2. A hand-authored, EXECUTABLE behavioral model of the documented gate
//      algorithm (evaluateGate / simulateHandleNewUser below), run against
//      the SAME shared fixture table (lib/invites/invite-fixtures.ts) the
//      TS twin's own test (lib/invites/allowlist.test.ts) drives
//      isArtistEmailAllowed() against. A hand-authored model is not a
//      substitute for actually executing the SQL, but it is materially
//      harder to accidentally satisfy than a substring check: a real
//      implementation drift (e.g. the staff branch stops being a bare
//      early-return, or the accept-marking UPDATE goes back to matching
//      every pending row) requires BOTH the SQL text assertions below AND
//      this model to be changed in a mutually consistent way to still pass.

const migration099 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/099_artist_signup_gate_fixes.sql'),
  'utf8'
)
const migration086 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/086_restore_buyer_branch_handle_new_user.sql'),
  'utf8'
)

const functionBodyStart = migration099.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()')
const functionBodyEnd = migration099.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', functionBodyStart)
const handleNewUserBody = migration099.slice(functionBodyStart, functionBodyEnd)
const gateIdx = migration099.indexOf("RAISE EXCEPTION 'not_invited'", functionBodyStart)

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// Extracts a role branch's full text (its `IF ... THEN` through the FIRST
// `END IF;` that follows it). Safe for curator/buyer/industry — none of
// those branches contain a nested `IF` of their own, only BEGIN/EXCEPTION/
// END blocks, so the first `END IF;` after the start marker is always the
// one closing that branch, never a nested one.
function extractBranch(source: string, startMarker: string): string {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) throw new Error(`marker not found: ${startMarker}`)
  const endIdx = source.indexOf('END IF;', startIdx)
  if (endIdx === -1) throw new Error(`END IF; not found after marker: ${startMarker}`)
  return source.slice(startIdx, endIdx + 'END IF;'.length)
}

const CURATOR_MARKER = "IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN"
const BUYER_MARKER = "IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN"
const INDUSTRY_MARKER = "IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN"
const STAFF_MARKER = "IF (NEW.raw_app_meta_data->>'staff_role') IS NOT NULL THEN"

describe('migration 099 — handle_new_user() staff exemption (B1) + specific-invite consumption (M3)', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration099).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  // ── STRUCTURAL branch preservation (M2) ─────────────────────────────────
  it.each([
    ['curator', CURATOR_MARKER],
    ['buyer', BUYER_MARKER],
    ['industry', INDUSTRY_MARKER],
  ])('%s branch is structurally byte-faithful to migration 086 (whitespace-normalized full-body diff, not marker substrings)', (_name, marker) => {
    const branch099 = normalizeWhitespace(extractBranch(migration099, marker))
    const branch086 = normalizeWhitespace(extractBranch(migration086, marker))
    expect(branch099).toBe(branch086)
  })

  // ── B1: staff branch ────────────────────────────────────────────────────
  it('adds a staff branch keyed on raw_app_meta_data->>staff_role', () => {
    expect(migration099).toContain(STAFF_MARKER)
  })

  it('PLACEMENT: staff branch sits after buyer and before industry, and (critically) before the artist gate', () => {
    const curatorIdx = migration099.indexOf(CURATOR_MARKER)
    const buyerIdx = migration099.indexOf(BUYER_MARKER)
    const staffIdx = migration099.indexOf(STAFF_MARKER)
    const industryIdx = migration099.indexOf(INDUSTRY_MARKER)

    expect(curatorIdx).toBeGreaterThan(-1)
    expect(buyerIdx).toBeGreaterThan(curatorIdx)
    expect(staffIdx).toBeGreaterThan(buyerIdx)
    expect(industryIdx).toBeGreaterThan(staffIdx)
    expect(gateIdx).toBeGreaterThan(industryIdx)
  })

  it('the staff branch is a BARE RETURN NEW — no user_profiles/subscriptions insert, matching what createStaffAccount.ts expects', () => {
    const staffBranch = extractBranch(migration099, STAFF_MARKER)
    expect(staffBranch).toContain('RETURN NEW;')
    expect(staffBranch).not.toContain('INSERT INTO public.user_profiles')
    expect(staffBranch).not.toContain('INSERT INTO public.subscriptions')
  })

  it('curator, buyer, and staff branches all RETURN NEW before the industry branch — none can fall through into the artist gate', () => {
    const curatorIdx = migration099.indexOf(CURATOR_MARKER)
    const buyerIdx = migration099.indexOf(BUYER_MARKER)
    const staffIdx = migration099.indexOf(STAFF_MARKER)
    const industryIdx = migration099.indexOf(INDUSTRY_MARKER)

    const curatorReturnIdx = migration099.indexOf('RETURN NEW;', curatorIdx)
    const buyerReturnIdx = migration099.indexOf('RETURN NEW;', buyerIdx)
    const staffReturnIdx = migration099.indexOf('RETURN NEW;', staffIdx)

    expect(curatorReturnIdx).toBeGreaterThan(curatorIdx)
    expect(curatorReturnIdx).toBeLessThan(buyerIdx)
    expect(buyerReturnIdx).toBeGreaterThan(buyerIdx)
    expect(buyerReturnIdx).toBeLessThan(staffIdx)
    expect(staffReturnIdx).toBeGreaterThan(staffIdx)
    expect(staffReturnIdx).toBeLessThan(industryIdx)
  })

  it('raises with ERRCODE P0001 so the whole transaction (incl. the auth.users insert) rolls back', () => {
    expect(migration099).toContain("RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';")
  })

  it('header documents artist-branch-only scope, the human-gated push, and does not silently supersede 098 in place', () => {
    expect(migration099).toMatch(/human-gated/i)
    expect(migration099).toMatch(/supabase db push/i)
    expect(migration099).toMatch(/098 is left in place, unedited/i)
  })

  // ── M3: specific-invite consumption ─────────────────────────────────────
  it('identifies a SPECIFIC invite row (v_invite_id) rather than a blanket email match before marking anything accepted', () => {
    expect(migration099).toContain('SELECT id INTO v_invite_id')
    const selectIdx = migration099.indexOf('SELECT id INTO v_invite_id')
    expect(selectIdx).toBeGreaterThan(-1)
    expect(selectIdx).toBeLessThan(gateIdx)
  })

  it('the accept-marking UPDATE targets id = v_invite_id, never a blanket LOWER(email) match (the M3 bug pattern)', () => {
    const updateIdx = migration099.indexOf('UPDATE public.artist_invites', gateIdx)
    expect(updateIdx).toBeGreaterThan(gateIdx)
    const updateStatement = migration099.slice(updateIdx, migration099.indexOf(';', updateIdx) + 1)
    expect(updateStatement).toContain('WHERE id = v_invite_id AND status = ')
    expect(updateStatement).not.toContain('WHERE LOWER(email) = LOWER(NEW.email)')
  })

  it('the accept-marking UPDATE is guarded so it never runs when v_invite_id is NULL (collaborator-only admission)', () => {
    const updateIdx = migration099.indexOf('UPDATE public.artist_invites', gateIdx)
    const guardIdx = migration099.lastIndexOf('IF v_invite_id IS NOT NULL THEN', updateIdx)
    expect(guardIdx).toBeGreaterThan(gateIdx)
    expect(guardIdx).toBeLessThan(updateIdx)
  })

  it('the accept-marking UPDATE is still exception-isolated and runs after the gate but before the existing inserts', () => {
    const updateIdx = migration099.indexOf('UPDATE public.artist_invites', gateIdx)
    const artistInsertIdx = migration099.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')

    expect(updateIdx).toBeGreaterThan(gateIdx)
    expect(updateIdx).toBeLessThan(artistInsertIdx)

    const wrappingSlice = migration099.slice(gateIdx, artistInsertIdx)
    expect(wrappingSlice).toContain('BEGIN')
    expect(wrappingSlice).toContain('EXCEPTION WHEN OTHERS THEN')
  })

  it('claim_collaborators() is unchanged and still runs after the artist-branch inserts', () => {
    const artistInsertIdx = migration099.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
    const claimIdx = migration099.indexOf('public.claim_collaborators(NEW.id, NEW.email)')
    expect(claimIdx).toBeGreaterThan(artistInsertIdx)
  })

  // ── M1/M2 corollary: the SQL side never had a wildcard-injection surface ─
  it('the gate uses only exact LOWER()=LOWER() equality — no ILIKE/LIKE anywhere in handle_new_user() (the M1 bug was TS-only)', () => {
    expect(handleNewUserBody.toUpperCase()).not.toMatch(/\bI?LIKE\b/)
    expect(handleNewUserBody).toContain('LOWER(email) = LOWER(NEW.email)')
  })

  // ── M4: partial unique index ─────────────────────────────────────────────
  it('adds a partial UNIQUE index on LOWER(email) scoped to pending invites', () => {
    expect(migration099).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_invites_pending_email_unique\s+ON public\.artist_invites \(LOWER\(email\)\)\s+WHERE status = 'pending';/
    )
  })

  // ── L1: email_has_account search_path hardening ──────────────────────────
  it('redefines email_has_account() with search_path = \'\' and pg_catalog-qualified lower()', () => {
    const fnStart = migration099.indexOf('CREATE OR REPLACE FUNCTION public.email_has_account')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = migration099.slice(fnStart, migration099.indexOf('$$;', fnStart) + 3)
    expect(fnBody).toContain("SET search_path = ''")
    expect(fnBody).not.toContain('SET search_path = public')
    expect(fnBody).toContain('pg_catalog.lower(email)')
    expect(fnBody).toContain('pg_catalog.lower(p_email)')
  })

  // ── B2 (owner runbook consequence, not a separate DB change): break-glass
  // Layer 2's phantom-row cleanup caveat is now obsolete — checked in
  // docs/BREAK-GLASS.md itself, not here, but documented for cross-reference.

  // ── behavioral model (executable, not substring-based) ──────────────────
  describe('behavioral model of the documented gate algorithm', () => {
    type GateState = Pick<InviteAllowlistScenario, 'collaboratorEmails' | 'inviteRows'>

    // Mirrors the SQL gate's documented predicate exactly: an EXACT,
    // case-insensitive email match (never a wildcard/pattern match — see
    // the ILIKE/LIKE-absence assertion above), a 'pending' + unexpired
    // artist_invites row (specific row, M3), OR a collaborators row.
    function evaluateGate(state: GateState, email: string) {
      const lower = (s: string) => s.toLowerCase()
      const invite = state.inviteRows.find(
        r => lower(r.email) === lower(email) && r.status === 'pending' && !r.expired
      )
      const collaboratorMatch = state.collaboratorEmails.some(e => lower(e) === lower(email))
      return {
        admitted: Boolean(invite) || collaboratorMatch,
        consumedInviteEmail: invite ? invite.email : null,
      }
    }

    type NewUserMeta = { role?: string; staffRole?: string }

    // Mirrors the full branch order this migration's SQL text implements:
    // curator -> buyer -> staff -> industry -> artist gate.
    function simulateHandleNewUser(meta: NewUserMeta, state: GateState, email: string) {
      if (meta.role === 'curator') return { outcome: 'admitted' as const, branch: 'curator' }
      if (meta.role === 'buyer') return { outcome: 'admitted' as const, branch: 'buyer' }
      if (meta.staffRole) return { outcome: 'admitted' as const, branch: 'staff' }
      if (meta.role === 'industry') return { outcome: 'admitted' as const, branch: 'industry' }

      const gate = evaluateGate(state, email)
      if (!gate.admitted) return { outcome: 'rejected' as const, reason: 'not_invited' }
      return { outcome: 'admitted' as const, branch: 'artist', consumedInviteEmail: gate.consumedInviteEmail }
    }

    describe.each(INVITE_ALLOWLIST_SCENARIOS)('twin-parity (behavioral) — $name', scenario => {
      it('evaluateGate matches the shared fixture expectation', () => {
        const result = evaluateGate(scenario, scenario.email)
        expect(result.admitted).toBe(scenario.expected)
      })
    })

    it('M3 — a collaborator-only admission consumes NO invite row', () => {
      const scenario = INVITE_ALLOWLIST_SCENARIOS.find(s => s.name === 'collaborator-only match is allowed')!
      const result = evaluateGate(scenario, scenario.email)
      expect(result.admitted).toBe(true)
      expect(result.consumedInviteEmail).toBeNull()
    })

    it('M3 — an invite-authorized admission consumes exactly the matching invite, not a blanket set', () => {
      const scenario = INVITE_ALLOWLIST_SCENARIOS.find(s => s.name === 'pending non-expired invite match is allowed')!
      const result = evaluateGate(scenario, scenario.email)
      expect(result.admitted).toBe(true)
      expect(result.consumedInviteEmail).toBe(scenario.email)
    })

    it('B1 — a staff_role signup is ADMITTED (never reaches the artist gate), even with zero invites/collaborators on record', () => {
      const emptyState: GateState = { collaboratorEmails: [], inviteRows: [] }
      const result = simulateHandleNewUser({ staffRole: 'leadership' }, emptyState, 'new-staff@funun.example')
      expect(result.outcome).toBe('admitted')
      expect(result).toMatchObject({ branch: 'staff' })
    })

    it('an uninvited plain-artist signup (no role, no staff_role) still RAISEs not_invited', () => {
      const emptyState: GateState = { collaboratorEmails: [], inviteRows: [] }
      const result = simulateHandleNewUser({}, emptyState, 'nobody@example.com')
      expect(result.outcome).toBe('rejected')
      expect(result).toMatchObject({ reason: 'not_invited' })
    })
  })
})
