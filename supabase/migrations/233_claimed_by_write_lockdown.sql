-- ============================================================
-- Funūn — closing Pass 6 C-1: collaborators.claimed_by identity forgery.
-- Migration 233: collaborators_guard_claimed_by_write — a BEFORE INSERT OR
--                 UPDATE trigger on public.collaborators making claimed_by
--                 client-immutable, plus one added line each in the two
--                 legitimate writer functions that still need to set it.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (the standing convention since migrations 058/062/063/064/066/067/070/078,
-- restated as recently as 231's own header). This file is authored and
-- text-tested (__tests__/migration-233-claimed-by-write-lockdown.test.ts)
-- but must not be applied automatically. The live push and the OWNER-RUN
-- BEHAVIORAL VERIFICATION block at the end of this file are the owner's
-- step, tracked as a todo
-- (.planning/todos/pending/261005-cbl-push-and-verify-migration-233.md).
-- Do NOT edit migrations 001-232 (already landed or reserved).
--
-- COORDINATION NOTE: migration 232 is reserved by the merged `261005-rwl`
-- plan (PR #164, supabase/migrations/232_rights_ledger_write_lockdown.sql)
-- but not yet executed as of this writing — re-verified at the top of this
-- migration's own planning/execution session (`ls supabase/migrations/ |
-- sort -V | tail -3` -> 229, 230, 231; `find supabase/migrations
-- .planning/quick -iname "232_*.sql"` -> no results). This migration takes
-- 233 to avoid colliding with that in-flight work.
-- ============================================================
--
-- ─── THE DEFECT (Pass 6 C-1, .planning/deliberations/2026-10-05-pass-6-
-- identity-access-review.md) ───────────────────────────────────────────
-- collaborators.claimed_by is documented (079:24-25, 136:290-291) as "the
-- ONLY verified-identity signal in this codebase," and three separate
-- SECURITY DEFINER trigger chains trust it completely: sync_project_
-- membership_for_sheet() (079) grants a project_members viewer row,
-- sync_work_membership_on_claim() (136) backfills work_members.user_id, and
-- accept_collaborator_invites_on_claim() (157) marks the row's
-- collaborator_invites accepted and stamps accepted_user_id. In reality,
-- migration 018's implicit FOR ALL "Users manage own collaborators" policy
-- (018:30-31) checks only `auth.uid() = user_id` — never column-scoped —
-- and `collaborators` has carried Supabase's ambient table-level
-- INSERT/UPDATE grant since that same migration created it with zero
-- GRANT/REVOKE statements in that block (confirmed by a full-corpus
-- `grep -n "GRANT\|REVOKE" supabase/migrations/*.sql` naming `collaborators`
-- as a bare table target: zero results). A roster owner who knows another
-- Funūn member's UUID can set claimed_by to that UUID directly via
-- PostgREST — on an UPDATE of an existing row, or on INSERT of a brand-new
-- one (migration 179's auto-link trigger only ever fills a NULL claimed_by,
-- so a client-supplied non-null value at INSERT time passes through
-- untouched today) — and make the system behave as if that member claimed
-- the roster row themselves.
--
-- ─── WHY A TRIGGER, NOT A REVOKE ──────────────────────────────────────
-- Migration 231's own post-mortem on tracks.work_id is the precedent: a
-- column-level REVOKE only works where a table-level REVOKE already
-- stripped the ambient grant first (migration 040's precedent for
-- user_profiles/stripe_connect_account_id, reused successfully by
-- migration 084). `collaborators` has never had any such table-level
-- REVOKE issued — the identical precondition that made migration 230's
-- column REVOKE on tracks.work_id a proven silent no-op, corrected by
-- migration 231. A column REVOKE here would be the same silent no-op. A
-- BEFORE INSERT OR UPDATE trigger's protection does not depend on
-- collaborators' grant state at all, so it cannot rot the way a
-- column-REVOKE approach already has once for this exact class of defect.
--
-- ─── WHY A GUC, NOT auth.role() ALONE ─────────────────────────────────
-- Migration 231's `auth.role()` idiom (NULL for a direct database session,
-- 'service_role' for a service-authenticated RPC) is necessary but not
-- sufficient here, because claimed_by has TWO legitimate non-privileged
-- writers today, and one of them — public.link_existing_member_
-- collaborator() (migration 179) — runs as part of an ordinary roster
-- owner's OWN authenticated INSERT or UPDATE OF email, where auth.role()
-- reads 'authenticated', structurally identical to the forgery this
-- migration exists to stop. This migration extends migration 145's
-- transaction-local GUC mechanism (the funun.lyric_text_write precedent,
-- 145:131,178,269,363) with a new GUC, funun.collaborators_claimed_by_write,
-- sentinel value the literal string 'verified_claim', set via
-- `PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);`
-- (transaction-local, matching 145's own TRUE third argument) immediately
-- before the one statement in each of the two legitimate writers that
-- actually assigns claimed_by: public.claim_collaborators(p_user_id, p_email)
-- (currently defined by migration 076, byte-for-byte structurally identical
-- to 072's body, re-pointed to user_profiles) and public.
-- link_existing_member_collaborator() (179). claim_collaborators()'s only
-- live RPC path already runs under service_role (migration 075's EXECUTE
-- lockdown, re-verified this session at 075:46-49), so the GUC there is
-- deliberate defense-in-depth, not strictly required by the currently-live
-- call graph — added so this guard's correctness does not depend on that
-- EXECUTE grant never being loosened again in the future.
--
-- ─── TRIGGER ORDERING, STATED AS A VERIFIED FACT ──────────────────────
-- This guard's correctness does not depend on firing before or after
-- migration 179's collaborators_link_existing_member trigger — both the
-- GUC and the auth.role()/NULL privilege check work regardless of
-- trigger-name alphabetical ordering. But naming the new trigger
-- collaborators_guard_claimed_by_write deliberately sorts alphabetically
-- before collaborators_link_existing_member ('g' < 'l'), so in the common
-- case this guard fires first, sees the client's actually-submitted
-- claimed_by value (still NULL for every verified legitimate insert/
-- email-update path), and 179's trigger makes its auto-link assignment
-- afterward with no re-check needed. Migration 066's collaborators_
-- claimed_implies_confirmed_trigger (BEFORE INSERT OR UPDATE, unconditional)
-- only ever READS NEW.claimed_by to set status; it never writes the
-- column, so its firing order relative to this new guard is immaterial by
-- construction.
--
-- ─── WHAT THIS DOES NOT TOUCH ──────────────────────────────────────────
-- Migrations 001-232 are byte-for-byte unedited. This migration redefines
-- exactly two existing functions (Parts B and C below), each by exactly one
-- added line, and adds one new guard function/trigger pair (Part A). Every
-- other collaborators column — legal_name, pro, ipi, publisher, mlc_id,
-- soundexchange_id, mailing_address, email, phone, administrator, status,
-- is_favorite, archived_at (lib/collaborators/index.ts:6-32's
-- COLLABORATOR_EDITABLE_FIELDS) — remains exactly as writable by the
-- roster owner as it was before this migration, including on an
-- already-claimed row. That is a real, confirmed, separate exposure and is
-- NOT fixed here — this migration is scoped to the identity-forgery column
-- named in Pass 6 C-1 only. collaborator_invites' own inviter-held implicit
-- FOR ALL over accepted_user_id/accepted_at is a different table with a
-- different writer set and is recommended as its own follow-up, not
-- bundled here. This migration issues zero GRANT/REVOKE statements against
-- the collaborators table itself.
-- ============================================================

-- ─── PART A — the guard function and trigger ──────────────────────────
-- SECURITY INVOKER, deliberately — matching migration 231's own posture
-- for its trigger-adjacent guard: no elevated access is needed here, the
-- function only inspects NEW/OLD, the calling connection's own
-- auth.role(), and a transaction-local GUC, so it runs with exactly the
-- privileges the trigger's firing context already has.
CREATE OR REPLACE FUNCTION public.collaborators_guard_claimed_by_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- auth.role() reads the request.jwt.claims session GUC -- a property of
  -- the CONNECTION, not of SECURITY DEFINER's current_user switch.
  -- current_user would instead see claim_collaborators()'s or
  -- link_existing_member_collaborator()'s OWNER during either function's
  -- call, never the caller -- using it here would make this guard blind to
  -- both legitimate writers it must allow through. Matches migration 231's
  -- identical reasoning for tracks_guard_work_id_write().
  v_role TEXT := (SELECT auth.role());
  -- NULL covers a direct database session (the owner via `supabase db
  -- push`, the Supabase SQL editor, a migration's own backfill) -- no
  -- request.jwt.claims exists there, so auth.role() returns NULL. That is
  -- the same pre-existing admin trust tier this table's owner-run
  -- migrations already operate at, not a new privilege introduced by this
  -- guard. 'service_role' covers claim_collaborators()'s only live RPC
  -- path (app/api/claim-collaborators/route.ts:31-32's completeSignupClaim,
  -- via the service client) and any future service-role-mediated write.
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- The transaction-local GUC this migration's own two redefined writer
  -- functions set immediately before their one claimed_by-touching
  -- statement (Parts B and C below). NULLIF(..., '') treats an unset or
  -- empty-string setting identically to "not verified" -- current_setting's
  -- own missing-GUC behavior with the TRUE (no-error) flag returns '', not
  -- NULL, so this normalization is required for the comparison below to be
  -- correct rather than accidentally permissive.
  v_write_mode TEXT := NULLIF(current_setting('funun.collaborators_claimed_by_write', TRUE), '');
  v_verified_claim BOOLEAN := v_write_mode = 'verified_claim';
  -- Mirrors migration 231's exact v_changing shape for both INSERT and
  -- UPDATE: a forged write can arrive either as a brand-new row already
  -- carrying someone else's id, or as an UPDATE naming the column.
  v_changing BOOLEAN := (TG_OP = 'INSERT' AND NEW.claimed_by IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.claimed_by IS DISTINCT FROM OLD.claimed_by);
BEGIN
  IF v_changing AND NOT v_privileged AND NOT v_verified_claim THEN
    RAISE EXCEPTION 'collaborators.claimed_by can only be written by a verified claim path (claim_collaborators or link_existing_member_collaborator), the service role, or a direct database session'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.collaborators_guard_claimed_by_write() IS
  'BEFORE INSERT OR UPDATE guard on public.collaborators (migration 233) rejecting any client write to claimed_by unless auth.role() is NULL (direct database session), ''service_role'', or the transaction-local GUC funun.collaborators_claimed_by_write is set to ''verified_claim'' by one of claim_collaborators() or link_existing_member_collaborator(). Closes Pass 6 C-1: a roster owner could previously forge claimed_by to another member''s UUID via direct PostgREST INSERT or UPDATE, which three SECURITY DEFINER chains (079, 136, 157) would then trust as a real identity claim. See migration 233''s header for the full mechanism and why auth.role() alone is insufficient for this column.';

-- Trigger name deliberately sorts alphabetically before
-- collaborators_link_existing_member (179): 'g' < 'l'. In the ordinary
-- INSERT/UPDATE-OF-email case this guard therefore fires first and sees
-- the client's actually-submitted claimed_by (still NULL for every
-- verified legitimate path), with 179's auto-link assignment happening
-- afterward needing no re-check. The GUC mechanism makes this guard
-- correct regardless of that ordering, as a deliberate second, independent
-- layer -- not a reliance on alphabetical naming alone.
DROP TRIGGER IF EXISTS collaborators_guard_claimed_by_write ON public.collaborators;

CREATE TRIGGER collaborators_guard_claimed_by_write
  BEFORE INSERT OR UPDATE ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.collaborators_guard_claimed_by_write();

COMMENT ON TRIGGER collaborators_guard_claimed_by_write ON public.collaborators IS
  'Enforces that claimed_by may only be written by claim_collaborators(), link_existing_member_collaborator(), the service role, or a direct database session -- migration 233''s closure of Pass 6 C-1''s identity-forgery finding. Protection does not depend on collaborators'' grant state, so it cannot rot the way migration 230''s column-REVOKE approach already did for a different table.';

-- Trigger-internal only -- matching migrations 079/136/145's posture
-- (stricter than 231's, which omitted this step; included here as the more
-- common convention in this corpus). No app code calls this function
-- directly; it is only meaningful as a row-level trigger body.
REVOKE EXECUTE ON FUNCTION public.collaborators_guard_claimed_by_write() FROM PUBLIC, anon, authenticated;

-- ─── PART B — claim_collaborators(): one added line, byte-for-byte
-- otherwise identical to migration 076's live body ─────────────────────
-- CREATE OR REPLACE FUNCTION preserves migration 075's service_role-only
-- EXECUTE lockdown automatically (re-verified this session at 075:46-49)
-- -- no new GRANT EXECUTE line is added here, matching 076's own stated
-- precedent for the identical situation (076:325-329).
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro         TEXT;
  v_ipi         TEXT;
  v_publisher   TEXT;
  v_phone       TEXT;
  v_address     JSONB;
  v_prefill     JSONB;
  v_winner      RECORD;
  v_source_name TEXT;
BEGIN
  -- Added by migration 233: signal to collaborators_guard_claimed_by_write
  -- that the UPDATE immediately below is this verified claim path, not a
  -- client-side forgery. Transaction-local (TRUE), matching migration
  -- 145's identical funun.lyric_text_write precedent.
  PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);

  -- Claim all matching collaborator rows (idempotent guard: claimed_by IS NULL)
  UPDATE public.collaborators
    SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    -- Forward fill (unchanged behavior): profile -> claimed collaborator
    -- rows, additive only (COALESCE never overwrites an existing value).
    UPDATE public.collaborators
      SET pro             = COALESCE(pro, v_pro),
          ipi             = COALESCE(ipi, v_ipi),
          publisher       = COALESCE(publisher, v_publisher),
          phone           = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;

  -- ─── R2: reverse pre-fill (claimed records -> this user's own profile) ──
  -- For each canonical rights field that is semantic-blank on this user's
  -- user_profiles row, and whose claim_prefill entry (if any) is not
  -- already confirmed, pre-fill it from the most-recently-updated claimed
  -- collaborators row carrying a non-blank value, and record an
  -- unconfirmed provenance entry. Re-reads current state fresh (the
  -- forward fill above only touched collaborators rows, never
  -- user_profiles).
  SELECT pro, ipi, publisher, contact_phone, mailing_address, claim_prefill
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address, v_prefill
    FROM public.user_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    v_prefill := COALESCE(v_prefill, '{}'::jsonb);

    -- pro
    IF COALESCE(TRIM(v_pro), '') = ''
       AND COALESCE((v_prefill -> 'pro' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.pro, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id AND COALESCE(TRIM(c.pro), '') <> ''
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.user_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['pro'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.user_profiles SET pro = v_winner.pro WHERE id = p_user_id;
      END IF;
    END IF;

    -- ipi
    IF COALESCE(TRIM(v_ipi), '') = ''
       AND COALESCE((v_prefill -> 'ipi' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.ipi, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id AND COALESCE(TRIM(c.ipi), '') <> ''
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.user_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['ipi'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.user_profiles SET ipi = v_winner.ipi WHERE id = p_user_id;
      END IF;
    END IF;

    -- publisher
    IF COALESCE(TRIM(v_publisher), '') = ''
       AND COALESCE((v_prefill -> 'publisher' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.publisher, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id AND COALESCE(TRIM(c.publisher), '') <> ''
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.user_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['publisher'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.user_profiles SET publisher = v_winner.publisher WHERE id = p_user_id;
      END IF;
    END IF;

    -- contact_phone (source column on collaborators is `phone`)
    IF COALESCE(TRIM(v_phone), '') = ''
       AND COALESCE((v_prefill -> 'contact_phone' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.phone, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id AND COALESCE(TRIM(c.phone), '') <> ''
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.user_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['contact_phone'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.user_profiles SET contact_phone = v_winner.phone WHERE id = p_user_id;
      END IF;
    END IF;

    -- mailing_address (json-kind blank check: IS NULL OR = '{}'::jsonb,
    -- never IS NULL alone -- this column defaults to '{}'::jsonb)
    IF (v_address IS NULL OR v_address = '{}'::jsonb)
       AND COALESCE((v_prefill -> 'mailing_address' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.mailing_address, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id
          AND c.mailing_address IS NOT NULL AND c.mailing_address <> '{}'::jsonb
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.user_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['mailing_address'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.user_profiles SET mailing_address = v_winner.mailing_address WHERE id = p_user_id;
      END IF;
    END IF;

    UPDATE public.user_profiles SET claim_prefill = v_prefill WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ─── PART C — link_existing_member_collaborator(): one added line,
-- byte-for-byte otherwise identical to migration 179's body ─────────────
-- CREATE OR REPLACE FUNCTION preserves migration 179's own
-- `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (179:48-49)
-- automatically -- no grant statement is reissued here. Migration 179's
-- own `CREATE TRIGGER collaborators_link_existing_member` statement is not
-- reproduced, dropped, or recreated by this migration -- that trigger
-- continues pointing at this same function name, which now carries the
-- new line below.
CREATE OR REPLACE FUNCTION public.link_existing_member_collaborator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.claimed_by IS NULL
     AND NEW.email IS NOT NULL
     AND pg_catalog.btrim(NEW.email) <> '' THEN
    -- Added by migration 233: signal to collaborators_guard_claimed_by_write
    -- that the assignment immediately below is this verified claim path,
    -- not a client-side forgery. This roster owner's own authenticated
    -- session is the exact case auth.role() alone cannot distinguish from
    -- the forgery this migration stops -- the GUC is what makes this
    -- legitimate auto-link path still work once the guard trigger is live.
    PERFORM set_config('funun.collaborators_claimed_by_write', 'verified_claim', TRUE);

    SELECT account.id
      INTO NEW.claimed_by
      FROM auth.users account
      JOIN public.user_profiles member_profile ON member_profile.id = account.id
     WHERE account.email_confirmed_at IS NOT NULL
       AND pg_catalog.lower(pg_catalog.btrim(account.email)) =
           pg_catalog.lower(pg_catalog.btrim(NEW.email))
     ORDER BY account.created_at ASC
     LIMIT 1;

    -- Migration 066's independent claimed=>confirmed trigger may have
    -- already run earlier in the same BEFORE-trigger sequence, so enforce
    -- the invariant here as well when this function establishes the claim.
    IF NEW.claimed_by IS NOT NULL THEN
      NEW.status := 'confirmed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── PART D — correct the two false "exclusively" comments, within what
-- the live database can actually carry ─────────────────────────────────
-- 079:24-25 and 136:290-291 are plain `--` file-header prose inside
-- already-landed migrations (this project's standing convention: migrations
-- 001-232 are not edited), and prose comments are never stored in the
-- Postgres catalog, so there is no live artifact for this migration to
-- overwrite for those two lines specifically. What CAN be corrected is each
-- function's actual stored COMMENT ON FUNCTION (079:139-140, 136:332-333),
-- which -- checked this session -- does not itself say "exclusively," but
-- also does not yet name the second writer or this migration's enforcement.
-- Reissuing both below is what makes "the ONLY verified-identity signal"
-- true as a security property, not only as a historical description.
COMMENT ON FUNCTION public.sync_project_membership_for_sheet() IS
  'Auto-grants a viewer project_members row when a party on a project-linked, non-draft split sheet resolves through collaborator_id to a collaborators row whose claimed_by is set (the ONLY verified-identity signal in this codebase -- never the party table''s own dead, never-written user_id column). Branches on TG_TABLE_NAME so one function serves all three event orderings (party added, sheet leaves draft/gets linked, collaborator claims). SECURITY DEFINER so it can write project_members on behalf of a different user than whoever triggered it; every write is scoped by server-owned ids off the row that changed. Trigger-internal only, never a client-invoked RPC. claimed_by is written by exactly two functions, claim_collaborators() and link_existing_member_collaborator() (migration 179), both column-write-locked since migration 233''s collaborators_guard_claimed_by_write trigger -- which is what makes "the ONLY verified-identity signal" true as a security property, not only as a historical description.';

COMMENT ON FUNCTION public.sync_work_membership_on_claim() IS
  'Backfills work_members.user_id when a collaborator claims their roster row at signup. Keys solely off collaborators.claimed_by -- the ONLY verified-identity signal in this codebase (set by claim_collaborators() from the signing-up user''s Supabase-Auth-verified account email), never off split_sheet_parties.user_id, which is read in three places and written nowhere. SECURITY DEFINER so it can write work_members on behalf of a different user than whoever triggered it, and because migration 136 revokes all client writes on that table by design. Idempotent via the user_id IS NULL guard. Trigger-internal only, never a client-invoked RPC. claimed_by is written by exactly two functions, claim_collaborators() and link_existing_member_collaborator() (migration 179), both column-write-locked since migration 233''s collaborators_guard_claimed_by_write trigger -- which is what makes "the ONLY verified-identity signal" true as a security property, not only as a historical description.';

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- OWNER-RUN BEHAVIORAL VERIFICATION
--
-- This migration's own Jest test
-- (__tests__/migration-233-claimed-by-write-lockdown.test.ts) proves the SQL
-- below was WRITTEN with the intended guards. It does NOT and CANNOT prove
-- Postgres ENFORCES them -- migration 230 shipped a passing text-lock test
-- on SQL that enforced nothing. This migration issues zero GRANT/REVOKE
-- statements against the collaborators table itself, so there is no
-- grant-state re-check analogous to migration 231's -- the four
-- self-contained, non-destructive probes below are the ENTIRE proof. Run
-- them by hand, once, in the Supabase SQL editor, AFTER pushing this
-- migration. Each requires at least one real roster owner, one real
-- unclaimed collaborator row they own, and one real confirmed Member
-- account (not the roster owner) whose email the probe can reference.
-- Every probe ends in ROLLBACK -- production is unchanged after each one.
--
-- (a) FORGED UPDATE -- MUST RAISE 42501.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<ROSTER_OWNER_USER_ID>')::text, true);
--   SET ROLE authenticated;
--
--   SAVEPOINT probe_1;
--   UPDATE public.collaborators
--   SET claimed_by = '<OTHER_REAL_MEMBER_USER_ID>'
--   WHERE id = '<YOUR_UNCLAIMED_COLLABORATOR_ID>' AND user_id = '<ROSTER_OWNER_USER_ID>';
--   -- Expect: ERROR, SQLSTATE 42501.
--   ROLLBACK TO SAVEPOINT probe_1;
--
-- (b) FORGED INSERT -- MUST RAISE 42501.
--
--   SAVEPOINT probe_2;
--   INSERT INTO public.collaborators (user_id, name, email, claimed_by)
--   VALUES ('<ROSTER_OWNER_USER_ID>', 'trigger probe', 'probe-forged@example.com', '<OTHER_REAL_MEMBER_USER_ID>');
--   -- Expect: ERROR, SQLSTATE 42501.
--   ROLLBACK TO SAVEPOINT probe_2;
--
-- (c) LEGITIMATE 179 AUTO-LINK -- MUST SUCCEED, AND MUST SET claimed_by.
--
--   SAVEPOINT probe_3;
--   INSERT INTO public.collaborators (user_id, name, email)
--   VALUES ('<ROSTER_OWNER_USER_ID>', 'trigger probe auto-link', '<OTHER_REAL_MEMBER_CONFIRMED_EMAIL>')
--   RETURNING id, claimed_by;
--   -- Expect: success, and the returned claimed_by equals
--   -- <OTHER_REAL_MEMBER_USER_ID> -- proving the GUC-gated bypass did not
--   -- break migration 179's legitimate auto-link.
--   ROLLBACK TO SAVEPOINT probe_3;
--
--   RESET ROLE;
--
-- (d) LEGITIMATE claim_collaborators() PATH -- MUST SUCCEED.
--
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
--   SET ROLE service_role;
--
--   -- On a fresh unclaimed collaborator row whose email matches
--   -- <SOME_TEST_USER_EMAIL>:
--   SELECT public.claim_collaborators('<SOME_TEST_USER_ID>', '<SOME_TEST_USER_EMAIL>');
--   -- Expect: no exception.
--   SELECT claimed_by FROM public.collaborators WHERE id = '<THAT_ROW_ID>';
--   -- Expect: equals <SOME_TEST_USER_ID>.
--
--   RESET ROLE;
--   ROLLBACK;
--   -- Discards the entire probe set. Production is unchanged after this line.
--
-- If (a) or (b) does NOT raise 42501, or (c) or (d) fails, this migration
-- did not do what it claims and must not be treated as applied correctly.
-- ============================================================
