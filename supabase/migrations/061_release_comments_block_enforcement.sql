-- ============================================================
-- Funūn — Wave 4: The Green Room
-- Migration 061: wire no_block() into release_comments RLS
-- Run via: supabase db push
-- ============================================================
-- Closes the one DB-layer gap deferred by Plan 13-03's hard block
-- enforcement audit (13-03-SUMMARY.md): release_comments had no
-- no_block() wiring at all — migration 012's policies gate only on
-- project publicness and author ownership. The app layer already
-- pre-checks blocks (lib/social/comments.ts, app/api/release-comments),
-- so this is defense-in-depth aligning the database with the doctrine
-- established in migration 038: direct PostgREST access must agree with
-- the app about blocks.
--
-- Two block relationships matter for a comment on a release:
--   1. viewer <-> comment author  (blocked pairs never see each other's
--      comments, mirroring migration 060's interaction-visibility rule)
--   2. commenter <-> release owner (you cannot comment on the release of
--      someone you are blocked from, mirroring 038's wall/endorsement
--      WITH CHECK pattern)
-- no_block(a, b) is bidirectional and null-safe (no_block(NULL, x) is
-- true), so anonymous SELECTs on public releases keep working.
-- ============================================================

DROP POLICY IF EXISTS "rc_select_public" ON release_comments;
CREATE POLICY "rc_select_public" ON release_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vault_projects p
      WHERE p.id = project_id
        AND (p.is_public OR p.user_id = auth.uid())
        AND no_block(auth.uid(), p.user_id)
    )
    AND no_block(auth.uid(), author_id)
  );

DROP POLICY IF EXISTS "rc_insert_author" ON release_comments;
CREATE POLICY "rc_insert_author" ON release_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM vault_projects p
      WHERE p.id = project_id
        AND no_block(auth.uid(), p.user_id)
    )
  );

COMMENT ON TABLE release_comments IS
  'Threaded comments on public releases. Block-enforced both directions since migration 061 (SAFETY-01): blocked pairs cannot read each other''s comments, and a blocked user cannot comment on the blocker''s release. App layer pre-checks the same rule for friendly errors.';
