-- ============================================================
-- Funūn — Phase 36 (account-identity: mandatory @handle for User Accounts)
-- Migration 133: the whole database layer of the handle identity model —
--                handle_history, the reserved-name guard rewrite that
--                finally covers the INSERT path, the signup trigger's
--                atomic handle write inside a two-condition catch, and a
--                case-insensitive profile-by-handle resolver.
--
-- WHY (a) — D-06, A LIVE DEFECT, NOT A GAP. migration 037 attached
-- check_handle_not_reserved() as BEFORE UPDATE OF handle only, and wrote a
-- body that compares the lowered new handle against the lowered prior row
-- unconditionally. Phase 36's D-02/D-03 write the handle at INSERT, where
-- the prior row does not exist: that comparison evaluates to NULL and the
-- guard never fires. Worse, migration 040 already grants `authenticated`
-- column-level UPDATE on handle, so a raw PostgREST write bypasses every
-- application route — the trigger, not any route, is the ONLY backstop
-- against someone claiming one of the 58 reserved names (admin, api,
-- settings, signin, signup, vault, funun, …). As things stand today the
-- database would not stop a signup as @admin. Section 2 rewrites the body
-- (the trigger's event list alone is not the fix) so the INSERT path
-- short-circuits before anything dereferences the prior row.
--
-- WHY (b) — D-08. A handle that has been retired must stay unavailable
-- FOREVER, so a rebranding artist's abandoned name can never be picked up
-- and used to impersonate them. handle_history (section 1) is the record,
-- and the SAME guard function checks it (RESEARCH Pitfall 1: widening the
-- trigger's event list while leaving the history check to a second trigger
-- is exactly how D-08 ends up unenforced).
--
-- WHY (c) — D-15. Uniqueness is the database's job (D-14), so a handle CAN
-- be taken between the client's availability check and this INSERT. Today
-- that race would abort signUp entirely: the person has already committed a
-- password and gets a generic failure. Section 3 catches exactly that
-- condition (and the guard's reserved/retired rejection) and falls back to
-- a NULL handle, which Phase 36's hard gate collects on first sign-in. A
-- rare, brief handle-less window is the correct trade against costing
-- someone their account.
--
-- WHY (d) — D-04. Storage preserves case (@MayaReyes displays as typed);
-- uniqueness and every lookup compare lowered. The unique index from
-- migration 010 already does this for user_profiles; section 1 mirrors it
-- for handle_history and section 4 gives the public profile route an exact
-- lowered comparison it cannot express through PostgREST.
--
-- RLS DOCTRINE (MANDATORY — mirrors migration 128/129/130/131/132 exactly):
-- every new table gets ENABLE ROW LEVEL SECURITY with ZERO policies, plus
-- a full REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated,
-- anon. An RLS-enabled table with zero policies denies ALL row access to
-- authenticated/anon by construction — combined with the REVOKE,
-- handle_history is reachable ONLY via the service role (the handle-change
-- route that writes it) and via the SECURITY DEFINER resolver in section 4,
-- which returns a resolved profile id rather than any history row. No
-- policy-creation statement appears anywhere in this file. No new column is
-- added to any authenticated GRANT.
--
-- NOT IN THIS FILE, DELIBERATELY: no NOT NULL on user_profiles.handle and no
-- format CHECK constraint. NOT NULL cannot land until every existing row is
-- backfilled (D-13 — it would fail on deploy against the ~8 handle-less
-- rows), and the format constraint ships with it once the regex is final and
-- agrees byte-for-byte with the application validator.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/27/28/31.2's standing convention). Draft +
-- text-tested only (__tests__/migration-133.test.ts); the owner reviews and
-- pushes via `supabase db push` against prod at the 36-02 Task 3 blocking
-- checkpoint, BEFORE any wave-2 plan runs. Do NOT edit migrations 001-132
-- (already landed).
-- ============================================================

-- ─── (1) handle_history — retired handles, service-role only (D-07/D-08) ──
-- Written when someone changes their handle: one row per retirement, so an
-- already-shared /u/<old-handle> link keeps resolving (section 4) and the
-- retired name stays permanently unclaimable (section 2).
CREATE TABLE IF NOT EXISTS public.handle_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  old_handle  TEXT NOT NULL,
  retired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness, mirroring migration 010's
-- artist_profiles_handle_lower_uniq on lower(handle) exactly: D-04's casing
-- rule and D-08's permanent reservation both compare lowered, and a retired
-- handle can only ever belong to one profile.
CREATE UNIQUE INDEX IF NOT EXISTS handle_history_old_handle_lower_uniq
  ON public.handle_history (lower(old_handle));

CREATE INDEX IF NOT EXISTS handle_history_profile_id_idx
  ON public.handle_history (profile_id);

COMMENT ON TABLE public.handle_history IS
  'Phase 36 D-07/D-08: retired @handles. Each row keeps an old /u/<handle> URL resolving to the profile that outgrew it (resolve_profile_by_handle), and permanently removes that name from the claimable pool (check_handle_not_reserved). Service-role only — zero RLS policies plus a full REVOKE; never read directly by anon or authenticated.';

ALTER TABLE public.handle_history ENABLE ROW LEVEL SECURITY;

-- No policies are created for this table. An RLS-enabled table with zero
-- policies denies ALL row access to authenticated/anon by construction —
-- combined with the REVOKE below, handle_history is reachable ONLY via the
-- service role and via section 4's SECURITY DEFINER resolver.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.handle_history FROM authenticated, anon;
REVOKE ALL ON public.handle_history FROM PUBLIC;

-- ─── (2) check_handle_not_reserved() — REWRITTEN body (D-06 + D-08) ───────
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' is
-- carried over byte-for-byte from migration 037. Both properties are why the
-- guard can read public.reserved_handles regardless of the invoking user's
-- search path; dropping either would silently disarm it against exactly the
-- direct-PostgREST write it exists to stop.
CREATE OR REPLACE FUNCTION public.check_handle_not_reserved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- D-06. The body is REWRITTEN, not merely re-pointed at a wider trigger
  -- event list. Migration 037's condition dereferenced the prior row
  -- unconditionally, which is NULL on an INSERT — so the whole comparison
  -- was NULL and the guard never fired on the path this phase writes on.
  -- ORDERING IS LOAD-BEARING: the TG_OP test must short-circuit the OR
  -- before anything reads the prior row. Do not reorder these operands.
  IF NEW.handle IS NOT NULL
     AND (TG_OP = 'INSERT' OR lower(NEW.handle) IS DISTINCT FROM lower(OLD.handle))
  THEN
    -- reserved_handles stores its values already lowercased (migration 037's
    -- own header states this), so lower the incoming value and compare
    -- directly against the stored column.
    IF EXISTS (
      SELECT 1 FROM public.reserved_handles WHERE handle = lower(NEW.handle)
    ) THEN
      RAISE EXCEPTION 'handle is reserved';
    END IF;

    -- D-08 — a retired handle is permanently unclaimable.
    --
    -- ASSUMPTION A1 RESOLVED HERE: CONTEXT.md's phrasing ("stays reserved to
    -- its original owner") is ambiguous about whether the original owner may
    -- reclaim their own retired handle. This blocks it UNIVERSALLY, the
    -- original owner included, and deliberately carries no per-profile
    -- carve-out. Rationale: universal blocking is the safe default, and
    -- relaxing it later is a single function edit with no schema change,
    -- whereas shipping the permissive version and later discovering an
    -- impersonation path through a reclaimed name is not recoverable the
    -- same way. Both write paths reach this check — the signup INSERT and
    -- the later handle-change UPDATE.
    IF EXISTS (
      SELECT 1 FROM public.handle_history WHERE lower(old_handle) = lower(NEW.handle)
    ) THEN
      RAISE EXCEPTION 'handle is reserved';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Both RAISE EXCEPTIONs above are deliberately plain, with no USING ERRCODE
-- clause, so they carry PostgreSQL's default SQLSTATE P0001 — condition name
-- raise_exception, which is exactly what section 3's narrow catch names.

-- The DROP names the OLD trigger but the CURRENT table. Migration 076
-- renamed artist_profiles to user_profiles with an OID-preserving
-- ALTER TABLE ... RENAME TO, so the trigger followed the table under its old
-- name. The pre-rename relation no longer exists and naming it here would
-- fail the push. Renaming the trigger itself is safe (assumption A3): the
-- DROP targets the live table regardless of the trigger's own name.
DROP TRIGGER IF EXISTS artist_profiles_handle_not_reserved ON public.user_profiles;
CREATE TRIGGER user_profiles_handle_not_reserved
  BEFORE INSERT OR UPDATE OF handle ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_handle_not_reserved();

-- ─── (3) handle_new_user() — the signup-chosen handle, atomically (D-03/D-15)
-- Reproduced from migration 105 with EXACTLY ONE edit: the default branch's
-- bare `INSERT INTO public.user_profiles (id) VALUES (NEW.id);` becomes a
-- nested block that also writes the handle. The curator early return, the
-- buyer early return, the staff early return, the entire industry branch, the
-- admin-provision intent consumption, the invite gate, the specific-invite
-- accept marking, the subscriptions insert and the collaborator claim are all
-- unchanged. D-01 confirmed the curator branch is dead code (0 accounts,
-- 0 curators rows, nothing sets that role) but explicitly left removing it
-- out of scope — it stays exactly as it is.
--
-- WHY THIS WORKS AT ALL: user_metadata IS visible to this trigger in NEW at
-- INSERT on this Supabase instance, while app_metadata and email_confirmed_at
-- are NOT (the 27-13 INSERT-time diagnostic; the asymmetry cost two cutover
-- failures in Phase 27 — see lib/accounts/provisionIntent.ts's header). D-03
-- rides on the visible half, the same way the industry branch below already
-- reads display_name from it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invite_id         UUID;
  v_is_invited        BOOLEAN;
  v_admin_provisioned BOOLEAN := FALSE;
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

  -- Staff branch (Phase 25, migration 089; gate-exemption fix Phase 27 B1,
  -- migration 099) — reproduced byte-for-byte. Kept as defense in depth: on
  -- this instance app_metadata is not visible at INSERT so this cannot fire,
  -- but it is correct automatically if a future GoTrue changes that.
  IF (NEW.raw_app_meta_data->>'staff_role') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Industry branch (migration 039/076/085/086/098/099/104): unchanged.
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

  -- ── default / artist branch — the invite gate applies here ONLY ────────

  -- ── admin-provision exemption (migration 105 — intent id ALONE) ────────
  -- Consume this signup's single-use provision-intent token if it presents a
  -- valid, unexpired one for this email. Matched by the intent's unguessable
  -- 122-bit random id, which the create*Account helper carries in
  -- user_metadata.provision_intent — user_metadata IS visible to this trigger
  -- at INSERT on this Supabase (27-13 diagnostic). No email_confirmed_at
  -- requirement: the SAME diagnostic proved it is NULL at INSERT here, so
  -- migration 104's second-factor guard could never pass and rejected all
  -- admin lanes. The id alone is unforgeable: a self-serve signup controls its
  -- own user_metadata but cannot read (service-role-only table) or guess (122
  -- bits) a valid id, so it can neither match nor burn an admin's intent.
  -- `id::text = <text>` (never casts user input to uuid) → absent/malformed
  -- provision_intent fails to match rather than raising.
  DELETE FROM public.account_provision_intents
    WHERE id::text = NEW.raw_user_meta_data->>'provision_intent'
      AND LOWER(email) = LOWER(NEW.email)
      AND expires_at > NOW();
  v_admin_provisioned := FOUND;

  IF NOT v_admin_provisioned THEN
    -- artist self-serve invite gate (unchanged from migration 099/104, M3) —
    -- identify the SPECIFIC active (pending, unexpired) artist_invites row
    -- that authorizes this signup, never a blanket email match. If admission
    -- comes from a collaborators match instead, v_invite_id stays NULL.
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

    -- Mark ONLY the specific invite row accepted (M3) — a no-op when
    -- v_invite_id is NULL (collaborator-only admission). Exception-isolated
    -- so a mark-accepted failure can never roll back a legitimate signup.
    IF v_invite_id IS NOT NULL THEN
      BEGIN
        UPDATE public.artist_invites
          SET status = 'accepted', accepted_user_id = NEW.id, accepted_at = NOW()
          WHERE id = v_invite_id AND status = 'pending';
      EXCEPTION WHEN OTHERS THEN
        NULL; -- swallow accept-marking errors; account creation continues
      END;
    END IF;
  END IF;

  -- Default provisioning — runs for BOTH admitted self-serve artists AND
  -- admin-provisioned lanes (buyer/staff delete these rows afterward;
  -- industry updates them). The profile insert now carries the handle (D-03),
  -- so a new User Account has NO window in which it exists without one.
  --
  -- Four properties of this block are load-bearing:
  --
  -- 1. IT WRAPS ONLY THIS ONE INSERT. The subscriptions insert and the
  --    collaborator claim below stay outside it, with their own pre-existing
  --    exception blocks untouched. Widening this block to cover them would
  --    change their failure semantics.
  --
  -- 2. IT NAMES EXACTLY TWO CONDITIONS. unique_violation is D-15's race — the
  --    handle was claimed between the client's availability check and this
  --    statement (D-14: the lowered unique index from migration 010 is the
  --    enforcement, never the UI check). raise_exception is SQLSTATE P0001,
  --    what section 2's guard raises for a reserved word or a retired handle.
  --    A catch-all (WHEN OTHERS) would ALSO swallow a broken column
  --    reference, a broken foreign key, or a genuine outage and silently
  --    report every one of them as a handle collision — undebuggable, and it
  --    would keep creating handle-less accounts while nothing surfaced.
  --
  -- 3. IT CANNOT SWALLOW THE INVITE GATE. The not_invited raise above also
  --    carries P0001, but it fires EARLIER in this same function and aborts
  --    the entire trigger before this block is ever entered. That ordering —
  --    gate above, default provisioning below — is the invariant; preserve it.
  --
  -- 4. NULLIF(TRIM(...), '') MAKES THE ADMIN LANES A NO-OP. Buyer, staff and
  --    industry provisioning never set user_metadata.handle, so the
  --    expression is NULL for them and this insert is identical to the bare
  --    insert it replaces.
  BEGIN
    INSERT INTO public.user_profiles (id, handle)
    VALUES (NEW.id, NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), ''));
  EXCEPTION WHEN unique_violation OR raise_exception THEN
    -- D-15: never abort signUp over a handle. Fall back to a NULL handle and
    -- let the hard gate collect one on first sign-in — a rare, brief
    -- handle-less window is the correct trade against costing someone the
    -- account they just committed a password to.
    INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  END;

  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim collaborator rows matching this email — ONLY for a genuine
  -- self-serve artist signup (HIGH-2). An admin-provisioned non-artist account
  -- must never claim artist collaborator rows. Nested exception block so a
  -- claim failure cannot orphan the new account.
  IF NOT v_admin_provisioned THEN
    BEGIN
      PERFORM public.claim_collaborators(NEW.id, NEW.email);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow claim errors; account creation continues
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── (4) resolve_profile_by_handle() — case-insensitive + retired fallback ─
-- WHY A RESOLVER RATHER THAN A DIRECT FILTER FROM THE PAGE: PostgREST cannot
-- express a `lower(column) = lower($1)` filter, so the alternative from the
-- page is a pattern-match filter — and an underscore is BOTH a legal handle
-- character (D-05) and a single-character wildcard in a pattern match. That
-- makes /u/a_c silently resolve to @abc, or match two rows and 404 a
-- legitimate profile. A SECURITY DEFINER resolver instead gives an exact
-- lowered comparison that uses migration 010's functional index, folds D-07's
-- retired-handle fallback into the SAME round trip, and keeps handle_history
-- fully revoked from anon and authenticated — the caller learns only a
-- profile id, never a history row.
--
-- Returns at most one row. redirected=FALSE means the handle is current;
-- redirected=TRUE means it was retired and current_handle is where the caller
-- should 301 to. Zero rows means 404. The page still applies its own
-- is_public and bidirectional-block checks before rendering anything — this
-- resolver only maps a handle to a profile.
CREATE OR REPLACE FUNCTION public.resolve_profile_by_handle(p_handle TEXT)
RETURNS TABLE (profile_id UUID, current_handle TEXT, redirected BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Current handles win outright — a live handle is never shadowed by a
  -- retired one (and section 2 makes the collision impossible anyway).
  RETURN QUERY
    SELECT p.id, p.handle, FALSE
      FROM public.user_profiles p
     WHERE lower(p.handle) = lower(p_handle)
     LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- D-07: an already-shared /u/<old-handle> link keeps working.
  RETURN QUERY
    SELECT p.id, p.handle, TRUE
      FROM public.handle_history h
      JOIN public.user_profiles p ON p.id = h.profile_id
     WHERE lower(h.old_handle) = lower(p_handle)
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_profile_by_handle(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_profile_by_handle(TEXT) TO anon, authenticated, service_role;

-- ─── (5) Schema-cache reload ──────────────────────────────────────────────
-- New table, replaced functions and a new RPC all change what PostgREST
-- exposes.
NOTIFY pgrst, 'reload schema';
