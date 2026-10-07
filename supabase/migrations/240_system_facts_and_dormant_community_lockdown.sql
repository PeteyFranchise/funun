-- 240_system_facts_and_dormant_community_lockdown.sql
--
-- Pass 6's medium findings, first instalment: the four surfaces whose correct
-- shape is fully determined by their existing callers. The other four (works,
-- tool_outputs, collaborator_invites, pitches) involve judgement about what a
-- collaborator may legitimately change and are deliberately left for their own
-- migration rather than rushed in behind these.
--
-- ═══ (1) notifications — provenance is not client-writable ════════════════
--
-- Migration 009:83-85 grants `FOR UPDATE ... USING (auth.uid() = user_id)`
-- over the WHOLE ROW, so the recipient of a notification can rewrite its type,
-- actor snapshot, payload and timestamps. Pass 6: "notification provenance is
-- not authoritative."
--
-- Verified callers, every reference in app/ and lib/:
--   app/api/notifications/route.ts:69   .update({ read: true })   authenticated
--   app/api/connections/route.ts:196    .update({ read: true })   service
--   lib/notifications/index.ts:75       .insert(...)              service
--
-- So `read` is the only column any client legitimately changes. Everything
-- else is written once by the service and must stay as filed.

CREATE OR REPLACE FUNCTION public.notifications_guard_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  -- Every column except `read`. Listed positively rather than as "not read" so
  -- a column added later is NOT silently writable: a new column simply is not
  -- guarded until someone adds it here, which is visible, whereas an
  -- exclusion list would quietly admit it.
  v_changing BOOLEAN :=
       NEW.user_id    IS DISTINCT FROM OLD.user_id
    OR NEW.type       IS DISTINCT FROM OLD.type
    OR NEW.data       IS DISTINCT FROM OLD.data
    OR NEW.created_at IS DISTINCT FROM OLD.created_at;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'notifications: only the read flag may be changed by a client; a notification''s subject, type, payload and timestamp are the record of what happened'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notifications_guard_provenance() IS
  'BEFORE UPDATE guard on public.notifications (migration 240) closing a Pass 6 medium finding. Migration 009''s FOR UPDATE policy covers the whole row, so a recipient could rewrite type, actor payload and timestamps. The only client write in the corpus is .update({ read: true }) (app/api/notifications/route.ts:69), so everything else is service-written and stays as filed.';

REVOKE EXECUTE ON FUNCTION public.notifications_guard_provenance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_guard_provenance ON public.notifications;
CREATE TRIGGER notifications_guard_provenance
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_provenance();

-- ═══ (2) opportunity_matches — the score is computed, not claimed ═════════
--
-- Migration 009:44-45 lets the SUBJECT of a match update their own row, so an
-- artist can rewrite the `match_score` and `breakdown` the matcher produced
-- about them.
--
-- Verified: match_score/breakdown are written ONLY by lib/matching/run.ts
-- (service, :105 update and :111 insert). The three artist-facing pages
-- (antenna, antenna/[id], opportunities/[id]) only SELECT.
--
-- The UPDATE policy is kept rather than dropped -- a future "dismiss this
-- match" affordance is a plausible use of it -- but the computed columns and
-- the row's subject are closed.

CREATE OR REPLACE FUNCTION public.opportunity_matches_guard_computed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := (SELECT auth.role());
  v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
  v_changing BOOLEAN :=
       NEW.match_score    IS DISTINCT FROM OLD.match_score
    OR NEW.breakdown      IS DISTINCT FROM OLD.breakdown
    OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    OR NEW.project_id     IS DISTINCT FROM OLD.project_id
    OR NEW.user_id        IS DISTINCT FROM OLD.user_id;
BEGIN
  IF v_changing AND NOT v_privileged THEN
    RAISE EXCEPTION 'opportunity_matches.match_score and breakdown are produced by the matcher and cannot be set by the artist they describe'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.opportunity_matches_guard_computed() IS
  'BEFORE UPDATE guard on public.opportunity_matches (migration 240). Migration 009''s policy lets the subject of a match update their own row; this stops them rewriting the match_score and breakdown the matcher computed about them, or re-pointing the row at a different opportunity, project or user. Written only by lib/matching/run.ts under the service role.';

REVOKE EXECUTE ON FUNCTION public.opportunity_matches_guard_computed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS opportunity_matches_guard_computed ON public.opportunity_matches;
CREATE TRIGGER opportunity_matches_guard_computed
  BEFORE UPDATE ON public.opportunity_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.opportunity_matches_guard_computed();

-- ═══ (3) community_posts — you may only post as yourself ══════════════════
--
-- Migration 001:318-325's INSERT policy checks that the caller holds a
-- qualifying subscription and NEVER that `user_id = auth.uid()`. Any
-- subscriber can therefore post as any other user.
--
-- DORMANT: zero references to this table anywhere in app/, lib/ or
-- components/ (full-corpus grep). Nothing can break, and the fix is cheap --
-- which is exactly why it should be done now rather than left as a trap for
-- whoever revives the feature.

DROP POLICY IF EXISTS "Pro+ users can post" ON public.community_posts;

CREATE POLICY "community_posts_insert_own" ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = (SELECT auth.uid())
        AND tier IN ('pro', 'studio', 'founding')
        AND status = 'active'
    )
  );

-- ═══ (4) community_comments — `USING (true)` is the whole problem ═════════
--
-- Migration 001:338-339 is an implicit FOR ALL with `USING (true)`:
--
--   CREATE POLICY "Members can comment" ON community_comments
--     USING (true) WITH CHECK (auth.uid() = user_id);
--
-- No command list, so it covers SELECT, INSERT, UPDATE and DELETE, and
-- USING (true) means every row is a valid TARGET. The WITH CHECK only
-- constrains what the row looks like AFTERWARDS -- so an UPDATE can take over
-- anyone's comment by setting user_id to self, and DELETE is unconstrained for
-- any role holding the table privilege, anon included.
--
-- Replaced with per-command policies. SELECT stays open (it is a community
-- feed); writing is yours alone.

DROP POLICY IF EXISTS "Members can comment" ON public.community_comments;

CREATE POLICY "community_comments_select_all" ON public.community_comments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "community_comments_insert_own" ON public.community_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "community_comments_update_own" ON public.community_comments
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "community_comments_delete_own" ON public.community_comments
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- anon holds no business writing either table. A table-level REVOKE removes
-- exactly the privilege granted at the same level -- unlike migration 230's
-- column-level attempt, which could not remove a table-level grant and was a
-- silent no-op.
REVOKE INSERT, UPDATE, DELETE ON public.community_posts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.community_comments FROM anon;

NOTIFY pgrst, 'reload schema';

-- ─── OWNER-RUN BEHAVIORAL VERIFICATION ────────────────────────────────────
--
--   N1  MUST FAIL 42501  -- recipient rewrites a notification's type or data
--   N2  MUST SUCCEED     -- recipient sets read = true (the one live write)
--   N3  MUST SUCCEED     -- service_role inserts a notification
--
--   O1  MUST FAIL 42501  -- artist rewrites their own match_score
--   O2  MUST SUCCEED     -- service_role updates match_score (the matcher)
--
--   C1  MUST FAIL (0 rows) -- subscriber inserts a post as another user
--   C2  MUST FAIL (0 rows) -- member updates someone else's comment
--   C3  MUST FAIL (0 rows) -- member deletes someone else's comment
--   C4  MUST SUCCEED       -- member inserts, updates and deletes their own
--
-- N2 and O2 are the ones that matter most: a guard that blocked marking a
-- notification read, or blocked the matcher from scoring, would be worse than
-- the exposure it closes.
