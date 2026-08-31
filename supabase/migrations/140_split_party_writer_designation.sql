-- Migration 140: a DDEX/PRO writer designation on a split-sheet party
--
-- ─── Why this exists ────────────────────────────────────────────────
-- Owner directive (2026-08-30): credits + split sheets stay DDEX- and
-- PRO-compliant. A writer party has always carried a name and a share but
-- no standardized ROLE, so a sheet could not register with a PRO (which
-- needs a CWR writer-designation code) or export via a distributor's DDEX
-- feed (which needs a DDEX work-contributor role) without someone
-- re-keying it by hand.
--
-- This adds `writer_designation` — a small, CHECK-constrained set that maps
-- 1:1 to both standards (see lib/catalogue/designation.ts): composer (CWR
-- C / DDEX Composer), lyricist (A / Lyricist), composer_lyricist (CA /
-- ComposerLyricist), arranger (AR / Arranger), adapter (AD / Adapter),
-- translator (TR / Translator). Captured when a writer is added to the
-- sheet (the "add yourself / mark as writer" flow).
--
-- It is DELIBERATELY a NEW column, not a repurposing of the legacy free-
-- text `role` (migration 018: "lyrics, melody, production, etc."). That
-- column is informal, un-constrained, and read/written by the pre-37
-- release split-sheet flows; constraining it now could reject existing
-- data. The two coexist: `role` stays the legacy note, `writer_designation`
-- is the compliant, machine-mappable field.
--
-- NULLABLE by design: every existing party, and any party added without a
-- stated role, is NULL — the CHECK admits NULL. No default is set; a blank
-- designation is an honest "not stated yet", never a fabricated Composer.
-- No RLS change (the pair is migration 064's de-recursed set; 37.1 reaches
-- it by service role after an access check — migration 137's decided
-- posture) and no new grant (service role bypasses column grants).

ALTER TABLE public.split_sheet_parties
  ADD COLUMN IF NOT EXISTS writer_designation TEXT
    CHECK (
      writer_designation IS NULL
      OR writer_designation IN (
        'composer',
        'lyricist',
        'composer_lyricist',
        'arranger',
        'adapter',
        'translator'
      )
    );

COMMENT ON COLUMN public.split_sheet_parties.writer_designation IS
  'DDEX/PRO writer role for this party (composer | lyricist | composer_lyricist | arranger | adapter | translator), or NULL when not stated. Maps 1:1 to CWR writer-designation codes and DDEX work-contributor roles — see lib/catalogue/designation.ts. Distinct from the legacy free-text `role` column (migration 018).';

NOTIFY pgrst, 'reload schema';
