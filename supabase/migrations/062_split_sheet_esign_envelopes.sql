-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 17: Split-Sheet E-Sign)
-- Migration 062: esign_envelopes + esign_envelope_signers, split_sheets
--                 status widening, first_viewed_at nudge column, and the
--                 tiered calculate_vault_readiness redefinition.
-- Run via: supabase db push
--
-- AM-5: this phase claims migration numbers 062+ (Phase 16's drafted plans
-- reference 062-066 and get a migration-number touch-up before Phase 16
-- executes — not this migration's concern).
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push against the remote database is a human-gated checkpoint at
-- the end of plan 17-02 (mirrors migration 058's "do not push from an
-- executor agent" convention). This file is authored and tested
-- (string-assertion test in __tests__/migration-062.test.ts) but must not
-- be applied automatically.
-- ============================================================

-- ─── esign_envelopes ──────────────────────────────────────────────────────
-- One row per DocuSeal submission ATTEMPT. A void→re-mint cycle (P17-02)
-- INSERTs a new row rather than overwriting the prior attempt, preserving
-- audit history of every voided mint alongside the eventually-completed one.
CREATE TABLE esign_envelopes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_sheet_id         UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL,
  docuseal_submission_id TEXT,
  docuseal_template_id   TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'completed', 'voided', 'expired')),
  order_mode             TEXT NOT NULL DEFAULT 'random', -- parallel async signing (P17-01/P17-02)
  executed_file_path     TEXT, -- release-documents storage path, set on webhook completion
  audit_log_path         TEXT, -- Certificate of Signature storage path
  billed                 BOOLEAN, -- null until the provider-gate void-billing answer is confirmed
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  voided_at              TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ
);

CREATE INDEX idx_esign_envelopes_split_sheet_id ON esign_envelopes (split_sheet_id);
CREATE INDEX idx_esign_envelopes_docuseal_submission_id ON esign_envelopes (docuseal_submission_id);

-- ─── esign_envelope_signers ───────────────────────────────────────────────
-- One row per party per attempt (one esign_envelopes row can have many
-- signers; a re-mint after a void creates a fresh set of signer rows tied
-- to the new envelope, not a mutation of the voided attempt's rows).
CREATE TABLE esign_envelope_signers (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  envelope_id            UUID REFERENCES esign_envelopes ON DELETE CASCADE NOT NULL,
  split_sheet_party_id   UUID REFERENCES split_sheet_parties ON DELETE CASCADE NOT NULL,
  docuseal_submitter_id  TEXT,
  signer_slug            TEXT, -- the /s/{slug} DocuSeal embed source
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'opened', 'completed', 'declined')),
  opened_at              TIMESTAMPTZ,
  signed_at              TIMESTAMPTZ
);

CREATE INDEX idx_esign_envelope_signers_envelope_id ON esign_envelope_signers (envelope_id);
CREATE INDEX idx_esign_envelope_signers_party_id ON esign_envelope_signers (split_sheet_party_id);

-- ─── Server-owned write doctrine (migrations 040/056/058) ────────────────
-- Signing-state rows must be server-owned: no authenticated/anon client may
-- INSERT/UPDATE/DELETE. All writes happen via service-role routes (mint,
-- void, webhook — 17-06/17-07) after their own ownership/cap checks.
REVOKE INSERT, UPDATE, DELETE ON esign_envelopes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON esign_envelope_signers FROM authenticated, anon;

ALTER TABLE esign_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE esign_envelope_signers ENABLE ROW LEVEL SECURITY;

-- SELECT policies mirror split_sheet_parties' "Initiator sees all" +
-- "Party sees own row" pair from migration 018.
CREATE POLICY "Initiator sees all envelopes" ON esign_envelopes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheets
      WHERE id = esign_envelopes.split_sheet_id AND initiator_user_id = auth.uid()
    )
  );
CREATE POLICY "Party sees own sheet's envelopes" ON esign_envelopes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheet_parties
      WHERE split_sheet_parties.split_sheet_id = esign_envelopes.split_sheet_id
        AND auth.uid() = split_sheet_parties.user_id
    )
  );

CREATE POLICY "Initiator sees all signers" ON esign_envelope_signers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM esign_envelopes
      JOIN split_sheets ON split_sheets.id = esign_envelopes.split_sheet_id
      WHERE esign_envelopes.id = esign_envelope_signers.envelope_id
        AND split_sheets.initiator_user_id = auth.uid()
    )
  );
CREATE POLICY "Party sees own signer row" ON esign_envelope_signers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheet_parties
      WHERE split_sheet_parties.id = esign_envelope_signers.split_sheet_party_id
        AND auth.uid() = split_sheet_parties.user_id
    )
  );

COMMENT ON TABLE esign_envelopes IS
  'One row per DocuSeal submission attempt for a split sheet (P17-02: void→re-mint preserves prior attempts as separate rows). Server-owned writes only; SELECT scoped to the sheet initiator and named parties.';
COMMENT ON TABLE esign_envelope_signers IS
  'One row per party per envelope attempt. Server-owned writes only; SELECT scoped to the sheet initiator and the signer''s own row.';

-- ─── split_sheets.status widening ─────────────────────────────────────────
-- The pipeline now has two additional stages beyond migration 018's
-- draft/pending_approval/approved/countered: esign_pending (envelope minted,
-- awaiting signatures) and executed (all parties signed).
ALTER TABLE split_sheets DROP CONSTRAINT IF EXISTS split_sheets_status_check;
ALTER TABLE split_sheets ADD CONSTRAINT split_sheets_status_check
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'countered', 'esign_pending', 'executed'));

-- ─── split_sheet_parties.first_viewed_at (P17-04 nudge tracking) ─────────
-- Set the first time /approve/[token] is rendered for this party — distinct
-- from DocuSeal's own form.viewed webhook, which only fires once the party
-- reaches the DocuSeal-hosted embed, not Funūn's own approval/sign page.
ALTER TABLE split_sheet_parties
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;

-- ─── calculate_vault_readiness: tiered split-sheet derivation (P17-03) ───
-- Redefines the trigger function (previously defined in migration 016) to
-- teach the split_sheets item a pessimistic-MIN 5/10/15 tier read from
-- split_sheets.status, using the SAME numbers as SPLIT_SHEET_TIER_MAP in
-- lib/vault/readiness-tiers.ts (RESEARCH Pitfall 3 — the SQL trigger and
-- its TS twin, readinessItemsForProject(), must not drift). The existing
-- signed-vault_documents branch is preserved unchanged as an equally valid
-- route to 15 points, so wet-sign uploads (AM-1's universal fallback)
-- still reach full credit. Every other scoring branch is byte-identical to
-- migration 016 — this is a derivation change only, not a points/registry
-- change (the item stays 15 points in READINESS_ITEMS).
create or replace function public.calculate_vault_readiness(project_uuid uuid)
returns integer
language plpgsql
as $function$
DECLARE
  score        INTEGER := 0;
  project_type TEXT;
  dist         TEXT;
  track_count  INTEGER;
  doc_count    INTEGER;
  sheet_tier   INTEGER;
BEGIN
  SELECT type, distributor INTO project_type, dist FROM vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score (unchanged)
  IF project_type = 'snippet' THEN
    IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type IN ('lyric_card','snippet_visual')) THEN
      score := score + 40;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'dropready') THEN
      score := score + 30;
    END IF;
    IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'soundbait') THEN
      score := score + 30;
    END IF;
    RETURN score;
  END IF;

  -- All other types: full score
  SELECT COUNT(*) INTO track_count FROM tracks WHERE project_id = project_uuid;
  IF track_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM vault_assets WHERE project_id = project_uuid AND type = 'cover_art') THEN
    score := score + 10;
  END IF;

  -- Split sheets: legacy wet-sign-upload path (AM-1 universal fallback,
  -- unchanged) OR the new pipeline-aware pessimistic-MIN tier across every
  -- split sheet tied to this project.
  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';

  SELECT MIN(
    CASE ss.status
      WHEN 'executed'         THEN 15
      WHEN 'esign_pending'    THEN 10
      WHEN 'approved'         THEN 10
      WHEN 'countered'        THEN 5
      WHEN 'pending_approval' THEN 5
      ELSE 0 -- 'draft'
    END
  ) INTO sheet_tier
  FROM split_sheets ss
  WHERE ss.vault_project_id = project_uuid;

  IF doc_count > 0 THEN
    score := score + 15; -- legacy wet-sign-upload path, unchanged
  ELSIF sheet_tier IS NOT NULL THEN
    score := score + sheet_tier; -- new pipeline-aware tiering
  END IF;

  IF EXISTS (SELECT 1 FROM vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  -- PRO registration proxy: at least one track has an ISWC captured. (trimmed 10 -> 5)
  IF EXISTS (
    SELECT 1 FROM tracks
    WHERE project_id = project_uuid AND iswc IS NOT NULL AND iswc <> ''
  ) THEN
    score := score + 5;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  -- EPK generated (a promo asset). (trimmed 10 -> 5)
  IF EXISTS (SELECT 1 FROM tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 5;
  END IF;

  -- Metadata captured: every track has composers whose splits total 100%.
  IF track_count > 0 AND NOT EXISTS (
    SELECT 1 FROM tracks t
    WHERE t.project_id = project_uuid
      AND COALESCE((
        SELECT ROUND(SUM((c ->> 'split')::numeric), 2)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.metadata -> 'composers') = 'array'
               THEN t.metadata -> 'composers'
               ELSE '[]'::jsonb END
        ) c
      ), 0) <> 100
  ) THEN
    score := score + 10;
  END IF;

  -- Distributor selected — the hard "ready to upload" gate. (+10)
  IF dist IS NOT NULL AND dist <> '' THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100);
END;
$function$;

-- Recompute every project's score so the new weighting takes effect immediately.
update vault_projects set vault_readiness_score = calculate_vault_readiness(id);
