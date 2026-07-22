-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 18: Split-Sheet Home)
-- Migration 067: song-level split-sheet attachment (18-03) —
-- split_sheets.track_id, split_sheets.source, the split_sheet_attachments
-- join table, and a backfill of every existing project association.
--
-- Feeds .planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md
-- section 2 (data model), section 3 (attach flow), and section 7 (edge
-- cases). A split sheet governs one composition, and a five-track EP
-- nearly always has five different split configurations — the sheet
-- itself has had no way to say which song it governs until now, and
-- 17-05's attach route could only ever target a project, never a track.
--
-- Strictly additive, matching migrations 018/026/040/062/063/066's
-- convention: every new column is nullable or NOT NULL-with-DEFAULT, the
-- new table is brand new, no existing column or constraint is dropped or
-- altered anywhere, and the backfill is written as an idempotent
-- insert-select so a re-run inserts no duplicates.
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is this plan's blocking human
-- checkpoint (Task 4), mirroring migrations 058/062/063/065/066's "do not
-- push from an executor agent" convention.
-- ============================================================

-- ─── split_sheets: track_id + source (design section 2a, P18-05) ────────
-- track_id is nullable — most sheets ARE song-specific (design section 2a
-- rationale: a 5-track EP nearly always has 5 different split
-- configurations), but a project-level "covers the whole release" sheet is
-- a genuine, explicitly-marked exception (design section 9 item 4), so the
-- column cannot be NOT NULL.
--
-- ON DELETE SET NULL, not CASCADE: deleting a track must never delete the
-- legal record of who wrote it. That sentence is the whole rationale for
-- every track_id cascade choice in this migration — here and on
-- split_sheet_attachments.track_id below.
--
-- source is NOT NULL DEFAULT 'funun', CHECK-constrained to the two
-- permitted values ('funun', 'uploaded'). Every existing row was generated
-- inside Funūn's own approval/e-sign pipeline, so the DEFAULT backfills
-- every pre-067 row correctly with no data migration needed. This ships
-- provenance from day one (P18-05 / design section 10d) — Phase 18 builds
-- no extraction of an uploaded sheet's parties/splits; the field exists so
-- that future work never has to guess which sheets were Funūn-authored.
ALTER TABLE split_sheets
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES tracks ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source   TEXT NOT NULL DEFAULT 'funun';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'split_sheets_source_check'
  ) THEN
    ALTER TABLE split_sheets
      ADD CONSTRAINT split_sheets_source_check CHECK (source IN ('funun', 'uploaded'));
  END IF;
END $$;

-- ─── split_sheet_attachments: the relationship, not a move ───────────────
-- A join table rather than a second foreign key (design section 2b):
-- the same composition routinely appears on a single AND an album — two
-- `tracks` rows, one composition, one split sheet. A track_id column alone
-- would force either a duplicate sheet (rejected) or an unattachable
-- second release. Attaching does not move a document; it creates a
-- relationship, and the sheet never leaves the Contract Locker.
--
-- Cascade choices, and why two of the four are deliberately opposite:
--   split_sheet_id  ON DELETE CASCADE — if the sheet itself is gone there
--                   is nothing left for the attachment to relate.
--   vault_project_id ON DELETE CASCADE — the attachment row cascades away
--                   when its project is deleted, so the sheet returns to
--                   Unattached in the Locker rather than pointing at a
--                   project that no longer exists (design section 7,
--                   "sheet attached, then project deleted").
--   track_id        ON DELETE SET NULL — a deleted track leaves the
--                   attachment alive at project level (design section 7,
--                   "sheet attached, then track deleted": the attachment
--                   survives with a "track removed" flag) and leaves the
--                   legal record of who wrote the song completely
--                   untouched. This is the opposite of the project cascade
--                   on purpose: losing the project genuinely means there
--                   is no release to be attached to; losing the track does
--                   not mean the composition or its signed agreement
--                   stopped existing.
CREATE TABLE split_sheet_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_sheet_id    UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL,
  vault_project_id  UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL,
  track_id          UUID REFERENCES tracks ON DELETE SET NULL,
  attached_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_by       UUID REFERENCES auth.users
);

CREATE INDEX idx_split_sheet_attachments_sheet_id   ON split_sheet_attachments (split_sheet_id);
CREATE INDEX idx_split_sheet_attachments_project_id ON split_sheet_attachments (vault_project_id);
CREATE INDEX idx_split_sheet_attachments_track_id   ON split_sheet_attachments (track_id);

-- ─── Uniqueness — the null-comparison trap ───────────────────────────────
-- A plain UNIQUE (split_sheet_id, vault_project_id, track_id) does NOT
-- prevent a duplicate when track_id is NULL, because Postgres unique
-- indexes treat NULLs as distinct from one another. The project-level
-- "covers the whole release" attachment is EXACTLY the case where track_id
-- is NULL — a naive constraint leaves the one case it most needs to guard
-- wide open. Two partial unique indexes close both halves:
CREATE UNIQUE INDEX idx_split_sheet_attachments_unique_track
  ON split_sheet_attachments (split_sheet_id, vault_project_id, track_id)
  WHERE track_id IS NOT NULL;

CREATE UNIQUE INDEX idx_split_sheet_attachments_unique_project_only
  ON split_sheet_attachments (split_sheet_id, vault_project_id)
  WHERE track_id IS NULL;

-- ─── Server-owned write doctrine (migrations 040/056/058/062) ────────────
-- Attachment happens only through the service-role attach/detach routes
-- (Task 2) after their own party-AND-owner authorization checks — never
-- directly from an authenticated or anonymous client.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON split_sheet_attachments FROM authenticated, anon;

ALTER TABLE split_sheet_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT policies model migration 018's initiator-sees-all + party-sees-own
-- pair, plus a third path: the destination project's owner can see what is
-- attached to their own release (this is new — 018's pair only ever
-- covered the sheet side of the relationship, and an attachment is now
-- also a project-side fact).
CREATE POLICY "Initiator sees all attachments" ON split_sheet_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheets
      WHERE id = split_sheet_attachments.split_sheet_id AND initiator_user_id = auth.uid()
    )
  );
CREATE POLICY "Party sees own sheet's attachments" ON split_sheet_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheet_parties
      WHERE split_sheet_parties.split_sheet_id = split_sheet_attachments.split_sheet_id
        AND auth.uid() = split_sheet_parties.user_id
    )
  );
CREATE POLICY "Project owner sees attachments to their release" ON split_sheet_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vault_projects
      WHERE vault_projects.id = split_sheet_attachments.vault_project_id
        AND vault_projects.user_id = auth.uid()
    )
  );

COMMENT ON TABLE split_sheet_attachments IS
  'The relationship set between a split sheet and the release(s)/track(s) it covers (design section 2b). split_sheets.vault_project_id/track_id remain the ORIGIN fields — where the sheet was born, if anywhere; this table is every place it has since been attached, including the same sheet attached to two releases (single + album). Server-owned writes only, via the attach/detach routes.';

-- ─── Backfill: every existing project association gets an attachment row ─
-- Idempotent by construction: the NOT EXISTS guard (matching NULL track_id
-- via IS NOT DISTINCT FROM, since `= NULL` is never true in SQL) means a
-- re-run of this migration inserts zero additional rows. Carries the
-- sheet's own track_id when set, its created_at as attached_at, and its
-- initiator as attached_by — the migration's one-shot best reconstruction
-- of "when was this attached and by whom" for data that predates the
-- attachments table existing at all.
INSERT INTO split_sheet_attachments (split_sheet_id, vault_project_id, track_id, attached_at, attached_by)
SELECT ss.id, ss.vault_project_id, ss.track_id, ss.created_at, ss.initiator_user_id
FROM split_sheets ss
WHERE ss.vault_project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM split_sheet_attachments sa
    WHERE sa.split_sheet_id = ss.id
      AND sa.vault_project_id = ss.vault_project_id
      AND sa.track_id IS NOT DISTINCT FROM ss.track_id
  );
