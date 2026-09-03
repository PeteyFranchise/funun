-- ============================================================
-- Funūn — Writer's Room vocal direction
-- Migration 159: keep uncast creative direction separate from people.
-- ============================================================

ALTER TABLE public.lyric_blocks
  ADD COLUMN vocal_direction TEXT
  CHECK (
    vocal_direction IS NULL
    OR char_length(vocal_direction) BETWEEN 1 AND 160
  );

COMMENT ON COLUMN public.lyric_blocks.vocal_direction IS
  'Optional uncast creative direction for a lyric section, such as gospel choir or raspy alto. Never a performer identity, room membership, invitation, writing credit, ownership fact, or split-sheet party.';

NOTIFY pgrst, 'reload schema';
