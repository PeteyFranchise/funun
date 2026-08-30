import { readFileSync } from 'fs'
import path from 'path'

// ─── migration 133 — the Phase 36 handle identity database layer ────────────
// Text-lock + structural test, in the same style as
// __tests__/migration-105-gate.test.ts (readFileSync + index slicing +
// normalized-whitespace branch parity). Migration 133 is human-gated: it is
// never pushed by an agent, so this file IS the pre-push review evidence.
//
// The two load-bearing structural proofs here are ORDERING proofs, and each
// one corresponds to a defect that would otherwise be invisible in review:
//
//   1. In check_handle_not_reserved(), the TG_OP test must appear BEFORE the
//      first reference to the OLD row. Migration 037 dereferenced OLD
//      unconditionally, which is NULL on an INSERT — so the guard silently
//      never fired on the path Phase 36 writes on (D-06, a live hole).
//
//   2. In handle_new_user(), the invite gate's not_invited raise must appear
//      BEFORE the nested unique_violation/raise_exception catch. Both carry
//      SQLSTATE P0001; the gate is only safe from the catch because it aborts
//      the trigger earlier in the same function (D-15 vs the invite gate).

const migration133 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/133_handle_identity.sql'),
  'utf8'
)
const migration105 = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/105_artist_gate_intent_id_exemption.sql'),
  'utf8'
)

// Executable SQL with every `--` comment line stripped, so "the migration does
// not do X" assertions cannot be defeated (or falsely tripped) by prose.
const sqlOnly = migration133
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

// Copied (not imported — they are not exported) from migration-105-gate.test.ts.
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// The header's prose is hard-wrapped, so a sentence that documents a WHY is
// split across `--` lines. Unwrap it before asserting on the wording.
const commentProse = normalizeWhitespace(
  migration133
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('--'))
    .map(line => line.replace(/^--\s?/, ''))
    .join(' ')
)

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

// ─── guard function body ────────────────────────────────────────────────────
const guardStart = migration133.indexOf(
  'CREATE OR REPLACE FUNCTION public.check_handle_not_reserved()'
)
const guardEnd = migration133.indexOf('$$;', guardStart)
const guardBody = migration133.slice(guardStart, guardEnd)

// ─── handle_new_user() body ─────────────────────────────────────────────────
const trigStart = migration133.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user()')
const trigEnd = migration133.indexOf('$$ LANGUAGE plpgsql SECURITY DEFINER;', trigStart)
const handleNewUserBody = migration133.slice(trigStart, trigEnd)

const NESTED_CATCH = 'EXCEPTION WHEN unique_violation OR raise_exception THEN'
const gateIdx = migration133.indexOf("RAISE EXCEPTION 'not_invited'", trigStart)
const catchIdx = migration133.indexOf(NESTED_CATCH, trigStart)

// ─── resolver body ──────────────────────────────────────────────────────────
const resolverStart = migration133.indexOf(
  'CREATE OR REPLACE FUNCTION public.resolve_profile_by_handle(p_handle TEXT)'
)
const resolverEnd = migration133.indexOf('$$;', resolverStart)
const resolverBody = migration133.slice(resolverStart, resolverEnd)

describe('migration 133 — handle identity (Phase 36 database layer)', () => {
  // ══ D-06: the reserved-name guard finally covers the INSERT path ═════════
  describe('D-06 — check_handle_not_reserved() rewrite', () => {
    it('creates exactly one trigger, firing on INSERT as well as UPDATE OF handle', () => {
      const triggers = migration133.match(/CREATE TRIGGER/g) ?? []
      expect(triggers).toHaveLength(1)
      expect(migration133).toContain(
        'CREATE TRIGGER user_profiles_handle_not_reserved\n  BEFORE INSERT OR UPDATE OF handle ON public.user_profiles\n  FOR EACH ROW EXECUTE FUNCTION public.check_handle_not_reserved();'
      )
    })

    it('drops the pre-rename trigger NAME against the CURRENT table — migration 076 was an OID-preserving rename, so public.artist_profiles no longer exists and naming it would fail the push', () => {
      expect(migration133).toContain(
        'DROP TRIGGER IF EXISTS artist_profiles_handle_not_reserved ON public.user_profiles;'
      )
      expect(migration133).not.toContain('public.artist_profiles')
    })

    it('keeps SECURITY DEFINER + the empty search_path byte-for-byte from migration 037 — dropping either would silently disarm the guard against a direct PostgREST write', () => {
      expect(migration133).toContain(
        'CREATE OR REPLACE FUNCTION public.check_handle_not_reserved()\nRETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = \'\' AS $$'
      )
    })

    // THE assertion that would have caught the original defect.
    it('is OLD-safe: the TG_OP test appears BEFORE the first reference to the OLD row, so the INSERT path short-circuits before anything dereferences it', () => {
      const tgOpIdx = guardBody.indexOf("TG_OP = 'INSERT'")
      const oldIdx = guardBody.indexOf('OLD.handle')
      expect(tgOpIdx).toBeGreaterThan(-1)
      expect(oldIdx).toBeGreaterThan(-1)
      expect(tgOpIdx).toBeLessThan(oldIdx)
      expect(normalizeWhitespace(guardBody)).toContain(
        "IF NEW.handle IS NOT NULL AND (TG_OP = 'INSERT' OR lower(NEW.handle) IS DISTINCT FROM lower(OLD.handle)) THEN"
      )
    })

    it('raises plainly (no USING ERRCODE) so the rejection carries SQLSTATE P0001 — the condition the D-15 catch names', () => {
      const raises = guardBody.match(/RAISE EXCEPTION 'handle is reserved';/g) ?? []
      expect(raises).toHaveLength(2)
      expect(guardBody).not.toMatch(/RAISE EXCEPTION 'handle is reserved'\s+USING/)
    })
  })

  // ══ D-08: retired handles are permanently unclaimable ════════════════════
  describe('D-08 — retired handles blocked by the same guard function', () => {
    it('checks BOTH reserved_handles and handle_history inside one function body (not a second trigger)', () => {
      expect(guardBody).toContain(
        'SELECT 1 FROM public.reserved_handles WHERE handle = lower(NEW.handle)'
      )
      expect(guardBody).toContain(
        'SELECT 1 FROM public.handle_history WHERE lower(old_handle) = lower(NEW.handle)'
      )
    })

    it('lowers both sides of every comparison (D-04 case-insensitive matching)', () => {
      // reserved_handles stores lowercased values, so only the incoming value
      // needs lowering there; handle_history preserves case, so both sides do.
      expect(guardBody).toContain('WHERE handle = lower(NEW.handle)')
      expect(guardBody).toContain('WHERE lower(old_handle) = lower(NEW.handle)')
    })

    it('assumption A1 — blocks a retired handle UNIVERSALLY, with no per-owner carve-out (the history check never references NEW.id)', () => {
      const historyIdx = guardBody.indexOf('public.handle_history')
      const historyRegion = guardBody.slice(
        historyIdx,
        guardBody.indexOf('END IF;', historyIdx) + 'END IF;'.length
      )
      expect(historyRegion).toContain('RAISE EXCEPTION')
      expect(historyRegion).not.toContain('NEW.id')
      expect(historyRegion).not.toMatch(/profile_id\s*(!=|<>)/)
    })
  })

  // ══ D-07 / D-04: handle_history under the zero-policy RLS doctrine ═══════
  describe('D-07 — handle_history table', () => {
    it('is created re-runnably with the documented shape', () => {
      expect(migration133).toContain('CREATE TABLE IF NOT EXISTS public.handle_history')
      expect(migration133).toContain('id          UUID PRIMARY KEY DEFAULT gen_random_uuid()')
      expect(migration133).toContain(
        'profile_id  UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE'
      )
      expect(migration133).toContain('old_handle  TEXT NOT NULL')
      expect(migration133).toContain('retired_at  TIMESTAMPTZ NOT NULL DEFAULT now()')
    })

    it('has a case-insensitive UNIQUE index on the lowered retired handle, mirroring migration 010', () => {
      expect(migration133).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS handle_history_old_handle_lower_uniq\n  ON public.handle_history (lower(old_handle));'
      )
      expect(migration133).toContain(
        'CREATE INDEX IF NOT EXISTS handle_history_profile_id_idx\n  ON public.handle_history (profile_id);'
      )
    })

    it('follows the zero-policy RLS + REVOKE doctrine — RLS on, no policy-creation statement ANYWHERE in the file, revoked from authenticated and anon', () => {
      expect(migration133).toContain(
        'ALTER TABLE public.handle_history ENABLE ROW LEVEL SECURITY;'
      )
      expect(migration133).toContain(
        'REVOKE SELECT, INSERT, UPDATE, DELETE ON public.handle_history FROM authenticated, anon;'
      )
      expect(migration133).toContain('REVOKE ALL ON public.handle_history FROM PUBLIC;')
      expect(migration133).not.toMatch(/CREATE POLICY/i)
    })

    it('never appears in a GRANT to authenticated or anon', () => {
      const grants = sqlOnly.match(/GRANT[^;]+;/gi) ?? []
      for (const grant of grants) {
        expect(grant).not.toContain('handle_history')
      }
    })
  })

  // ══ D-03 / D-15 / D-01: handle_new_user() ════════════════════════════════
  describe('handle_new_user() — the signup-chosen handle', () => {
    it('replaces the existing function rather than adding a differently-named one', () => {
      expect(migration133).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()')
      expect(migration133).toContain('$$ LANGUAGE plpgsql SECURITY DEFINER;')
    })

    // D-01: the dead curator branch was explicitly left alone; this proves it.
    it.each([
      ['curator', CURATOR_MARKER],
      ['buyer', BUYER_MARKER],
      ['staff', STAFF_MARKER],
      ['industry', INDUSTRY_MARKER],
    ])('%s branch is byte-faithful to migration 105 (no drift from a CREATE OR REPLACE rewrite)', (_name, marker) => {
      expect(normalizeWhitespace(extractBranch(migration133, marker))).toBe(
        normalizeWhitespace(extractBranch(migration105, marker))
      )
    })

    it('D-03: the default branch writes the handle carried in raw_user_meta_data, NULLIF/TRIM-guarded so absent or blank becomes NULL (making the admin-provisioned lanes a no-op)', () => {
      expect(migration133).toContain(
        "INSERT INTO public.user_profiles (id, handle)\n    VALUES (NEW.id, NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), ''));"
      )
    })

    it('D-15: the nested catch names EXACTLY unique_violation and raise_exception, exactly once — never WHEN OTHERS, which would report a broken column, a broken FK or an outage as a handle collision', () => {
      const occurrences = migration133.match(
        /EXCEPTION WHEN unique_violation OR raise_exception THEN/g
      ) ?? []
      expect(occurrences).toHaveLength(1)
      expect(catchIdx).toBeGreaterThan(-1)
      // The other EXCEPTION blocks in this function are the pre-existing
      // WHEN OTHERS ones (subscriptions, capability grant, invite accept,
      // collaborator claim) — the new one must not have joined them.
      const whenOthers = handleNewUserBody.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []
      expect(whenOthers).toHaveLength(4)
    })

    it('D-15 fallback inserts a NULL handle rather than aborting signUp', () => {
      const blockEnd = migration133.indexOf('END;', catchIdx)
      const recovery = migration133.slice(catchIdx, blockEnd)
      expect(recovery).toContain('INSERT INTO public.user_profiles (id) VALUES (NEW.id);')
    })

    // Ordering invariant — the invite gate cannot be swallowed by the catch.
    it('the not_invited raise fires BEFORE the nested catch is ever entered, so the catch cannot swallow the invite gate (both carry P0001)', () => {
      expect(gateIdx).toBeGreaterThan(-1)
      expect(catchIdx).toBeGreaterThan(gateIdx)
      expect(migration133).toContain(
        "RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';"
      )
    })

    // Scope invariant — the block wraps ONLY the user_profiles insert.
    it('the nested block wraps ONLY the single user_profiles INSERT — the subscriptions insert and the collaborator claim sit outside it', () => {
      const blockStart = migration133.lastIndexOf('BEGIN', catchIdx)
      const blockEnd = migration133.indexOf('END;', catchIdx) + 'END;'.length
      const block = migration133.slice(blockStart, blockEnd)

      const insertTargets = [...block.matchAll(/INSERT INTO (\S+)/g)].map(m => m[1])
      expect(insertTargets.length).toBeGreaterThan(0)
      expect(new Set(insertTargets)).toEqual(new Set(['public.user_profiles']))

      expect(block).not.toContain('public.subscriptions')
      expect(block).not.toContain('claim_collaborators')

      // ...and both of those really do still exist, after the block.
      const subsIdx = migration133.indexOf('INSERT INTO public.subscriptions', blockEnd)
      const claimIdx = migration133.indexOf(
        'public.claim_collaborators(NEW.id, NEW.email)',
        blockEnd
      )
      expect(subsIdx).toBeGreaterThan(blockEnd)
      expect(claimIdx).toBeGreaterThan(subsIdx)
    })

    it('documents the INSERT-time metadata asymmetry that makes D-03 possible (user_metadata visible, app_metadata / email_confirmed_at not)', () => {
      expect(commentProse).toMatch(/user_metadata IS visible/i)
      expect(migration133).toMatch(/email_confirmed_at/)
      expect(migration133).toMatch(/provisionIntent\.ts/)
    })
  })

  // ══ D-04 / D-07: the resolver ════════════════════════════════════════════
  describe('resolve_profile_by_handle()', () => {
    it('is STABLE SECURITY DEFINER with an empty search_path and the agreed return shape', () => {
      expect(migration133).toContain(
        'CREATE OR REPLACE FUNCTION public.resolve_profile_by_handle(p_handle TEXT)\nRETURNS TABLE (profile_id UUID, current_handle TEXT, redirected BOOLEAN)\nLANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = \'\' AS $$'
      )
    })

    it('resolves current handles first, then falls through to handle_history — both comparisons lowered on both sides (D-04)', () => {
      const currentIdx = resolverBody.indexOf('FROM public.user_profiles p')
      const historyIdx = resolverBody.indexOf('FROM public.handle_history h')
      expect(currentIdx).toBeGreaterThan(-1)
      expect(historyIdx).toBeGreaterThan(currentIdx)
      expect(resolverBody).toContain('WHERE lower(p.handle) = lower(p_handle)')
      expect(resolverBody).toContain('WHERE lower(h.old_handle) = lower(p_handle)')
      expect(resolverBody).toContain('IF FOUND THEN')
    })

    it('flags the retired-handle hit as a redirect and the live hit as not', () => {
      expect(resolverBody).toContain('SELECT p.id, p.handle, FALSE')
      expect(resolverBody).toContain('SELECT p.id, p.handle, TRUE')
    })

    it('returns at most one row from each lookup', () => {
      const limits = resolverBody.match(/LIMIT 1;/g) ?? []
      expect(limits).toHaveLength(2)
    })

    it('is REVOKEd from PUBLIC then granted EXECUTE to anon, authenticated and service_role', () => {
      const revokeIdx = migration133.indexOf(
        'REVOKE ALL ON FUNCTION public.resolve_profile_by_handle(TEXT) FROM PUBLIC;'
      )
      const grantIdx = migration133.indexOf(
        'GRANT EXECUTE ON FUNCTION public.resolve_profile_by_handle(TEXT) TO anon, authenticated, service_role;'
      )
      expect(revokeIdx).toBeGreaterThan(-1)
      expect(grantIdx).toBeGreaterThan(revokeIdx)
    })

    it('exists precisely so the page never has to pattern-match a handle — an underscore is both a legal handle character and a wildcard', () => {
      expect(commentProse).toMatch(/underscore is BOTH a legal handle character/i)
      expect(resolverBody.toUpperCase()).not.toMatch(/\bI?LIKE\b/)
    })
  })

  // ══ D-13: enforcement deliberately NOT landed here ═══════════════════════
  describe('D-13 — enforcement constraints are deferred, not forgotten', () => {
    it('adds no NOT NULL constraint on user_profiles.handle (it would fail on deploy against the existing handle-less rows)', () => {
      expect(sqlOnly).not.toMatch(/ALTER\s+COLUMN\s+handle\s+SET\s+NOT\s+NULL/i)
      expect(sqlOnly).not.toMatch(/ALTER\s+TABLE\s+public\.user_profiles/i)
    })

    it('adds no format CHECK constraint (it ships with plan 07 once the regex is final)', () => {
      expect(sqlOnly).not.toMatch(/CHECK\s*\(/i)
      expect(sqlOnly).not.toMatch(/ADD\s+CONSTRAINT/i)
    })
  })

  // ══ Housekeeping ═════════════════════════════════════════════════════════
  describe('housekeeping', () => {
    it('carries the standing human-gated push line', () => {
      expect(migration133).toMatch(/HUMAN-GATED/)
      expect(commentProse).toMatch(/never runs `supabase db push` from an agent/)
    })

    it('carries the RLS doctrine paragraph mirroring migrations 128-132', () => {
      expect(commentProse).toMatch(/RLS DOCTRINE \(MANDATORY/)
      expect(commentProse).toMatch(/ZERO policies/)
      expect(commentProse).toMatch(/No policy-creation statement appears anywhere in this file/)
    })

    it('explains WHY in the phase\'s own terms — D-06 as a live defect, D-08, D-15, D-04', () => {
      expect(migration133).toMatch(/D-06/)
      expect(migration133).toMatch(/D-08/)
      expect(migration133).toMatch(/D-15/)
      expect(migration133).toMatch(/D-04/)
      expect(commentProse).toMatch(/column-level UPDATE on handle/)
    })

    it('ends with the schema-cache reload as its last statement', () => {
      const lines = migration133
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('--'))
      expect(lines[lines.length - 1]).toBe("NOTIFY pgrst, 'reload schema';")
      const notifies = migration133.match(/NOTIFY pgrst, 'reload schema';/g) ?? []
      expect(notifies).toHaveLength(1)
    })
  })
})
