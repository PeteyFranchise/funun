-- ============================================================
-- Funūn — Phase 28 review fix (#2): stop Green Room authors from writing moderation-controlled
-- columns. Migration 093.
--
-- WHY: green_room_posts_update_own (migration 057) gates UPDATEs only by author_id = auth.uid(),
-- and authenticated holds Supabase's default table-wide UPDATE grant — so an author can PATCH
-- ANY column of their own post, including the moderation-controlled ones (moderation_status,
-- report_count, deleted_at). Failure scenario: a moderator hides a post; its author does a direct
-- PostgREST PATCH setting moderation_status back to 'visible' and resetting report_count, and the
-- ownership-only policy permits it. Flagged by the Codex review (finding #2).
--
-- WHAT: revoke the broad table-wide UPDATE from anon/authenticated and re-grant UPDATE ONLY on
-- the author-editable columns. The RLS row gate (author_id = auth.uid()) is unchanged, so authors
-- still edit only their OWN posts — and now only these columns. moderation_status / report_count /
-- deleted_at, plus the immutable id / author_id / created_at, become service-role-only (moderation
-- already runs through the service role). No client author-UPDATE path in the app touches the
-- excluded columns (authors INSERT and hard-DELETE; there is no author moderation write), so this
-- breaks no existing flow. INSERT / SELECT / DELETE grants are untouched. service_role bypasses.
--
-- HUMAN-GATED — never `supabase db push` from an agent; the owner reviews + pushes via Codex.
-- Do NOT edit migrations 057 / 088 (already live).
-- ============================================================

REVOKE UPDATE ON public.green_room_posts FROM anon, authenticated;

GRANT UPDATE (
  post_type,
  body,
  visibility,
  status,
  linked_object_type,
  linked_object_id,
  allow_resharing,
  published_at,
  updated_at
) ON public.green_room_posts TO authenticated;
