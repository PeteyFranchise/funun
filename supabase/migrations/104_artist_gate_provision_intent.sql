-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): CUTOVER CORRECTIVE
-- Migration 104 — non-artist provisioning exemption for the invite gate
--
-- WHY (found in the 27-11 live cutover smoke, 2026-08-09): migrations
-- 098/099 gate the DEFAULT (artist) branch of handle_new_user(). Every
-- non-artist lane above that branch (curator/buyer/industry via
-- raw_app_meta_data->>'role', staff via raw_app_meta_data->>'staff_role')
-- is selected from app_metadata. But THIS Supabase instance applies
-- app_metadata AFTER the auth.users INSERT — the trigger fires BEFORE those
-- keys exist — so none of those branches can match at INSERT time. In
-- production every admin-provisioned account (buyer, staff, industry,
-- curator) has ALWAYS fallen through to the default/artist branch; the
-- lib/*/create*Account.ts helpers all document this and reconcile the row
-- after createUser() returns (industry UPDATEs it; buyer/staff DELETE it).
-- That fall-through was survivable BEFORE the gate. With migration 098/099
-- live, the default branch RAISEs 'not_invited' for anything not on the
-- artist allowlist — so buyer/staff/industry/curator creation broke the
-- moment the gate went live (live smoke lane (d) = FAIL). The gate was
-- rolled back via docs/BREAK-GLASS.md Layer 3; this migration is its
-- corrected replacement.
--
-- WHAT: handle_new_user() is redefined AGAIN (CREATE OR REPLACE, same fix-
-- forward pattern 086→098→099 use). The curator/buyer/staff/industry
-- branches are reproduced BYTE-FOR-BYTE from migration 099 (kept as defense
-- in depth: harmless dead code today, correct automatically if a future
-- GoTrue ever populates app_metadata at INSERT). The change is entirely
-- inside the default branch: the artist invite gate now runs ONLY for a
-- genuine self-serve artist signup, identified by the ABSENCE of an
-- admin-provision exemption.
--
-- THE EXEMPTION (two independent signals — BOTH required):
--   (1) A single-use, expiring PROVISION INTENT. account_provision_intents
--       is a NEW service-role-only table (zero RLS policies + REVOKE ALL,
--       the artist_invites/funun_staff shape). Each admin.createUser() helper
--       (lib/accounts/provisionIntent.ts) inserts a row with a client-
--       generated, 122-bit-random UUID id and passes THAT id back through
--       user_metadata.provision_intent — user_metadata IS visible to the
--       trigger at INSERT (unlike app_metadata), and the id is the
--       capability. The trigger consumes EXACTLY the row whose id matches
--       (`id::text = user_metadata->>'provision_intent'`), for the same
--       email, still UNEXPIRED (expires_at > now()). anon/authenticated
--       cannot read or write this table, so a self-serve signup can neither
--       obtain a valid id nor manufacture a row; a stale/expired row is inert
--       because its id is unguessable AND it fails the expiry check. This is
--       what makes the intent ATTEMPT-BOUND and non-reusable (27-CODEX-REVIEW
--       follow-up HIGH-1) — not merely an email-scoped flag.
--   (2) NEW.email_confirmed_at IS NOT NULL — every admin helper passes
--       email_confirm:true, so the row arrives CONFIRMED at INSERT. A
--       self-serve signUp (or OTP) is always UNCONFIRMED at INSERT and cannot
--       pre-confirm itself. Kept as an independent second factor even though
--       the intent id alone is un-forgeable: defense in depth for a gate that
--       already had one subtle bug slip past static review.
--
-- Every failure mode is fail-CLOSED (the invite gate still runs): no intent
-- id / wrong id / expired id → no match; unconfirmed → the consume is skipped
-- (also keeps a racing unconfirmed signup from touching a valid intent).
-- A missing signal NEVER means "skip the invite check".
--
-- claim_collaborators() runs ONLY for a genuine self-serve artist signup
-- (guarded by NOT v_admin_provisioned) — an admin-provisioned non-artist
-- account must NEVER claim artist collaborator rows (that would grant it, via
-- the "claimed users see own credits" RLS policy, access to another artist's
-- collaborator/rights records). 27-CODEX-REVIEW follow-up HIGH-2. This
-- restores migration 086's INTENT for the buyer/staff/industry lanes (whose
-- own branches never called claim), which the app_metadata-timing quirk had
-- been silently violating in production.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only. This lands at
-- the corrected Phase 27 cutover, reviewed and run by the owner via Codex,
-- AFTER the application code is deployed and WITH a live provisioning smoke.
-- The regression this fixes was only observable against the real GoTrue
-- INSERT timing — a static test cannot catch it. The live smoke is the
-- acceptance gate and MUST cover, at minimum: a real buyer, staff, industry,
-- and curator creation (each succeeds); the artist lanes (uninvited rejected
-- / invited admitted / existing signs in); a direct /auth/v1/signup and an
-- OTP shouldCreateUser attempt (both gated); and a confirmed signup carrying
-- no/expired/foreign provision_intent (gated).
-- ============================================================

-- ─── account_provision_intents — single-use, expiring admin-provision token ─
-- Same zero-RLS-policy + REVOKE ALL shape as artist_invites/artist_waitlist
-- (migration 097) and funun_staff (089/091): ENABLE ROW LEVEL SECURITY with
-- NO policies + REVOKE ALL FROM PUBLIC, anon, authenticated = reachable ONLY
-- via the service role. The PRIMARY KEY id is the capability token — the
-- helper generates it (crypto.randomUUID, 122 bits) and passes it back
-- through user_metadata; it is never stored hashed because the table is
-- unreadable by anon/authenticated, the id is single-use + expiring, and it
-- already ends up in the new account's own user_metadata anyway (so hashing
-- would protect nothing while adding a fragile pgcrypto/search_path
-- dependency inside a load-bearing trigger). Created BEFORE the function so
-- check_function_bodies validation (on by default) can resolve the DELETE.
CREATE TABLE IF NOT EXISTS public.account_provision_intents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Short TTL: only has to cover an admin.createUser() round trip. An
  -- abandoned row (helper crash + failed cleanup) is inert past this — its
  -- unguessable id can't be presented AND the trigger rejects it on expiry.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes'
);

-- Case-insensitive email lookup (the trigger also matches on email as a
-- secondary check; the id is the primary match).
CREATE INDEX IF NOT EXISTS idx_account_provision_intents_email_lower
  ON public.account_provision_intents (LOWER(email));

ALTER TABLE public.account_provision_intents ENABLE ROW LEVEL SECURITY;

-- No policies for any role + REVOKE ALL (removes the default public-schema
-- grants Supabase applies to new tables, including TRUNCATE/TRIGGER/
-- REFERENCES per migration 091's finding). service_role keeps its own
-- access, exactly as artist_invites/artist_waitlist do (migration 097 adds
-- no explicit service_role table grant either).
REVOKE ALL ON public.account_provision_intents FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.account_provision_intents IS
  'Phase 27 (migration 104): single-use, expiring admin-provision tokens. lib/accounts/provisionIntent.ts inserts a row (client-generated UUID id) immediately before an admin.createUser() call and passes that id back via user_metadata.provision_intent. handle_new_user() consumes EXACTLY that row (by id, same email, unexpired) — together with email_confirmed_at IS NOT NULL — to exempt an admin-provisioned account from the artist invite gate. Service-role-only (zero RLS policies + REVOKE ALL, mirrors migration 089/091/097): a self-serve signup can neither read a valid id nor write a row, and a stale row is inert (unguessable id + expiry).';

-- ─── handle_new_user() — invite gate scoped to self-serve artists only ────
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

  -- Industry branch (migration 039/076/085/086/098/099): unchanged.
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

  -- ── admin-provision exemption (migration 104) ──────────────────────────
  -- Consume this signup's single-use provision-intent token IF it presents a
  -- valid one AND is confirmed at INSERT. The consume is gated behind
  -- email_confirmed_at so a racing, unconfirmed self-serve signup can neither
  -- exempt itself nor delete a valid intent. The match is by the intent's
  -- unguessable id (passed back via user_metadata by the create*Account
  -- helper), same email, unexpired — so only the creating helper's own
  -- attempt is admitted. See this migration's header for the full two-signal
  -- / fail-closed / attempt-bound rationale.
  IF NEW.email_confirmed_at IS NOT NULL THEN
    DELETE FROM public.account_provision_intents
      WHERE id::text = NEW.raw_user_meta_data->>'provision_intent'
        AND LOWER(email) = LOWER(NEW.email)
        AND expires_at > NOW();
    v_admin_provisioned := FOUND;
  END IF;

  IF NOT v_admin_provisioned THEN
    -- artist self-serve invite gate (unchanged from migration 099, M3) —
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
  -- industry updates them). Byte-identical to migration 086's default branch.
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim collaborator rows matching this email — ONLY for a genuine
  -- self-serve artist signup (HIGH-2). An admin-provisioned non-artist
  -- account must never claim artist collaborator rows. Nested exception block
  -- so a claim failure cannot orphan the new account.
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

-- New table + privilege changes affect what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
