-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): DB-gate review fixes
-- Migration 099 — handle_new_user() staff exemption + specific-invite
-- consumption, artist_invites concurrency index, email_has_account() hardening
--
-- WHY: 27-CODEX-REVIEW.md (independent security review, 2026-08-09) found
-- three DB-layer issues in migrations 097/098 before either was pushed:
--
--   B1 (blocker) — migration 098 gates every handle_new_user() signup that
--   isn't role=curator/buyer/industry as an artist. lib/staff/
--   createStaffAccount.ts:31 sets app_metadata.staff_role (NOT role), so a
--   new staff account fell all the way through to the artist branch and hit
--   the invite gate — staff creation was broken by the gate the moment 098
--   went live, and docs/BREAK-GLASS.md's Layer 2 (the "create an ungated
--   admin account" escape hatch) would have been broken by the exact
--   scenario it exists to solve.
--
--   M3 (medium) — the gate's accept-marking UPDATE matched
--   `WHERE LOWER(email) = LOWER(NEW.email) AND status = 'pending'` with no
--   invite id — it would mark EVERY pending invite row for that email
--   accepted, not just the one that authorized the signup, and ran even
--   when admission came from a collaborators match with no invite involved
--   at all.
--
--   M4 (medium) — migration 097's `idx_artist_invites_email_lower` is a
--   plain (non-unique) index. Two concurrent "issue invite" requests (or an
--   issue racing a waitlist conversion) for the same email could each pass
--   their own SELECT-before-INSERT idempotency check and insert two
--   'pending' rows for the same email.
--
--   L1 (low) — migration 097's email_has_account() sets
--   `SET search_path = public` (non-empty). Per Postgres's own
--   recommendation for SECURITY DEFINER functions, a non-empty, mutable
--   search_path can be shadowed by same-named objects created earlier in
--   the effective path; `search_path = ''` + fully-qualified pg_catalog
--   calls closes that off. (auth.users is already schema-qualified.)
--
-- WHAT (this migration):
--   1. handle_new_user() is redefined AGAIN (CREATE OR REPLACE, same
--      pattern 086 used to fix-forward over 085): curator and buyer
--      branches are reproduced BYTE-FOR-BYTE from migration 098 (which
--      reproduced them byte-for-byte from 086) — see
--      __tests__/migration-099-gate.test.ts's structural comparison against
--      086 for the automated guard. A NEW staff branch is inserted between
--      buyer and industry: `raw_app_meta_data->>'staff_role' IS NOT NULL`
--      RETURNs NEW immediately, with NO user_profiles/subscriptions insert
--      (staff have no artist profile — createStaffAccount() writes the
--      funun_staff directory row itself via the service role). This is
--      positioned before the industry branch and, critically, before the
--      artist gate — a staff signup can never reach the "not_invited" raise
--      (B1 fix). The industry branch is reproduced from migration 086 (not
--      098 — 098 silently dropped two explanatory comments, D-18 and
--      INDUSTRY-01/06, from its industry branch; this migration restores
--      full byte-fidelity to 086, caught by
--      __tests__/migration-099-gate.test.ts's structural comparison, which
--      diffs whole branch bodies rather than checking marker substrings).
--   2. The artist (default) branch's gate now identifies the SPECIFIC
--      active (pending, unexpired) artist_invites row that authorizes the
--      signup (`v_invite_id`) rather than a blanket email match, and the
--      accept-marking UPDATE only ever touches that one row — a no-op when
--      admission came from a collaborators match instead (M3 fix).
--   3. A new partial UNIQUE index on LOWER(email) scoped to
--      `status = 'pending'` closes the concurrent-duplicate-invite race
--      (M4 fix). Scoped to `pending` only, not the fuller "pending AND
--      unexpired" gate predicate: Postgres index predicates must be
--      IMMUTABLE, and "unexpired" depends on NOW(), which is not immutable
--      (CREATE INDEX would reject a predicate referencing it). A
--      pending-only unique index is still the correct concurrency guard —
--      it is impossible for two rows to be simultaneously 'pending' for the
--      same email regardless of expiry, which is exactly the race this
--      closes. (Re-issuing an invite past expiry by rotating the existing
--      pending row rather than inserting a second one is tracked separately
--      as H1 — out of scope for this migration.)
--   4. email_has_account(text) is redefined with `search_path = ''` and
--      `pg_catalog.lower(...)` in place of the two bare `LOWER(...)` calls
--      (L1 fix). Behavior is unchanged; only the search_path hardening and
--      qualification differ from migration 097's definition.
--
-- migration 098 is left in place, unedited, as history — this migration's
-- CREATE OR REPLACE FUNCTION statements supersede it entirely once both are
-- eventually applied together. See __tests__/migration-098-gate.test.ts
-- (unchanged, still describes 098's frozen content) vs.
-- __tests__/migration-099-gate.test.ts (the current/authoritative parity +
-- structural test, mirrors the existing 085-test/086-test split).
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only, same as 097/098
-- — do NOT push this migration; it lands at Phase 27's blocking cutover
-- checkpoint (27-11), reviewed and run by the owner.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invite_id  UUID;
  v_is_invited BOOLEAN;
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Buyer branch (Phase 16, migration 080; restored by migration 086):
  -- buyers are a fully separate account type — RETURN NEW immediately,
  -- unchanged, unreachable by the staff branch or the artist gate below.
  IF (NEW.raw_app_meta_data->>'role') = 'buyer' THEN
    RETURN NEW;
  END IF;

  -- ── NEW: staff branch (Phase 25, migration 089; gate-exemption fix
  -- Phase 27 B1, 27-CODEX-REVIEW.md) ──────────────────────────────────────
  -- Staff are a fully separate principal type, identified by
  -- app_metadata.staff_role (set atomically inside
  -- service.auth.admin.createUser() by lib/staff/createStaffAccount.ts —
  -- never a post-insert UPDATE). Staff get NO user_profiles row and NO
  -- subscriptions row from this trigger: createStaffAccount() writes the
  -- funun_staff directory row itself via the service role immediately
  -- after createUser() returns, and a lingering user_profiles row would
  -- even make the account wrongly Green-Room-eligible. Positioned before
  -- the industry branch and, critically, before the artist gate further
  -- below — a staff signup can now NEVER reach the "not_invited" raise,
  -- closing B1 (previously, staff fell through to the artist branch and
  -- were rejected the moment migration 098 went live).
  IF (NEW.raw_app_meta_data->>'staff_role') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Industry branch (migration 039/076/085/086/098): unchanged, unreachable
  -- by the artist gate below — an industry member always RETURNs NEW before
  -- the default (artist) branch is ever reached.
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as artists.
    -- Nested exception-isolation so a secondary-insert failure cannot orphan
    -- the profile row just created above (mirrors CR-04 / migration 027).
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    -- INDUSTRY-01/06 (migration 085, retained here): single writer of the
    -- industry capability grant, atomic with the user_profiles insert above.
    -- source='signup' is an allowed value per migration 042's CHECK.
    BEGIN
      INSERT INTO public.capability_grants (profile_id, capability, status, role_slugs, source, decided_at)
      VALUES (
        NEW.id,
        'industry',
        'approved',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
        'signup',
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow grant-insert errors; account creation continues
    END;

    RETURN NEW;
  END IF;

  -- ── default / artist branch — ONLY branch the invite gate applies to ───

  -- ── artist self-serve invite gate (Phase 27, D-01/D-02/D-03) ───────────
  -- Fix M3 (27-CODEX-REVIEW.md): identify the SPECIFIC active (pending,
  -- unexpired) artist_invites row that authorizes this signup — never a
  -- blanket "every pending row for this email" match. ORDER BY created_at
  -- ASC + LIMIT 1 is defensive (the M4 partial unique index below prevents
  -- new duplicates, but is scoped to `pending` only, so this stays
  -- deterministic even against a stray pre-existing duplicate). If
  -- admission instead comes from a collaborators match, v_invite_id stays
  -- NULL and no invite row exists to consume.
  SELECT id INTO v_invite_id
    FROM public.artist_invites
   WHERE LOWER(email) = LOWER(NEW.email)
     AND status = 'pending'
     AND (token_expires_at IS NULL OR token_expires_at > NOW())
   ORDER BY created_at ASC
   LIMIT 1;

  v_is_invited := v_invite_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.collaborators WHERE LOWER(email) = LOWER(NEW.email)
  );

  IF NOT v_is_invited THEN
    -- Raising here rolls back the ENTIRE transaction, including the
    -- auth.users row Supabase's signUp() just inserted — no phantom
    -- account, no profile row, no enumeration leak from this layer.
    RAISE EXCEPTION 'not_invited' USING ERRCODE = 'P0001';
  END IF;

  -- Mark ONLY the specific invite row identified above accepted (M3) — a
  -- no-op when v_invite_id is NULL (admission via a collaborators match,
  -- no invite involved). Exception-isolated (mirrors the
  -- claim_collaborators() block further down) so a mark-accepted failure
  -- can never roll back an otherwise-legitimate signup that already passed
  -- the gate above.
  IF v_invite_id IS NOT NULL THEN
    BEGIN
      UPDATE public.artist_invites
        SET status = 'accepted', accepted_user_id = NEW.id, accepted_at = NOW()
        WHERE id = v_invite_id AND status = 'pending';
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow accept-marking errors; account creation continues
    END;
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Unchanged — by construction this now only ever runs for signups that
  -- passed the gate above. Nested exception block so a claim failure
  -- cannot orphan the new account.
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── M4 — concurrency-safe uniqueness on active invites ───────────────────
-- Fix M4 (27-CODEX-REVIEW.md): migration 097's idx_artist_invites_email_lower
-- is a plain (non-unique) index — kept as-is, it still serves general
-- lookups. This ADDITIONAL partial unique index closes the concurrent-
-- duplicate-pending-invite race: two simultaneous "issue invite" requests
-- (app/api/admin/artist-invites/route.ts) or an issue racing a waitlist
-- conversion can no longer both pass their own SELECT-before-INSERT
-- idempotency check and insert two 'pending' rows for the same email — the
-- second INSERT now fails at the database with a unique-violation instead.
-- See this migration's header comment for why the predicate is scoped to
-- `status = 'pending'` only (index predicates must be IMMUTABLE; NOW() is
-- not).
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_invites_pending_email_unique
  ON public.artist_invites (LOWER(email))
  WHERE status = 'pending';

COMMENT ON INDEX public.idx_artist_invites_pending_email_unique IS
  'Phase 27 (27-CODEX-REVIEW.md M4): at most one pending artist_invites row per lower(email), enforced at the database to close a concurrent-duplicate-insert race. Scoped to status=pending only (not also unexpired) because index predicates must be IMMUTABLE and NOW() is not — see migration 099''s header comment.';

-- ─── L1 — email_has_account() search_path hardening ───────────────────────
-- Fix L1 (27-CODEX-REVIEW.md): migration 097 set `search_path = public`
-- (non-empty, mutable) on this SECURITY DEFINER function. `search_path = ''`
-- + fully-qualified pg_catalog calls removes any possibility of a same-
-- named object earlier in an attacker-influenced search_path shadowing
-- `lower(...)` (auth.users was already schema-qualified). Behavior is
-- otherwise unchanged.
CREATE OR REPLACE FUNCTION public.email_has_account(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE pg_catalog.lower(email) = pg_catalog.lower(p_email)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.email_has_account(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.email_has_account(text) TO service_role;

COMMENT ON FUNCTION public.email_has_account(text) IS
  'Service-role-only existing-account lookup for the check-invite route (Phase 27). SECURITY DEFINER against auth.users; search_path = '''' + pg_catalog-qualified per 27-CODEX-REVIEW.md L1. EXECUTE revoked from PUBLIC/anon/authenticated, granted only to service_role — mirrors migration 075''s claim_collaborators() lockdown. Never exposed to PostgREST.';

-- Table/function privilege + index changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
