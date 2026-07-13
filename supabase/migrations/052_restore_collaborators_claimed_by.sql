-- ============================================================
-- Funūn — Runtime repair: collaborator claim column
-- Migration 052: ensure collaborator claiming has its backing column
-- ============================================================

-- Older code and migrations rely on collaborators.claimed_by, but the live
-- database can drift if the original additive migration partially applied.
-- Re-assert the column and its read policy defensively before the
-- claim_collaborators RPC runs.
ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_collaborators_claimed_by
  ON public.collaborators (claimed_by);

DROP POLICY IF EXISTS "Claimed users see own credits" ON public.collaborators;
CREATE POLICY "Claimed users see own credits" ON public.collaborators
  FOR SELECT
  USING (auth.uid() = claimed_by);

NOTIFY pgrst, 'reload schema';

