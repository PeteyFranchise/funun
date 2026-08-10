import { readFileSync } from 'fs'
import path from 'path'
import { INVITE_ALLOWLIST_SCENARIOS, type InviteAllowlistScenario } from '@/lib/invites/invite-fixtures'

// ─── migration 105 — admin-provision exemption on the intent id ALONE ────────
// The current/authoritative parity + structural test for handle_new_user(),
// superseding migration-104-gate.test.ts (104's test stays, describing 104's
// frozen text). migration 105 removes migration 104's email_confirmed_at
// second factor — the 27-13 INSERT-time diagnostic proved email_confirmed_at
// (and custom app_metadata) are NULL/absent in NEW at INSERT on this Supabase,
// while user_metadata IS visible. So the exemption keys on the unforgeable
// intent id carried in user_metadata alone.
//
// The load-bearing regression guard here is that the function body contains NO
// reference to email_confirmed_at at all (that guard is what rejected every
// admin lane in the 27-11/27-12 cutovers). Plus the same structural + executable
// behavioral checks the 104 test used, adapted for the single-signal design.

const migration105 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/105_artist_gate_intent_id_exemption.sql'),
  'utf8'
)
const migration086 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/086_restore_buyer_branch_handle_new_user.sql'),
  'utf8'
)

const functionBodyStart = migration105.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()')
const functionBodyEnd = migration105.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', functionBodyStart)
const handleNewUserBody = migration105.slice(functionBodyStart, functionBodyEnd)
const gateIdx = migration105.indexOf("RAISE EXCEPTION 'not_invited'", functionBodyStart)
const deleteIdx = migration105.indexOf('DELETE FROM public.account_provision_intents', functionBodyStart)

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

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

describe('migration 105 — admin-provision exemption on the intent id alone', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration105).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  // ── THE regression guard: no email_confirmed_at anywhere ─────────────────
  it('the code NEVER reads email_confirmed_at — the second factor that could not pass at INSERT is gone (a comment may explain why it was dropped)', () => {
    // No field access in code (NEW.email_confirmed_at); a self-documenting
    // comment that mentions the name is fine and expected.
    expect(handleNewUserBody).not.toContain('NEW.email_confirmed_at')
    // and there is no `IF NEW.email_confirmed_at ...` guard wrapping the consume
    expect(migration105).not.toMatch(/IF\s+NEW\.email_confirmed_at/)
  })

  // ── the account_provision_intents table is re-ensured (idempotent) ───────
  it('re-ensures the service-role-only intent table (self-contained for the break-glass restore path)', () => {
    expect(migration105).toContain('CREATE TABLE IF NOT EXISTS public.account_provision_intents')
    expect(migration105).toContain('ALTER TABLE public.account_provision_intents ENABLE ROW LEVEL SECURITY;')
    expect(migration105).toContain(
      'REVOKE ALL ON public.account_provision_intents FROM PUBLIC, anon, authenticated;'
    )
    expect(migration105).not.toMatch(/CREATE POLICY[^;]+account_provision_intents/i)
  })

  // ── STRUCTURAL branch preservation vs 086 ───────────────────────────────
  it.each([
    ['curator', CURATOR_MARKER],
    ['buyer', BUYER_MARKER],
    ['industry', INDUSTRY_MARKER],
  ])('%s branch is structurally byte-faithful to migration 086', (_name, marker) => {
    const branch105 = normalizeWhitespace(extractBranch(migration105, marker))
    const branch086 = normalizeWhitespace(extractBranch(migration086, marker))
    expect(branch105).toBe(branch086)
  })

  it('keeps the staff branch as a BARE RETURN NEW (defense in depth), before the artist gate', () => {
    const staffBranch = extractBranch(migration105, STAFF_MARKER)
    expect(staffBranch).toContain('RETURN NEW;')
    expect(staffBranch).not.toContain('INSERT INTO public.user_profiles')
    expect(gateIdx).toBeGreaterThan(migration105.indexOf(STAFF_MARKER))
  })

  // ── the exemption itself (id-only) ───────────────────────────────────────
  describe('admin-provision exemption', () => {
    it('consumes the intent by its id, same email, unexpired — and is NOT guarded by any confirmation check', () => {
      expect(deleteIdx).toBeGreaterThan(-1)
      const deleteStmt = migration105.slice(deleteIdx, migration105.indexOf(';', deleteIdx) + 1)
      expect(deleteStmt).toContain("id::text = NEW.raw_user_meta_data->>'provision_intent'")
      expect(deleteStmt).toContain('LOWER(email) = LOWER(NEW.email)')
      expect(deleteStmt).toContain('expires_at > NOW()')
      // FOUND (whether a row was actually consumed) drives the exemption flag.
      const foundIdx = migration105.indexOf('v_admin_provisioned := FOUND;', deleteIdx)
      expect(foundIdx).toBeGreaterThan(deleteIdx)
      expect(foundIdx).toBeLessThan(gateIdx)
    })

    it('the exemption sits after the industry branch and before the gate', () => {
      const industryIdx = migration105.indexOf(INDUSTRY_MARKER)
      expect(deleteIdx).toBeGreaterThan(industryIdx)
      expect(deleteIdx).toBeLessThan(gateIdx)
    })

    it('the invite gate (SELECT + RAISE) runs ONLY when NOT admin-provisioned (fail-closed)', () => {
      const guardIdx = migration105.indexOf('IF NOT v_admin_provisioned THEN')
      const selectIdx = migration105.indexOf('SELECT id INTO v_invite_id', functionBodyStart)
      expect(guardIdx).toBeGreaterThan(deleteIdx)
      expect(guardIdx).toBeLessThan(selectIdx)
      expect(selectIdx).toBeLessThan(gateIdx)
    })

    it('raises with ERRCODE P0001 so the whole transaction rolls back', () => {
      expect(migration105).toContain("RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';")
    })

    it('claim_collaborators runs ONLY for a genuine artist signup (HIGH-2), never an exempted admin lane', () => {
      const claimIdx = migration105.indexOf('public.claim_collaborators(NEW.id, NEW.email)')
      expect(claimIdx).toBeGreaterThan(-1)
      const guardIdx = migration105.lastIndexOf('IF NOT v_admin_provisioned THEN', claimIdx)
      expect(guardIdx).toBeGreaterThan(gateIdx) // the SECOND such guard, after the gate block
      expect(guardIdx).toBeLessThan(claimIdx)
    })
  })

  it('still identifies a SPECIFIC invite row and marks only that one accepted (M3, unchanged)', () => {
    expect(migration105).toContain('SELECT id INTO v_invite_id')
    const updateIdx = migration105.indexOf('UPDATE public.artist_invites', gateIdx)
    const updateStatement = migration105.slice(updateIdx, migration105.indexOf(';', updateIdx) + 1)
    expect(updateStatement).toContain('WHERE id = v_invite_id AND status = ')
    expect(updateStatement).not.toContain('WHERE LOWER(email) = LOWER(NEW.email)')
  })

  it('the gate uses only exact LOWER()=LOWER() equality — no ILIKE/LIKE anywhere', () => {
    expect(handleNewUserBody.toUpperCase()).not.toMatch(/\bI?LIKE\b/)
    expect(handleNewUserBody).toContain('LOWER(email) = LOWER(NEW.email)')
  })

  it('header documents the 27-13 diagnostic finding + the id-only single-signal design + human-gated push', () => {
    expect(migration105).toMatch(/email_confirm.*applied AFTER the INSERT/i)
    expect(migration105).toMatch(/intent id alone/i)
    expect(migration105).toMatch(/human-gated/i)
    expect(migration105).toMatch(/supabase db push/i)
  })

  // ── behavioral model (executable) ───────────────────────────────────────
  describe('behavioral model of the documented gate algorithm', () => {
    type GateState = Pick<InviteAllowlistScenario, 'collaboratorEmails' | 'inviteRows'>

    function evaluateGate(state: GateState, email: string) {
      const lower = (s: string) => s.toLowerCase()
      const invite = state.inviteRows.find(
        r => lower(r.email) === lower(email) && r.status === 'pending' && !r.expired
      )
      const collaboratorMatch = state.collaboratorEmails.some(e => lower(e) === lower(email))
      return { admitted: Boolean(invite) || collaboratorMatch }
    }

    type NewUserMeta = { role?: string; staffRole?: string }
    // The SINGLE INSERT-time signal migration 105 keys the exemption on:
    // presentsValidIntent = the signup carries a valid, unexpired intent id for
    // THIS email (only an admin create*Account helper can — a self-serve signup
    // cannot read or guess the id; absent / garbage / expired / foreign all =>
    // false). email_confirmed_at is NOT a factor.
    type ProvisionCtx = { presentsValidIntent: boolean }

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

      // default branch: consume iff a valid matching intent id is presented.
      const adminProvisioned = ctx.presentsValidIntent
      const intentConsumed = ctx.presentsValidIntent

      if (!adminProvisioned) {
        if (!evaluateGate(state, email).admitted) {
          return { outcome: 'rejected' as const, reason: 'not_invited', intentConsumed, claimed: false }
        }
        return { outcome: 'admitted' as const, branch: 'artist', intentConsumed, claimed: true }
      }
      return { outcome: 'admitted' as const, branch: 'admin-provisioned', intentConsumed, claimed: false }
    }

    const emptyState: GateState = { collaboratorEmails: [], inviteRows: [] }
    const withIntent: ProvisionCtx = { presentsValidIntent: true }
    const noIntent: ProvisionCtx = { presentsValidIntent: false }

    describe.each(INVITE_ALLOWLIST_SCENARIOS)('twin-parity (behavioral) — $name', scenario => {
      it('evaluateGate matches the shared fixture expectation', () => {
        expect(evaluateGate(scenario, scenario.email).admitted).toBe(scenario.expected)
      })
    })

    it('EXEMPT: a valid intent id + no invite → admitted (admin-provisioned), consumed, NOT claimed', () => {
      const r = simulateHandleNewUser({}, withIntent, emptyState, 'buyer@corp.example')
      expect(r.outcome).toBe('admitted')
      expect(r).toMatchObject({ branch: 'admin-provisioned', intentConsumed: true, claimed: false })
    })

    it('FAIL-CLOSED: no valid intent id + no invite → REJECTED (covers absent/garbage/expired/foreign, and a racing signup that cannot guess the id)', () => {
      const r = simulateHandleNewUser({}, noIntent, emptyState, 'nobody@example.com')
      expect(r.outcome).toBe('rejected')
      expect(r).toMatchObject({ reason: 'not_invited', intentConsumed: false })
    })

    it('an INVITED self-serve artist (no intent id) is admitted through the gate AND claims collaborators', () => {
      const invitedState: GateState = {
        collaboratorEmails: [],
        inviteRows: [{ email: 'invited@example.com', status: 'pending', expired: false }],
      }
      const r = simulateHandleNewUser({}, noIntent, invitedState, 'invited@example.com')
      expect(r.outcome).toBe('admitted')
      expect(r).toMatchObject({ branch: 'artist', claimed: true })
    })

    it('HIGH-2: an exempted admin lane never claims collaborators; a genuine artist does', () => {
      const admin = simulateHandleNewUser({}, withIntent, emptyState, 'buyer@corp.example')
      expect(admin).toMatchObject({ branch: 'admin-provisioned', claimed: false })
      const artistState: GateState = { collaboratorEmails: ['artist@example.com'], inviteRows: [] }
      const artist = simulateHandleNewUser({}, noIntent, artistState, 'artist@example.com')
      expect(artist).toMatchObject({ branch: 'artist', claimed: true })
    })

    it('app_metadata lanes are still admitted directly (defense in depth), regardless of intent', () => {
      expect(simulateHandleNewUser({ role: 'buyer' }, noIntent, emptyState, 'b@x').branch).toBe('buyer')
      expect(simulateHandleNewUser({ staffRole: 'ae' }, noIntent, emptyState, 's@x').branch).toBe('staff')
      expect(simulateHandleNewUser({ role: 'industry' }, noIntent, emptyState, 'i@x').branch).toBe('industry')
    })
  })
})
