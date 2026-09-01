-- ============================================================
-- Funūn — Writer's Room existing-collaborator repair
-- Migration 148: restore collaborator archive state, reconcile duplicate
--                pending memberships to claimed Funūn accounts, and expire
--                obsolete signup invitations.
--
-- Production evidence (2026-09-01): the collaborators table lacked the
-- archived_at column first introduced by migration 026. The Writer's Room
-- manual-email lookup filtered on that missing column, ignored the query
-- error, created fresh unclaimed collaborator rows, and sent signup invites
-- to people who already held claimed Funūn accounts.
--
-- Identity safety: a duplicate is merged only when it shares BOTH roster
-- owner and normalized email with a claimed canonical collaborator. Typed
-- email alone never supplies the destination user id; claimed_by remains the
-- verified account signal.
-- ============================================================

-- Repair schema drift forward rather than editing migration 026, which is in
-- applied history. is_favorite was introduced in the same statement and is
-- restored defensively for environments that missed that whole ALTER.
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_collaborators_active_owner
  ON public.collaborators (user_id, created_at)
  WHERE archived_at IS NULL;

-- A duplicate pending work member may collide with a membership already
-- linked to the canonical collaborator/user on the same work. In that case
-- the canonical membership wins and the redundant pending membership is
-- removed before the remaining rows are repointed.
WITH ranked_pairs AS (
  SELECT
    duplicate.id AS duplicate_id,
    canonical.id AS canonical_id,
    canonical.claimed_by AS canonical_user_id,
    row_number() OVER (
      PARTITION BY duplicate.id
      ORDER BY canonical.created_at ASC, canonical.id ASC
    ) AS match_rank
  FROM public.collaborators duplicate
  JOIN public.collaborators canonical
    ON canonical.user_id = duplicate.user_id
   AND lower(trim(canonical.email)) = lower(trim(duplicate.email))
   AND canonical.id <> duplicate.id
   AND canonical.claimed_by IS NOT NULL
  WHERE duplicate.claimed_by IS NULL
    AND duplicate.email IS NOT NULL
), duplicate_pairs AS (
  SELECT duplicate_id, canonical_id, canonical_user_id
  FROM ranked_pairs
  WHERE match_rank = 1
)
DELETE FROM public.work_members duplicate_member
USING duplicate_pairs pair
WHERE duplicate_member.collaborator_id = pair.duplicate_id
  AND EXISTS (
    SELECT 1
    FROM public.work_members existing_member
    WHERE existing_member.work_id = duplicate_member.work_id
      AND existing_member.id <> duplicate_member.id
      AND (
        existing_member.collaborator_id = pair.canonical_id
        OR existing_member.user_id = pair.canonical_user_id
      )
  );

-- Repoint the pending membership to the canonical roster identity and grant
-- access through that identity's verified Funūn user id.
WITH ranked_pairs AS (
  SELECT
    duplicate.id AS duplicate_id,
    canonical.id AS canonical_id,
    canonical.claimed_by AS canonical_user_id,
    row_number() OVER (
      PARTITION BY duplicate.id
      ORDER BY canonical.created_at ASC, canonical.id ASC
    ) AS match_rank
  FROM public.collaborators duplicate
  JOIN public.collaborators canonical
    ON canonical.user_id = duplicate.user_id
   AND lower(trim(canonical.email)) = lower(trim(duplicate.email))
   AND canonical.id <> duplicate.id
   AND canonical.claimed_by IS NOT NULL
  WHERE duplicate.claimed_by IS NULL
    AND duplicate.email IS NOT NULL
), duplicate_pairs AS (
  SELECT duplicate_id, canonical_id, canonical_user_id
  FROM ranked_pairs
  WHERE match_rank = 1
)
UPDATE public.work_members member
SET
  collaborator_id = pair.canonical_id,
  user_id = pair.canonical_user_id
FROM duplicate_pairs pair
WHERE member.collaborator_id = pair.duplicate_id
  AND (member.user_id IS NULL OR member.user_id = pair.canonical_user_id);

-- If a claimed collaborator was already selected before this repair but its
-- membership somehow remained pending, restore the same bridge invariant as
-- migration 136 without waiting for claimed_by to change again.
DELETE FROM public.work_members pending_member
USING public.collaborators claimed
WHERE pending_member.collaborator_id = claimed.id
  AND pending_member.user_id IS NULL
  AND claimed.claimed_by IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.work_members existing_member
    WHERE existing_member.work_id = pending_member.work_id
      AND existing_member.id <> pending_member.id
      AND existing_member.user_id = claimed.claimed_by
  );

UPDATE public.work_members member
SET user_id = claimed.claimed_by
FROM public.collaborators claimed
WHERE member.collaborator_id = claimed.id
  AND member.user_id IS NULL
  AND claimed.claimed_by IS NOT NULL;

-- The duplicate's signup link is no longer a valid next action: its matching
-- person already owns a Funūn account and now has direct room access.
WITH ranked_pairs AS (
  SELECT
    duplicate.id AS duplicate_id,
    row_number() OVER (
      PARTITION BY duplicate.id
      ORDER BY canonical.created_at ASC, canonical.id ASC
    ) AS match_rank
  FROM public.collaborators duplicate
  JOIN public.collaborators canonical
    ON canonical.user_id = duplicate.user_id
   AND lower(trim(canonical.email)) = lower(trim(duplicate.email))
   AND canonical.id <> duplicate.id
   AND canonical.claimed_by IS NOT NULL
  WHERE duplicate.claimed_by IS NULL
    AND duplicate.email IS NOT NULL
), duplicate_pairs AS (
  SELECT duplicate_id
  FROM ranked_pairs
  WHERE match_rank = 1
)
UPDATE public.collaborator_invites invite
SET status = 'expired'
FROM duplicate_pairs pair
WHERE invite.collaborator_id = pair.duplicate_id
  AND invite.status = 'pending';

-- Archive rather than delete the duplicate collaborator. This removes it
-- from My Roster pickers while preserving audit history and invite records.
WITH ranked_pairs AS (
  SELECT
    duplicate.id AS duplicate_id,
    row_number() OVER (
      PARTITION BY duplicate.id
      ORDER BY canonical.created_at ASC, canonical.id ASC
    ) AS match_rank
  FROM public.collaborators duplicate
  JOIN public.collaborators canonical
    ON canonical.user_id = duplicate.user_id
   AND lower(trim(canonical.email)) = lower(trim(duplicate.email))
   AND canonical.id <> duplicate.id
   AND canonical.claimed_by IS NOT NULL
  WHERE duplicate.claimed_by IS NULL
    AND duplicate.email IS NOT NULL
), duplicate_pairs AS (
  SELECT duplicate_id
  FROM ranked_pairs
  WHERE match_rank = 1
)
UPDATE public.collaborators duplicate
SET archived_at = COALESCE(duplicate.archived_at, now())
FROM duplicate_pairs pair
WHERE duplicate.id = pair.duplicate_id;

NOTIFY pgrst, 'reload schema';
