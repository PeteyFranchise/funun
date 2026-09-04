-- ============================================================
-- Funūn — Writer's Room hybrid layout
-- Migration 176: private per-user presentation state for one work.
--
-- HUMAN-GATED. Do not apply from an agent. The project owner runs
-- `supabase db push` after reviewing this file.
--
-- This table stores presentation only. It never changes lyric positions,
-- version numbering, Diary chronology, membership, or split ownership.
-- ============================================================

CREATE TABLE public.work_room_layouts (
  work_id    UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (work_id, user_id),
  CONSTRAINT work_room_layouts_layout_object
    CHECK (jsonb_typeof(layout) = 'object')
);

CREATE INDEX idx_work_room_layouts_user_updated
  ON public.work_room_layouts (user_id, updated_at DESC);

ALTER TABLE public.work_room_layouts ENABLE ROW LEVEL SECURITY;

-- A layout belongs to one authenticated viewer and only remains reachable
-- while that viewer can reach the work. Both conditions are repeated in
-- USING and WITH CHECK so an UPDATE cannot move a row to another user/work.
CREATE POLICY "work_room_layouts_own_access" ON public.work_room_layouts
  FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.is_work_owner(work_id, auth.uid()))
      OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (SELECT public.is_work_owner(work_id, auth.uid()))
      OR (SELECT public.work_member_tier(work_id, auth.uid())) IS NOT NULL
    )
  );

REVOKE ALL ON public.work_room_layouts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_room_layouts TO authenticated;

COMMENT ON TABLE public.work_room_layouts IS
  'Private per-user Writer''s Room presentation state. Never authoritative for lyrics, versions, Diary evidence, room access, or ownership.';

COMMENT ON COLUMN public.work_room_layouts.layout IS
  'Validated versioned JSON containing allowlisted lyric/module keys and full/half display widths.';
