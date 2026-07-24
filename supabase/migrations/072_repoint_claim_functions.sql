-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails (Phase 19: Profile &
-- Identity Model Cleanup)
-- Migration 072: re-point claim_collaborators()/backfill_claimed_
-- collaborators() to artist_profiles + add claim_prefill column +
-- R2 reverse pre-fill (R1/R2, step 2 of 3)
--
-- BOTH SECURITY DEFINER functions that currently read the doomed
-- `user_profiles` table are re-created here, in the SAME file, to read
-- the canonical `artist_profiles` table instead (SPEC R1 Edge Coverage
-- "Missed reader" — backfill_claimed_collaborators() is easy to
-- overlook since it was added alongside claim_collaborators() in
-- migration 026 and must move with it). Column rename: phone ->
-- contact_phone.
--
-- Also adds the new private `artist_profiles.claim_prefill` JSONB
-- column and extends claim_collaborators() with the R2 reverse
-- pre-fill: on claim, for each canonical rights field that is still
-- semantic-blank, pre-fill it from the claimed collaborators' records
-- (most-recent by collaborators.updated_at wins) and record an
-- unconfirmed provenance entry naming the inviting artist
-- (collaborators.user_id -> artist_profiles.artist_name), never the
-- song. Mirrors lib/profile/claim-prefill.ts's shouldPrefill /
-- pickWinningSource / buildClaimPrefillEntry field-for-field — keep
-- both in sync if either changes. Idempotent: never overwrites a
-- field whose claim_prefill entry is already confirmed, and never
-- overwrites a non-blank canonical value.
--
-- This migration re-points functions and adds a column only — it does
-- NOT drop user_profiles. Migration 071 (already applied first) has
-- rescued any stranded data; migration 073 drops the table, strictly
-- after this file.
--
-- An executor agent must NEVER run `supabase db push` for this
-- migration. The live push against the remote database is this
-- phase's blocking human checkpoint (plan 19-07), mirroring migrations
-- 058/062/063/065/066/074's "do not push from an executor agent"
-- convention.
-- ============================================================

-- ─── artist_profiles.claim_prefill ─────────────────────────────────────
-- Per-field claim pre-fill provenance, keyed by canonical artist_profiles
-- field name. Each entry: { confirmed, source_collaborator_id,
-- source_name, filled_at } (lib/profile/claim-prefill.ts's
-- ClaimPrefillEntry shape — the 19-05 confirm UI reads this same shape).
-- PRIVATE column (migration 040 doctrine): do NOT add to any GRANT
-- SELECT/UPDATE list — read/written server-side only, same posture as
-- legal_name_locked_at/administrator.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS claim_prefill JSONB DEFAULT '{}'::jsonb;

-- ─── claim_collaborators() ──────────────────────────────────────────────
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
  -- Claim all matching collaborator rows (idempotent guard: claimed_by IS NULL)
  UPDATE public.collaborators
    SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  -- RE-POINTED (R1): was `FROM public.user_profiles`, now the canonical
  -- table. Column rename: phone -> contact_phone.
  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.artist_profiles
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
  -- For each canonical rights field that is semantic-blank on this
  -- user's artist_profiles row, and whose claim_prefill entry (if any)
  -- is not already confirmed, pre-fill it from the most-recently-updated
  -- claimed collaborators row carrying a non-blank value, and record an
  -- unconfirmed provenance entry. Re-reads current state fresh (the
  -- forward fill above only touched collaborators rows, never
  -- artist_profiles).
  SELECT pro, ipi, publisher, contact_phone, mailing_address, claim_prefill
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address, v_prefill
    FROM public.artist_profiles
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
        SELECT artist_name INTO v_source_name FROM public.artist_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['pro'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.artist_profiles SET pro = v_winner.pro WHERE id = p_user_id;
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
        SELECT artist_name INTO v_source_name FROM public.artist_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['ipi'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.artist_profiles SET ipi = v_winner.ipi WHERE id = p_user_id;
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
        SELECT artist_name INTO v_source_name FROM public.artist_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['publisher'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.artist_profiles SET publisher = v_winner.publisher WHERE id = p_user_id;
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
        SELECT artist_name INTO v_source_name FROM public.artist_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['contact_phone'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.artist_profiles SET contact_phone = v_winner.phone WHERE id = p_user_id;
      END IF;
    END IF;

    -- mailing_address (json-kind blank check: IS NULL OR = '{}'::jsonb,
    -- never IS NULL alone — this column defaults to '{}'::jsonb)
    IF (v_address IS NULL OR v_address = '{}'::jsonb)
       AND COALESCE((v_prefill -> 'mailing_address' ->> 'confirmed')::boolean, false) = false THEN
      SELECT c.id, c.mailing_address, c.user_id INTO v_winner
        FROM public.collaborators c
        WHERE c.claimed_by = p_user_id
          AND c.mailing_address IS NOT NULL AND c.mailing_address <> '{}'::jsonb
        ORDER BY c.updated_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT artist_name INTO v_source_name FROM public.artist_profiles WHERE id = v_winner.user_id;
        v_prefill := jsonb_set(v_prefill, ARRAY['mailing_address'], jsonb_build_object(
          'confirmed', false,
          'source_collaborator_id', v_winner.id,
          'source_name', COALESCE(v_source_name, ''),
          'filled_at', now()
        ));
        UPDATE public.artist_profiles SET mailing_address = v_winner.mailing_address WHERE id = p_user_id;
      END IF;
    END IF;

    UPDATE public.artist_profiles SET claim_prefill = v_prefill WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ─── backfill_claimed_collaborators() ───────────────────────────────────
-- Re-pointed identically to claim_collaborators() above (Pitfall 1 —
-- BOTH functions must change in this file). No R2 reverse pre-fill here
-- — that logic lives exclusively in claim_collaborators(), the claim
-- path; this function stays the forward-fill-only sibling it already was.
CREATE OR REPLACE FUNCTION public.backfill_claimed_collaborators(
  p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_pro       TEXT;
  v_ipi       TEXT;
  v_publisher TEXT;
  v_phone     TEXT;
  v_address   JSONB;
BEGIN
  -- RE-POINTED (R1): was `FROM public.user_profiles`, now the canonical
  -- table. Column rename: phone -> contact_phone.
  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.artist_profiles
    WHERE id = p_user_id;

  IF FOUND THEN
    UPDATE public.collaborators
      SET pro             = COALESCE(pro, v_pro),
          ipi             = COALESCE(ipi, v_ipi),
          publisher       = COALESCE(publisher, v_publisher),
          phone           = COALESCE(phone, v_phone),
          mailing_address = COALESCE(mailing_address, v_address)
    WHERE claimed_by = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

NOTIFY pgrst, 'reload schema';
