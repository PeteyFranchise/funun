-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails (Phase 20: Profile Table Rename)
-- Migration 076: artist_profiles -> user_profiles (rename + compat view)
--
-- D-01: zero-downtime table rename via the textbook Postgres pattern —
-- rename the table, then stand up a same-named, UPDATABLE compatibility
-- view so already-deployed code (still calling `.from('artist_profiles')`)
-- keeps reading AND writing correctly until the new code deploys and
-- migration 077 drops the view. Sequencing (D-02): this file (push #1)
-- -> Vercel deploy of the renamed-code release -> D-04 smoke-test gate
-- -> D-05 soak -> migration 077 (push #2, drops the view).
--
-- This migration does five things, in order:
--   1. ALTER TABLE ... RENAME TO — OID-preserving, so RLS policies,
--      triggers, FKs (capability_grants, verification_audit_log), indexes,
--      and the table's own grants all follow automatically. Index/
--      constraint/trigger names that embed "artist_profiles" are left
--      unchanged (cosmetic only; renaming adds lock risk for zero benefit).
--   2. CREATE OR REPLACE the 6 functions whose BODIES literally reference
--      the old table name (function bodies are stored as text and do NOT
--      auto-follow a rename, unlike RLS/triggers/FKs which reference by
--      OID): handle_new_user (both the industry and default/artist INSERT
--      branches), clear_featured_if_unpublished,
--      green_room_post_matches_custom_audience, green_room_can_view_post,
--      claim_collaborators, backfill_claimed_collaborators. Every
--      SECURITY DEFINER / LANGUAGE / SET search_path clause is preserved
--      byte-for-byte from each function's current live body — only the
--      table identifier changes. For claim_collaborators and
--      backfill_claimed_collaborators specifically: CREATE OR REPLACE
--      preserves migration 075's service_role-only EXECUTE lockdown
--      automatically (075's own comment confirms this); this migration
--      does NOT add any new GRANT EXECUTE line for either function —
--      doing so would re-widen a cross-user-write DEFINER function that
--      075 deliberately locked down.
--   3. CREATE VIEW artist_profiles WITH (security_invoker = on) — the
--      security_invoker clause is NON-NEGOTIABLE. Without it, PG15's
--      default view behavior checks underlying-table access AS THE VIEW
--      OWNER (the migration-running admin role, which bypasses RLS), not
--      as the querying authenticated/anon role — silently turning the
--      view into a cross-user RLS bypass for the duration of the deploy
--      gap. This is a plain single-relation `SELECT *` view with no
--      DISTINCT/GROUP BY/aggregates/set ops, so it satisfies every rule
--      for Postgres's automatically-updatable-view mechanism: INSERT/
--      UPDATE/DELETE against the view rewrite transparently onto
--      user_profiles with no INSTEAD OF triggers needed.
--   4. Explicit column-scoped GRANTs on the view. Privileges on a view are
--      INDEPENDENT of privileges on its base table (views do not inherit
--      table grants) — skipping this step means old code hitting the view
--      gets `42501 permission denied` the instant this migration lands,
--      the opposite of the zero-downtime goal. The SELECT (33 cols, to
--      authenticated + anon) and UPDATE (17 cols, to authenticated) lists
--      below were VERIFIED at the 20-03 preflight against
--      information_schema.role_column_grants on the live table: anon and
--      authenticated each SELECT exactly these 33 columns, and authenticated
--      UPDATEs exactly these 17 — both an exact match (zero diff either
--      direction). Deployed code only ever reads or updates this relation
--      (verified on origin/main: 74 .select() + 11 .update() sites against
--      artist_profiles, zero .insert()/.upsert()/.delete()), so the view is
--      granted ONLY SELECT + UPDATE. NOTE: the live table ALSO grants
--      anon/authenticated table-level INSERT/DELETE (and anon UPDATE) under
--      the standard Supabase grant-plus-RLS model — the view intentionally
--      does NOT mirror those. No code path exercises them through this name,
--      and least privilege is the right default for a temporary shim (RLS on
--      user_profiles still gates every row via security_invoker regardless).
--      A defensive `GRANT ALL ... TO service_role` is added — service_role
--      reads the Rights columns (legal_*, contact_phone, pro, …) server-side
--      and already has equivalent-or-greater access via other paths.
--   5. NOTIFY pgrst, 'reload schema' — forces PostgREST to pick up the
--      renamed relation + the new view; without this, requests can
--      404/500 against a stale schema cache (established convention,
--      already used in migrations 070/072/073/075).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push is this phase's first human-gated checkpoint (plan 20-03),
-- applied strictly before the code deploy, mirroring migrations
-- 058/062/063/065/066/070/072/073/074/075's "do not push from an executor
-- agent" convention. The column-scoped grant lists below were VERIFIED at
-- the 20-03 preflight against `information_schema.role_column_grants` on the
-- live table (anon/authenticated SELECT = exactly the 33 listed; authenticated
-- UPDATE = exactly the 17 listed; both zero-diff), and service_role holds
-- table-level ALL — so no further live re-verification is required.
-- ============================================================

-- ─── 1. Rename (OID-preserving; RLS/triggers/FKs/indexes/grants on the
--         table itself follow automatically) ─────────────────────────────
ALTER TABLE artist_profiles RENAME TO user_profiles;

-- ─── 2. Re-create the 6 functions whose bodies literally say
--         "artist_profiles" (function bodies are text, NOT OID-linked;
--         they do not auto-follow a rename) ──────────────────────────────

-- handle_new_user() — RE-POINTED (Phase 20): both the industry branch's
-- INSERT and the default/artist branch's INSERT below move from
-- public.artist_profiles -> public.user_profiles (Pitfall 4: BOTH
-- branches must change or one member type's signup silently breaks; the
-- curator early-return branch performs no insert and needs no change).
-- Body otherwise byte-for-byte identical to migration 039's live version.
-- NOTE (preflight false-positive guard): unlike the other 5 functions below,
-- this one intentionally carries NO `SET search_path = ''`. It faithfully
-- matches canonical migration 039, which never had it. Safe because every
-- object reference in the body is fully public-qualified (public.user_profiles,
-- public.subscriptions, public.claim_collaborators) and only pg_catalog
-- built-ins are otherwise used, so nothing resolves through search_path.
-- Adding the clause here would be an out-of-scope security-semantics change on
-- a rename migration; harden it separately if ever desired.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  -- Industry branch (D-01/D-03 resolved, migration 039). Unlike the
  -- curator branch, an industry member DOES get a real profile row
  -- (never a bare RETURN NEW), just built without claim_collaborators()
  -- (that flow is artist-only).
  IF (NEW.raw_app_meta_data->>'role') = 'industry' THEN
    INSERT INTO public.user_profiles (id, member_type, artist_name, industry_roles, roles)
    VALUES (
      NEW.id,
      'industry',
      NEW.raw_user_meta_data->>'display_name',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'role_badges', '[]'::jsonb))),
      COALESCE(NEW.raw_user_meta_data->'profile_roles', '[]'::jsonb)
    );

    -- D-18: industry members DO get a free subscriptions row, same as
    -- artists. Wrapped in the same nested exception-isolation pattern as
    -- the artist branch's claim_collaborators call below so a
    -- secondary-insert failure cannot orphan the profile row just
    -- created above (mirrors CR-04 / migration 027).
    BEGIN
      INSERT INTO public.subscriptions (user_id, tier, status)
      VALUES (NEW.id, 'free', 'active');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow subscription-insert errors; account creation continues
    END;

    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  -- Phase 4: claim any collaborator rows matching this user's email.
  -- Wrapped in a nested exception block so a claim failure cannot orphan
  -- the new account by rolling back the two inserts above (CR-04).
  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- swallow claim errors; account creation continues
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- clear_featured_if_unpublished() — RE-POINTED (Phase 20): the UPDATE
-- below moves from public.artist_profiles -> public.user_profiles. Body
-- otherwise byte-for-byte identical to migration 034's live version
-- (SECURITY DEFINER + SET search_path = '' preserved; see 034's own
-- comment for why SECURITY DEFINER is required here — WR-01).
CREATE OR REPLACE FUNCTION public.clear_featured_if_unpublished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_public = false AND OLD.is_public = true THEN
    UPDATE public.user_profiles SET featured_project_id = NULL
    WHERE featured_project_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- green_room_post_matches_custom_audience() — RE-POINTED (Phase 20): the
-- LEFT JOIN below moves from public.artist_profiles -> public.user_profiles.
-- Body otherwise byte-for-byte identical to migration 060's live version
-- (LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' preserved).
-- CREATE OR REPLACE preserves the existing GRANT EXECUTE ... TO
-- authenticated state (migration 060) — no re-grant needed or added here.
CREATE OR REPLACE FUNCTION public.green_room_post_matches_custom_audience(
  p_post_id UUID,
  p_viewer UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.green_room_post_audiences a
    LEFT JOIN public.user_profiles ap ON ap.id = p_viewer
    WHERE a.post_id = p_post_id
      AND p_viewer IS NOT NULL
      AND (
        p_viewer = ANY(a.people)
        OR (
          'followers' = ANY(a.relationships)
          AND EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = p_viewer
              AND f.followee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id)
          )
        )
        OR (
          'connections' = ANY(a.relationships)
          AND EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.status = 'accepted'
              AND (
                (c.requester_id = p_viewer AND c.addressee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
                OR
                (c.addressee_id = p_viewer AND c.requester_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
              )
          )
        )
        OR (
          'outside_network' = ANY(a.relationships)
          AND NOT EXISTS (
            SELECT 1 FROM public.follows f
            WHERE f.follower_id = p_viewer
              AND f.followee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.connections c
            WHERE c.status = 'accepted'
              AND (
                (c.requester_id = p_viewer AND c.addressee_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
                OR
                (c.addressee_id = p_viewer AND c.requester_id = (SELECT p.author_id FROM public.green_room_posts p WHERE p.id = p_post_id))
              )
          )
        )
        OR (
          cardinality(a.roles) > 0
          AND (
            COALESCE(ap.industry_roles, '{}'::TEXT[]) && a.roles
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ap.roles, '[]'::jsonb)) AS role
              WHERE (
                role->>'kind' = 'preset'
                AND lower(role->>'slug') = ANY(ARRAY(SELECT lower(r) FROM unnest(a.roles) AS r))
              )
              OR (
                role->>'kind' = 'custom'
                AND lower(role->>'label') = ANY(ARRAY(SELECT lower(r) FROM unnest(a.roles) AS r))
              )
            )
          )
        )
        OR (cardinality(a.genres) > 0 AND ap.genre IS NOT NULL AND lower(ap.genre) = ANY(ARRAY(SELECT lower(g) FROM unnest(a.genres) AS g)))
        OR (cardinality(a.locations) > 0 AND ap.location IS NOT NULL AND lower(ap.location) = ANY(ARRAY(SELECT lower(l) FROM unnest(a.locations) AS l)))
      )
  )
$$;

-- green_room_can_view_post() — RE-POINTED (Phase 20): the FROM below
-- moves from public.artist_profiles -> public.user_profiles. Body
-- otherwise byte-for-byte identical to migration 059's live version
-- (LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' preserved).
-- CREATE OR REPLACE preserves the existing GRANT EXECUTE ... TO
-- authenticated state (migration 059) — no re-grant needed or added here.
CREATE OR REPLACE FUNCTION public.green_room_can_view_post(
  p_post_id UUID,
  p_viewer UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.green_room_posts p
    WHERE p.id = p_post_id
      AND p.deleted_at IS NULL
      AND p.moderation_status = 'visible'
      AND p_viewer IS NOT NULL
      AND (
        p.author_id = p_viewer
        OR (
          p.status = 'published'
          AND p.published_at IS NOT NULL
          AND public.no_block(p_viewer, p.author_id)
          AND EXISTS (
            SELECT 1 FROM public.user_profiles ap
            WHERE ap.id = p.author_id
              AND ap.is_public = true
          )
          AND (
            p.visibility = 'public'
            OR (
              p.visibility = 'followers'
              AND EXISTS (
                SELECT 1 FROM public.follows f
                WHERE f.follower_id = p_viewer
                  AND f.followee_id = p.author_id
              )
            )
            OR (
              p.visibility = 'connections'
              AND EXISTS (
                SELECT 1 FROM public.connections c
                WHERE c.status = 'accepted'
                  AND (
                    (c.requester_id = p_viewer AND c.addressee_id = p.author_id)
                    OR (c.addressee_id = p_viewer AND c.requester_id = p.author_id)
                  )
              )
            )
            OR (
              p.visibility = 'custom'
              AND public.green_room_post_matches_custom_audience(p.id, p_viewer)
            )
          )
        )
      )
  )
$$;

-- claim_collaborators() — RE-POINTED (Phase 20): every reference to
-- public.artist_profiles below moves to public.user_profiles (13
-- occurrences across the forward-fill and R2 reverse-prefill blocks).
-- Body otherwise byte-for-byte identical to migration 072's live version
-- (SECURITY DEFINER + SET search_path = '' preserved). CREATE OR REPLACE
-- preserves migration 075's service_role-only EXECUTE lockdown
-- automatically — this migration adds NO new GRANT EXECUTE line for this
-- function (re-adding one would re-widen a cross-user-write DEFINER
-- function that 075 deliberately locked down).
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
    -- never IS NULL alone — this column defaults to '{}'::jsonb)
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

-- backfill_claimed_collaborators() — RE-POINTED (Phase 20): the
-- public.artist_profiles reference below moves to public.user_profiles.
-- Body otherwise byte-for-byte identical to migration 072's live version
-- (SECURITY DEFINER + SET search_path = '' preserved). Same EXECUTE-grant
-- caution as claim_collaborators() above — no new GRANT EXECUTE added.
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
  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.user_profiles
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

-- ─── 3. Compatibility view (THE critical security clause) ─────────────────
-- security_invoker = on: RLS is evaluated as the INVOKING role
-- (authenticated/anon), not the view owner. Omitting this clause would
-- silently turn the view into an RLS bypass — any signed-in caller could
-- read/write every other user's row through the old "artist_profiles"
-- name for as long as the view exists. Non-negotiable (RESEARCH Pitfall 1).
CREATE VIEW artist_profiles WITH (security_invoker = on) AS
  SELECT * FROM user_profiles;

-- ─── 4. Explicit column-scoped GRANTs on the view (views do NOT inherit
--         the base table's privileges — must be re-issued verbatim,
--         matching the cumulative column lists from migrations
--         040/043/054/058) ─────────────────────────────────────────────────
REVOKE ALL ON artist_profiles FROM PUBLIC, authenticated, anon;

-- SELECT list — VERIFIED at the 20-03 preflight against the live catalog:
-- role_column_grants shows anon and authenticated each hold SELECT on
-- EXACTLY these 33 columns (zero diff either direction). These are the
-- public/own-profile columns; the Rights columns (legal_*, contact_phone,
-- mailing_address, pro, publisher, ipi, mlc_id, soundexchange_id, isrc_*)
-- are deliberately absent — they are service_role-only reads on the table,
-- so they must NOT be exposed to anon/authenticated on the view either.
GRANT SELECT (
  id, artist_name, genre, genres, sound_identity, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, total_streams, industry_roles, handle,
  member_type, pronouns, banner_url, open_to, featured_project_id,
  search_vector, avatar_url, verified, roles, is_public,
  created_at, updated_at,
  claimed_at,
  allow_resharing,
  last_seen_at,
  profile_visibility, open_to_visibility
) ON artist_profiles TO authenticated, anon;

-- UPDATE list — VERIFIED at the 20-03 preflight against the live catalog:
-- authenticated holds column-scoped UPDATE on EXACTLY these 17 columns
-- (zero diff). authenticated has NO table-level UPDATE, and the columns
-- omitted here (allow_resharing, last_seen_at, profile_visibility,
-- open_to_visibility, verified/verified_at, and all Rights columns) are
-- SELECT-only or ungranted to authenticated on the table — owner writes to
-- those go through createServiceClient(), which bypasses column grants.
GRANT UPDATE (
  artist_name, genres, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, industry_roles, handle, pronouns, banner_url,
  open_to, featured_project_id, roles
) ON artist_profiles TO authenticated;

-- service_role grant. Verified at the 20-03 preflight: service_role holds
-- table-level ALL on the live table (incl. SELECT/UPDATE). Views do not
-- inherit that, and Supabase's default-privilege bootstrap for new relations
-- is not guaranteed to cover views the way it covers tables — so grant it
-- explicitly. This is what lets old server-side code read the Rights columns
-- through the view during the cutover.
GRANT ALL ON artist_profiles TO service_role;

-- ─── 5. Force PostgREST to see the renamed table + new view ────────────────
NOTIFY pgrst, 'reload schema';
