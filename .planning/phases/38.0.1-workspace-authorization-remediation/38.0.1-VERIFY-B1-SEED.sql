-- ============================================================
-- Phase 38.0.1 — VERIFICATION PART B, FILE 1 of 3: SEED
--
-- ⚠️  THIS FILE WRITES DATA AND TURNS THE D-56 KILL SWITCH ON.
-- ⚠️  RUN IT ONLY ON A DISPOSABLE SUPABASE PREVIEW BRANCH.
-- ⚠️  NEVER ON PRODUCTION.
--
-- It refuses to run unless you first execute, in the same session:
--
--     SET funun.preview_branch_ack = 'yes-i-am-on-a-disposable-branch';
--
-- That is deliberate friction. Do not remove the guard.
--
-- Everything it creates uses the fixed UUID prefix ffff0000-… so file 3
-- (teardown) can remove exactly what this created and nothing else.
-- ============================================================

-- ─── GUARD ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF coalesce(current_setting('funun.preview_branch_ack', true), '')
     <> 'yes-i-am-on-a-disposable-branch' THEN
    RAISE EXCEPTION
      'REFUSING TO SEED. This script writes data and enables the D-56 kill switch. Run it only on a disposable preview branch, and acknowledge first with:  SET funun.preview_branch_ack = ''yes-i-am-on-a-disposable-branch'';';
  END IF;
END $$;

-- Second guard: this phase shipped with every workspace table empty.
-- If they are not empty here, you may be somewhere you did not intend.
DO $$
DECLARE n BIGINT;
BEGIN
  SELECT count(*) INTO n FROM public.workspace_members;
  IF n > 0 THEN
    RAISE EXCEPTION
      'REFUSING TO SEED: workspace_members already has % row(s). Production had 0. Confirm where you are before continuing.', n;
  END IF;
END $$;

-- ─── Test identities ──────────────────────────────────────────────
-- ffff0000-0000-0000-0000-00000000000N
--   1 SUBJECT   the Member who owns the record and grants consent
--   2 OWNER     workspace owner
--   3 ADMIN     workspace admin
--   4 CONTRACT  contractor, seat EXPIRED (WSR-17)
--   5 GUEST     guest, no grants
--   6 OUTSIDER  no workspace relationship at all
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb
FROM (VALUES
  ('ffff0000-0000-0000-0000-000000000001'::uuid, 'b-subject@verify.invalid'),
  ('ffff0000-0000-0000-0000-000000000002'::uuid, 'b-owner@verify.invalid'),
  ('ffff0000-0000-0000-0000-000000000003'::uuid, 'b-admin@verify.invalid'),
  ('ffff0000-0000-0000-0000-000000000004'::uuid, 'b-contractor@verify.invalid'),
  ('ffff0000-0000-0000-0000-000000000005'::uuid, 'b-guest@verify.invalid'),
  ('ffff0000-0000-0000-0000-000000000006'::uuid, 'b-outsider@verify.invalid')
) AS u(id, email)
ON CONFLICT (id) DO NOTHING;

-- ─── The Member's project, and one row in each child table ────────
INSERT INTO public.vault_projects (id, user_id, title, type)
VALUES ('ffff0000-0000-0000-0000-0000000000a1', 'ffff0000-0000-0000-0000-000000000001',
        'Part B verification project', 'single')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tracks (id, project_id, user_id, title, track_number)
VALUES ('ffff0000-0000-0000-0000-0000000000b1', 'ffff0000-0000-0000-0000-0000000000a1',
        'ffff0000-0000-0000-0000-000000000001', 'Part B track', 1)
ON CONFLICT (id) DO NOTHING;

-- ─── Workspace, seats, roster relationship, attachment ────────────
INSERT INTO public.workspaces (id, name, slug, workspace_type, roster_enabled, created_by)
VALUES ('ffff0000-0000-0000-0000-0000000000c1', 'Part B workspace',
        'part-b-verify-ffff0000', 'management', TRUE,
        'ffff0000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_members (id, workspace_id, user_id, role, status, expires_at)
VALUES
 ('ffff0000-0000-0000-0000-0000000000d1','ffff0000-0000-0000-0000-0000000000c1','ffff0000-0000-0000-0000-000000000002','owner','active',NULL),
 ('ffff0000-0000-0000-0000-0000000000d2','ffff0000-0000-0000-0000-0000000000c1','ffff0000-0000-0000-0000-000000000003','admin','active',NULL),
 -- WSR-17: status active BUT expired. Must be refused by BOTH layers.
 ('ffff0000-0000-0000-0000-0000000000d3','ffff0000-0000-0000-0000-0000000000c1','ffff0000-0000-0000-0000-000000000004','contractor','active', now() - interval '1 day'),
 ('ffff0000-0000-0000-0000-0000000000d4','ffff0000-0000-0000-0000-0000000000c1','ffff0000-0000-0000-0000-000000000005','guest','active',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_roster_relationships
  (id, workspace_id, member_user_id, state, effective_from, terminates_on, proposed_by)
VALUES ('ffff0000-0000-0000-0000-0000000000e1','ffff0000-0000-0000-0000-0000000000c1',
        'ffff0000-0000-0000-0000-000000000001','accepted', CURRENT_DATE - 1, NULL,
        'ffff0000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_attachments
  (id, workspace_id, project_id, relationship_id, attached_by)
VALUES ('ffff0000-0000-0000-0000-0000000000f1','ffff0000-0000-0000-0000-0000000000c1',
        'ffff0000-0000-0000-0000-0000000000a1','ffff0000-0000-0000-0000-0000000000e1',
        'ffff0000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ─── The Member's own consent root, then a delegated child ────────
-- Root: source = member_consent, parent_grant_id NULL (migration 191's CHECK).
INSERT INTO public.workspace_grants
  (id, workspace_id, relationship_id, permission, source, parent_grant_id, granted_by)
VALUES ('ffff0000-0000-0000-0000-000000000091','ffff0000-0000-0000-0000-0000000000c1',
        'ffff0000-0000-0000-0000-0000000000e1','view_summaries','member_consent',NULL,
        'ffff0000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Delegated child of that root — used to prove revocation kills descendants.
INSERT INTO public.workspace_grants
  (id, workspace_id, relationship_id, permission, source, parent_grant_id, granted_by)
VALUES ('ffff0000-0000-0000-0000-000000000092','ffff0000-0000-0000-0000-0000000000c1',
        'ffff0000-0000-0000-0000-0000000000e1','view_summaries','delegated',
        'ffff0000-0000-0000-0000-000000000091','ffff0000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ─── Enable the D-56 kill switch (BRANCH ONLY) ────────────────────
UPDATE public.workspace_access_config SET enabled = TRUE;

SELECT 'SEEDED. Kill switch is now ON for this branch. Run file B2 next.' AS status,
       (SELECT count(*) FROM public.workspace_members)  AS members,
       (SELECT count(*) FROM public.workspace_grants)   AS grants,
       (SELECT enabled  FROM public.workspace_access_config) AS kill_switch_enabled;
