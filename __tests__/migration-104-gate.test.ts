import { readFileSync } from 'fs'
import path from 'path'
import { INVITE_ALLOWLIST_SCENARIOS, type InviteAllowlistScenario } from '@/lib/invites/invite-fixtures'

// ─── migration 104 — non-artist provisioning exemption (cutover corrective) ──
// The current/authoritative parity + structural test for handle_new_user(),
// superseding migration-099-gate.test.ts as the live-body authority (099's
// test is left untouched — it still accurately describes 099's frozen text,
// same 085/086-test split convention).
//
// WHAT 104 changes vs 099 (see the migration header): the curator/buyer/staff/
// industry branches are reproduced byte-for-byte; the artist invite gate now
// runs ONLY for a self-serve signup, identified by the ABSENCE of an
// admin-provision exemption. The exemption requires TWO un-forgeable signals,
// BOTH: (1) a consumed account_provision_intents row (service-role-only table)
// AND (2) email_confirmed_at IS NOT NULL at INSERT. Every gap fails CLOSED
// (the invite gate still runs).
//
// This test upgrades the 099 test's two techniques for 104: (1) STRUCTURAL
// branch comparison of curator/buyer/industry against migration 086 (the last
// known-good bodies), and (2) an EXECUTABLE behavioral model of the documented
// algorithm run against the SAME shared fixture table the TS twin uses — plus
// new cases for the confirmed+intent exemption and its fail-closed edges.

const migration104 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/104_artist_gate_provision_intent.sql'),
  'utf8'
)
const migration086 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/086_restore_buyer_branch_handle_new_user.sql'),
  'utf8'
)

const functionBodyStart = migration104.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()')
const functionBodyEnd = migration104.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', functionBodyStart)
const handleNewUserBody = migration104.slice(functionBodyStart, functionBodyEnd)
const gateIdx = migration104.indexOf("RAISE EXCEPTION 'not_invited'", functionBodyStart)
const exemptIdx = migration104.indexOf('IF NEW.email_confirmed_at IS NOT NULL THEN', functionBodyStart)

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// Extracts a role branch's full text (its `IF ... THEN` through the FIRST
// `END IF;` that follows it). Safe for curator/buyer/industry — none contains
// a nested `IF` of its own, only BEGIN/EXCEPTION/END blocks.
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

describe('migration 104 — non-artist provisioning exemption for the invite gate', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration104).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  // ── the account_provision_intents table ─────────────────────────────────
  describe('account_provision_intents table (service-role-only marker)', () => {
    it('creates the table before the function (so check_function_bodies can resolve the DELETE)', () => {
      const tableIdx = migration104.indexOf('CREATE TABLE IF NOT EXISTS public.account_provision_intents')
      expect(tableIdx).toBeGreaterThan(-1)
      expect(tableIdx).toBeLessThan(functionBodyStart)
    })

    it('is locked down: RLS enabled + REVOKE ALL from PUBLIC/anon/authenticated (zero-policy shape)', () => {
      expect(migration104).toContain('ALTER TABLE public.account_provision_intents ENABLE ROW LEVEL SECURITY;')
      expect(migration104).toContain(
        'REVOKE ALL ON public.account_provision_intents FROM PUBLIC, anon, authenticated;'
      )
      // No CREATE POLICY for this table — zero-policy + REVOKE ALL = service-role only.
      expect(migration104).not.toMatch(/CREATE POLICY[^;]+account_provision_intents/i)
    })

    it('indexes LOWER(email) for the trigger consume + helper cleanup lookups', () => {
      expect(migration104).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_account_provision_intents_email_lower\s+ON public\.account_provision_intents \(LOWER\(email\)\)/
      )
    })

    it('token rows expire (single-use + TTL so an abandoned row is inert, HIGH-1)', () => {
      expect(migration104).toMatch(/expires_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\) \+ interval/)
    })
  })

  // ── STRUCTURAL branch preservation vs 086 ───────────────────────────────
  it.each([
    ['curator', CURATOR_MARKER],
    ['buyer', BUYER_MARKER],
    ['industry', INDUSTRY_MARKER],
  ])('%s branch is structurally byte-faithful to migration 086 (whitespace-normalized full-body diff)', (_name, marker) => {
    const branch104 = normalizeWhitespace(extractBranch(migration104, marker))
    const branch086 = normalizeWhitespace(extractBranch(migration086, marker))
    expect(branch104).toBe(branch086)
  })

  it('keeps the staff branch as a BARE RETURN NEW (defense in depth), before the artist gate', () => {
    expect(migration104).toContain(STAFF_MARKER)
    const staffBranch = extractBranch(migration104, STAFF_MARKER)
    expect(staffBranch).toContain('RETURN NEW;')
    expect(staffBranch).not.toContain('INSERT INTO public.user_profiles')
    const staffIdx = migration104.indexOf(STAFF_MARKER)
    expect(gateIdx).toBeGreaterThan(staffIdx)
  })

  it('all four app_metadata branches sit before the artist gate — none can reach the not_invited raise', () => {
    const curatorIdx = migration104.indexOf(CURATOR_MARKER)
    const buyerIdx = migration104.indexOf(BUYER_MARKER)
    const staffIdx = migration104.indexOf(STAFF_MARKER)
    const industryIdx = migration104.indexOf(INDUSTRY_MARKER)
    expect(curatorIdx).toBeGreaterThan(-1)
    expect(buyerIdx).toBeGreaterThan(curatorIdx)
    expect(staffIdx).toBeGreaterThan(buyerIdx)
    expect(industryIdx).toBeGreaterThan(staffIdx)
    expect(gateIdx).toBeGreaterThan(industryIdx)
  })

  // ── the exemption itself ─────────────────────────────────────────────────
  describe('admin-provision exemption (the fix)', () => {
    it('consumes the intent ONLY when email_confirmed_at IS NOT NULL (a racing unconfirmed signup cannot burn it)', () => {
      expect(exemptIdx).toBeGreaterThan(-1)
      // The DELETE consume sits INSIDE the email_confirmed_at guard, before the gate.
      const deleteIdx = migration104.indexOf('DELETE FROM public.account_provision_intents', exemptIdx)
      expect(deleteIdx).toBeGreaterThan(exemptIdx)
      expect(deleteIdx).toBeLessThan(gateIdx)
      // FOUND (whether a row was actually consumed) drives the exemption flag.
      const foundIdx = migration104.indexOf('v_admin_provisioned := FOUND;', deleteIdx)
      expect(foundIdx).toBeGreaterThan(deleteIdx)
      expect(foundIdx).toBeLessThan(gateIdx)
    })

    it('consumes EXACTLY the intent row by its unguessable id, same email, unexpired (attempt-bound, HIGH-1)', () => {
      const deleteIdx = migration104.indexOf('DELETE FROM public.account_provision_intents', exemptIdx)
      const deleteStmt = migration104.slice(deleteIdx, migration104.indexOf(';', deleteIdx) + 1)
      expect(deleteStmt).toContain("id::text = NEW.raw_user_meta_data->>'provision_intent'")
      expect(deleteStmt).toContain('LOWER(email) = LOWER(NEW.email)')
      expect(deleteStmt).toContain('expires_at > NOW()')
    })

    it('claim_collaborators runs ONLY for a genuine artist signup, never an exempted admin lane (HIGH-2)', () => {
      const claimIdx = migration104.indexOf('public.claim_collaborators(NEW.id, NEW.email)')
      expect(claimIdx).toBeGreaterThan(-1)
      // the claim call is wrapped by its own `IF NOT v_admin_provisioned THEN` guard
      const guardIdx = migration104.lastIndexOf('IF NOT v_admin_provisioned THEN', claimIdx)
      const endIfAfterClaim = migration104.indexOf('END IF;', claimIdx)
      expect(guardIdx).toBeGreaterThan(gateIdx) // the SECOND such guard, after the gate block
      expect(guardIdx).toBeLessThan(claimIdx)
      expect(endIfAfterClaim).toBeGreaterThan(claimIdx)
    })

    it('the exemption is positioned after the industry branch and before the gate', () => {
      const industryIdx = migration104.indexOf(INDUSTRY_MARKER)
      expect(exemptIdx).toBeGreaterThan(industryIdx)
      expect(exemptIdx).toBeLessThan(gateIdx)
    })

    it('the invite gate (SELECT + RAISE) runs ONLY when NOT admin-provisioned (fail-closed guard)', () => {
      const guardIdx = migration104.indexOf('IF NOT v_admin_provisioned THEN')
      const selectIdx = migration104.indexOf('SELECT id INTO v_invite_id', functionBodyStart)
      expect(guardIdx).toBeGreaterThan(exemptIdx)
      expect(guardIdx).toBeLessThan(selectIdx)
      expect(selectIdx).toBeLessThan(gateIdx)
    })

    it('raises with ERRCODE P0001 so the whole transaction (incl. the auth.users insert) rolls back', () => {
      expect(migration104).toContain("RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';")
    })

    it('default provisioning (user_profiles insert + claim_collaborators) runs for both admitted paths, after the gate block', () => {
      const artistInsertIdx = migration104.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
      const claimIdx = migration104.indexOf('public.claim_collaborators(NEW.id, NEW.email)')
      expect(artistInsertIdx).toBeGreaterThan(gateIdx)
      expect(claimIdx).toBeGreaterThan(artistInsertIdx)
    })
  })

  // ── M3 preserved: specific-invite consumption ────────────────────────────
  it('still identifies a SPECIFIC invite row and marks only that one accepted (M3, unchanged from 099)', () => {
    expect(migration104).toContain('SELECT id INTO v_invite_id')
    const updateIdx = migration104.indexOf('UPDATE public.artist_invites', gateIdx)
    const updateStatement = migration104.slice(updateIdx, migration104.indexOf(';', updateIdx) + 1)
    expect(updateStatement).toContain('WHERE id = v_invite_id AND status = ')
    expect(updateStatement).not.toContain('WHERE LOWER(email) = LOWER(NEW.email)')
  })

  it('the gate uses only exact LOWER()=LOWER() equality — no ILIKE/LIKE anywhere in handle_new_user()', () => {
    expect(handleNewUserBody.toUpperCase()).not.toMatch(/\bI?LIKE\b/)
    expect(handleNewUserBody).toContain('LOWER(email) = LOWER(NEW.email)')
  })

  it('header documents the cutover root cause, the two-signal fail-closed design, and the human-gated push', () => {
    expect(migration104).toMatch(/app_metadata AFTER the auth\.users INSERT/i)
    expect(migration104).toMatch(/fail-closed/i)
    expect(migration104).toMatch(/human-gated/i)
    expect(migration104).toMatch(/supabase db push/i)
    expect(migration104).toMatch(/live .*smoke/i)
  })

  // ── behavioral model (executable, not substring-based) ──────────────────
  describe('behavioral model of the documented gate algorithm', () => {
    type GateState = Pick<InviteAllowlistScenario, 'collaboratorEmails' | 'inviteRows'>

    // Mirrors the SQL gate predicate exactly (unchanged from 099): exact
    // case-insensitive email match against a pending+unexpired invite OR a
    // collaborators row.
    function evaluateGate(state: GateState, email: string) {
      const lower = (s: string) => s.toLowerCase()
      const invite = state.inviteRows.find(
        r => lower(r.email) === lower(email) && r.status === 'pending' && !r.expired
      )
      const collaboratorMatch = state.collaboratorEmails.some(e => lower(e) === lower(email))
      return { admitted: Boolean(invite) || collaboratorMatch }
    }

    type NewUserMeta = { role?: string; staffRole?: string }
    // The two INSERT-time signals migration 104 keys the exemption on.
    // hasMatchingIntent = the signup presents a VALID, unexpired intent id for
    // THIS email (absent / expired / wrong-id / foreign-email all => false).
    type ProvisionCtx = { confirmedAtInsert: boolean; hasMatchingIntent: boolean }

    // Mirrors the full branch order + exemption + claim guard 104 implements:
    // curator -> buyer -> staff -> industry -> [confirmed && matching-intent
    // exemption] -> artist gate; claim_collaborators only for the artist.
    function simulateHandleNewUser(
      meta: NewUserMeta,
      ctx: ProvisionCtx,
      state: GateState,
      email: string
    ) {
      if (meta.role === 'curator') return { outcome: 'admitted' as const, branch: 'curator', intentConsumed: false, claimed: false }
      if (meta.role === 'buyer') return { outcome: 'admitted' as const, branch: 'buyer', intentConsumed: false, claimed: false }
      if (meta.staffRole) return { outcome: 'admitted' as const, branch: 'staff', intentConsumed: false, claimed: false }
      if (meta.role === 'industry') return { outcome: 'admitted' as const, branch: 'industry', intentConsumed: false, claimed: false }

      // default branch: the DELETE (consume) is gated behind confirmedAtInsert,
      // so an unconfirmed signup never consumes an intent (and can't burn one).
      let adminProvisioned = false
      let intentConsumed = false
      if (ctx.confirmedAtInsert) {
        intentConsumed = ctx.hasMatchingIntent
        adminProvisioned = ctx.hasMatchingIntent
      }

      if (!adminProvisioned) {
        if (!evaluateGate(state, email).admitted) {
          return { outcome: 'rejected' as const, reason: 'not_invited', intentConsumed, claimed: false }
        }
        // genuine self-serve artist: claim_collaborators runs.
        return { outcome: 'admitted' as const, branch: 'artist', intentConsumed, claimed: true }
      }
      // admin-provisioned: NEVER claims collaborators (HIGH-2).
      return { outcome: 'admitted' as const, branch: 'admin-provisioned', intentConsumed, claimed: false }
    }

    const emptyState: GateState = { collaboratorEmails: [], inviteRows: [] }
    const confirmedWithIntent: ProvisionCtx = { confirmedAtInsert: true, hasMatchingIntent: true }
    const unconfirmedWithIntent: ProvisionCtx = { confirmedAtInsert: false, hasMatchingIntent: true }
    const confirmedNoIntent: ProvisionCtx = { confirmedAtInsert: true, hasMatchingIntent: false }
    const unconfirmedNoIntent: ProvisionCtx = { confirmedAtInsert: false, hasMatchingIntent: false }

    // The self-serve artist gate predicate still matches the shared fixtures.
    describe.each(INVITE_ALLOWLIST_SCENARIOS)('twin-parity (behavioral) — $name', scenario => {
      it('evaluateGate matches the shared fixture expectation', () => {
        expect(evaluateGate(scenario, scenario.email).admitted).toBe(scenario.expected)
      })
    })

    it('EXEMPT: confirmed + matching intent + no invite → admitted (admin-provisioned), gate skipped, intent consumed, NOT claimed', () => {
      const r = simulateHandleNewUser({}, confirmedWithIntent, emptyState, 'buyer@corp.example')
      expect(r.outcome).toBe('admitted')
      expect(r).toMatchObject({ branch: 'admin-provisioned', intentConsumed: true, claimed: false })
    })

    it('RACE-SAFE: unconfirmed + intent + no invite → REJECTED, and the intent is NOT consumed (preserved for the real admin)', () => {
      const r = simulateHandleNewUser({}, unconfirmedWithIntent, emptyState, 'buyer@corp.example')
      expect(r.outcome).toBe('rejected')
      expect(r).toMatchObject({ reason: 'not_invited', intentConsumed: false })
    })

    it('FAIL-CLOSED: confirmed + NO valid/unexpired intent + no invite → REJECTED (covers stale, expired, foreign, break-glass-manual)', () => {
      const r = simulateHandleNewUser({}, confirmedNoIntent, emptyState, 'nobody@example.com')
      expect(r.outcome).toBe('rejected')
      expect(r).toMatchObject({ reason: 'not_invited' })
    })

    it('an uninvited self-serve artist (unconfirmed, no intent) still RAISEs not_invited', () => {
      const r = simulateHandleNewUser({}, unconfirmedNoIntent, emptyState, 'nobody@example.com')
      expect(r.outcome).toBe('rejected')
    })

    it('an INVITED self-serve artist (unconfirmed, no intent) is admitted through the gate AND claims collaborators', () => {
      const invitedState: GateState = {
        collaboratorEmails: [],
        inviteRows: [{ email: 'invited@example.com', status: 'pending', expired: false }],
      }
      const r = simulateHandleNewUser({}, unconfirmedNoIntent, invitedState, 'invited@example.com')
      expect(r.outcome).toBe('admitted')
      expect(r).toMatchObject({ branch: 'artist', claimed: true })
    })

    it('HIGH-2: an exempted admin lane never claims collaborators; a genuine artist does', () => {
      const admin = simulateHandleNewUser({}, confirmedWithIntent, emptyState, 'buyer@corp.example')
      expect(admin).toMatchObject({ branch: 'admin-provisioned', claimed: false })
      const artistState: GateState = { collaboratorEmails: ['artist@example.com'], inviteRows: [] }
      const artist = simulateHandleNewUser({}, unconfirmedNoIntent, artistState, 'artist@example.com')
      expect(artist).toMatchObject({ branch: 'artist', claimed: true })
    })

    it('app_metadata lanes are still admitted directly (defense in depth), regardless of intent/confirmation', () => {
      expect(simulateHandleNewUser({ role: 'buyer' }, unconfirmedNoIntent, emptyState, 'b@x').branch).toBe('buyer')
      expect(simulateHandleNewUser({ staffRole: 'ae' }, unconfirmedNoIntent, emptyState, 's@x').branch).toBe('staff')
      expect(simulateHandleNewUser({ role: 'industry' }, unconfirmedNoIntent, emptyState, 'i@x').branch).toBe('industry')
    })
  })
})
