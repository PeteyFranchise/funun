-- ============================================================
-- Funūn — Phase 27 (artist-invite-only-onboarding): CUTOVER CORRECTIVE v2
-- Migration 105 — admin-provision exemption keyed on the intent id ALONE
--
-- WHY (proven by the 27-13 INSERT-time diagnostic, 2026-08-10): migration 104
-- exempted admin-provisioned accounts (buyer/staff/industry/curator) only when
-- it saw TWO signals at INSERT — a matching account_provision_intents row AND
-- NEW.email_confirmed_at IS NOT NULL. On THIS Supabase instance, a capture
-- trigger on auth.users showed what handle_new_user() actually sees in NEW at
-- INSERT time:
--   • raw_user_meta_data  → VISIBLE (provision_intent + display_name present)
--   • email_confirmed_at  → NULL  (email_confirm:true is applied AFTER the INSERT)
--   • raw_app_meta_data   → only {provider,providers} (custom role applied AFTER)
-- So migration 104's `email_confirmed_at IS NOT NULL` guard could NEVER pass
-- inside the trigger — it rejected EVERY admin-provisioned account (the 27-11
-- and 27-12 cutover failures: all four non-artist lanes got "Database error
-- creating new user"). Both times the gate was rolled back via
-- docs/BREAK-GLASS.md Layer 3.
--
-- WHAT: handle_new_user() is redefined again. The ONLY change from migration
-- 104 is that the admin-provision exemption no longer requires
-- email_confirmed_at — it keys on the intent id alone (carried in
-- user_metadata, which IS visible at INSERT). The intent id is sufficient and
-- unforgeable on its own: it is a 122-bit random UUID that only the
-- create*Account helper and the service-role-only account_provision_intents
-- table (zero RLS policies + REVOKE ALL from anon/authenticated) ever hold. A
-- self-serve signup controls its own user_metadata, but cannot READ a valid id
-- (the table is unreadable) nor GUESS one (122 bits), so it can neither present
-- a matching provision_intent nor consume an admin's pending intent — this
-- closes both forgery and the racing-consume window WITHOUT the confirmation
-- factor. The intent stays single-use (consumed by DELETE), expiring
-- (expires_at, migration 104's 15-min TTL), and attempt-bound (matched by the
-- specific id). Everything else — the curator/buyer/staff/industry branches,
-- the artist invite gate (M3 specific-invite consumption), and the HIGH-2
-- guard keeping claim_collaborators() to genuine artists — is unchanged from
-- migration 104.
--
-- The id is compared as `id::text = <text>` (never casting user-supplied
-- metadata to uuid), so an absent or malformed provision_intent simply fails
-- to match instead of raising inside the trigger.
--
-- The account_provision_intents table is re-ensured here (IF NOT EXISTS +
-- idempotent lockdown) so this single migration fully defines the working gate
-- — the break-glass "restore via a NEW forward migration" path (see
-- docs/BREAK-GLASS.md Layer 3) can reapply 105 alone even if the table was
-- never created. In production it already exists (migration 104 applied), so
-- these statements are no-ops there.
--
-- NOTE ON HISTORY: migration 104 is recorded LOCAL=REMOTE (it applied before
-- its trigger was reverted by Layer 3), so it will NOT re-run. This corrected
-- body ships forward as 105 — do not edit or retry 104.
--
-- HUMAN-GATED — never `supabase db push` from an agent (matches Phases
-- 16/21/25/27/28's standing convention). Draft + test-only. Push at the
-- corrected cutover, reviewed and run by the owner, WITH a live buyer/staff/
-- industry/curator provisioning smoke exercising the REAL create*Account
-- helpers (which write the intent) — never a raw admin.createUser, which has
-- no intent and is correctly rejected.
-- ============================================================

-- ─── account_provision_intents — re-ensured (idempotent; created by 104) ───
CREATE TABLE IF NOT EXISTS public.account_provision_intents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes'
);

CREATE INDEX IF NOT EXISTS idx_account_provision_intents_email_lower
  ON public.account_provision_intents (LOWER(email));

ALTER TABLE public.account_provision_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_provision_intents FROM PUBLIC, anon, authenticated;

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
  -- industry updates them). Byte-identical to migration 086's default branch.
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
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

-- Table/privilege re-ensure affects what PostgREST exposes.
NOTIFY pgrst, 'reload schema';
