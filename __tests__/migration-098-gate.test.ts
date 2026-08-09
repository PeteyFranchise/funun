import { readFileSync } from 'fs'
import path from 'path'
import { INVITE_ALLOWLIST_SCENARIOS } from '@/lib/invites/invite-fixtures'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/098_artist_signup_gate.sql'),
  'utf8'
)

// The header comment (WHY/WHAT prose above the function) also mentions
// "RAISE EXCEPTION 'not_invited'" for documentation purposes — every index
// lookup below must search from the start of the actual function body
// (CREATE OR REPLACE FUNCTION...) onward, never the whole file, or it will
// match the prose instead of the real code.
const functionBodyStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()')
const gateIdx = migration.indexOf("RAISE EXCEPTION 'not_invited'", functionBodyStart)

describe('migration 098 — handle_new_user() artist-branch invite gate', () => {
  it('replaces handle_new_user() rather than adding a separate function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
  })

  it('reproduces the curator, buyer, and industry early-return branches', () => {
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN")
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN")
    expect(migration).toContain("IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN")
  })

  it('PLACEMENT (RESEARCH Pitfall 1): the not_invited gate sits after the last role branch\'s RETURN NEW and before the artist-branch insert', () => {
    const industryIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")
    const industryReturnIdx = migration.indexOf('RETURN NEW;', industryIdx)
    const artistInsertIdx = migration.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')

    expect(industryIdx).toBeGreaterThan(-1)
    expect(industryReturnIdx).toBeGreaterThan(industryIdx)
    expect(gateIdx).toBeGreaterThan(industryReturnIdx)
    expect(artistInsertIdx).toBeGreaterThan(gateIdx)
  })

  it('SCOPE: curator and buyer branches each RETURN NEW before the industry branch — none can fall through into the gate', () => {
    const curatorIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'curator'")
    const buyerIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'buyer'")
    const industryIdx = migration.indexOf("(NEW.raw_app_meta_data->>'role') = 'industry'")

    expect(curatorIdx).toBeGreaterThan(-1)
    expect(buyerIdx).toBeGreaterThan(curatorIdx)
    expect(industryIdx).toBeGreaterThan(buyerIdx)
    expect(gateIdx).toBeGreaterThan(industryIdx)

    const curatorReturnIdx = migration.indexOf('RETURN NEW;', curatorIdx)
    const buyerReturnIdx = migration.indexOf('RETURN NEW;', buyerIdx)
    expect(curatorReturnIdx).toBeGreaterThan(curatorIdx)
    expect(curatorReturnIdx).toBeLessThan(buyerIdx)
    expect(buyerReturnIdx).toBeGreaterThan(buyerIdx)
    expect(buyerReturnIdx).toBeLessThan(industryIdx)
  })

  it('raises with ERRCODE P0001 so the whole transaction (incl. the auth.users insert) rolls back', () => {
    expect(migration).toContain("RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';")
  })

  it('the accept-marking UPDATE is exception-isolated and runs after the gate but before the existing inserts', () => {
    const updateIdx = migration.indexOf('UPDATE public.artist_invites', gateIdx)
    const artistInsertIdx = migration.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')

    expect(updateIdx).toBeGreaterThan(gateIdx)
    expect(updateIdx).toBeLessThan(artistInsertIdx)

    const wrappingSlice = migration.slice(gateIdx, artistInsertIdx)
    expect(wrappingSlice).toContain('BEGIN')
    expect(wrappingSlice).toContain('EXCEPTION WHEN OTHERS THEN')
  })

  it('claim_collaborators() is unchanged and still runs after the artist-branch inserts', () => {
    const artistInsertIdx = migration.indexOf('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
    const claimIdx = migration.indexOf('public.claim_collaborators(NEW.id, NEW.email)')
    expect(claimIdx).toBeGreaterThan(artistInsertIdx)
  })

  it('header documents artist-branch-only scope and the human-gated push', () => {
    expect(migration).toMatch(/human-gated/i)
    expect(migration).toMatch(/supabase db push/i)
    expect(migration).toMatch(/artist branch only|default \(artist\) branch only|artist branch below/i)
  })

  // ── TWIN-PARITY (RESEARCH Pitfall 3) ────────────────────────────────────
  // Jest cannot execute PL/pgSQL, so this is a text-structural assertion —
  // the SQL gate must structurally cover the same allowlist sources
  // isArtistEmailAllowed() checks in lib/invites/allowlist.ts, anchored to
  // the SAME shared fixture table lib/invites/allowlist.test.ts drives the
  // TS side against.
  describe.each(INVITE_ALLOWLIST_SCENARIOS)('twin-parity — $name', scenario => {
    it('the SQL predicate structurally covers the allowlist source(s) this scenario exercises', () => {
      expect(migration).toContain('FROM public.collaborators WHERE LOWER(email) = LOWER(NEW.email)')
      expect(migration).toContain('FROM public.artist_invites')
      expect(migration).toContain("status = 'pending'")
      expect(migration).toContain('token_expires_at IS NULL OR token_expires_at > NOW()')

      const admittedByCollaborator = scenario.collaboratorEmails.length > 0 && scenario.expected
      const admittedByInvite =
        scenario.inviteRows.some(r => r.status === 'pending' && !r.expired) && scenario.expected

      if (admittedByCollaborator) {
        // The collaborators EXISTS clause is what this scenario relies on.
        expect(migration).toContain('EXISTS (\n    SELECT 1 FROM public.collaborators')
      }
      if (admittedByInvite) {
        // The pending + non-expired artist_invites EXISTS clause is what
        // this scenario relies on.
        expect(migration).toContain("AND status = 'pending'")
      }
      if (!scenario.expected) {
        // Denied scenarios must NOT be admissible via a bare existence
        // check with no status/expiry filter — the predicate must filter.
        expect(migration).toContain('AND (token_expires_at IS NULL OR token_expires_at > NOW())')
      }
    })
  })
})
