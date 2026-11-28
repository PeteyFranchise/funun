-- 248_crate_song_expand.sql
--
-- PHASE 50.5B — THE CAPTURE FOUNDATION. Expand-only.
--
-- HUMAN-GATED. Never `supabase db push` from an agent session. This migration
-- requires a separate adversarial review before the owner applies it.
--
-- WHAT THIS IS FOR. Today The Crate has no record of its own: `sync_listings`
-- (096:29-52) stores a status and eight timestamps, so every buyer-facing answer
-- is produced by dereferencing the artist's live Vault rows. Replacing the audio
-- silently changes the song a buyer is looking at, and deleting the vault folder
-- takes the listing with it by ON DELETE CASCADE (096:31-32). Owner decision D-16:
-- admission CAPTURES the song. D-17: capture is a COPY, not a reference. D-18:
-- the reviewed playback is required, a master or instrumental is a candidate, and
-- stems are not captured at admission.
--
-- EXPAND-ONLY, AND "BACKWARD COMPATIBLE" RATHER THAN "ADDITIVE". Every commercial
-- reference added to an already-deployed table is NULLABLE here and stays nullable
-- until 250 contracts, after an automated zero-reader zero-writer check. That is
-- NOT a universal rule: identity columns INSIDE the new tables below are NOT NULL
-- from the start.
--
-- WHY SO MANY COMPOSITE FOREIGN KEYS. PostgreSQL's default MATCH SIMPLE skips a
-- composite foreign key entirely when ANY of its columns is NULL. An earlier
-- revision of this design declared only one column NOT NULL and claimed
-- cross-song attachment was "unrepresentable"; it was not, because the FKs
-- containing the nullable column were simply not checked. Hence: every identity
-- column participating in a composite FK below is NOT NULL, and no FK in this
-- chain uses ON DELETE SET NULL, which would write a NULL back into a validated
-- row and reopen the same hole.

BEGIN;

-- ─── (0) Shared append-only guard ─────────────────────────────────────────
--
-- Evidence tables are append-only. This is enforced by an UNCONDITIONAL trigger,
-- not by grants and not by a GUC check. Two reasons, both learned here:
-- a previous design exempted `service_role`, which is the role the privileged
-- application already uses, so the guarantee excluded the only path that mattered;
-- and migration 233 shipped a SECURITY DEFINER guard whose GUC comparison
-- evaluated to NULL, so the IF never fired and the control was inert in
-- production. A trigger that always raises cannot be disarmed by a missing
-- setting. Corrections arrive as new rows.

CREATE OR REPLACE FUNCTION public.crate_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'relation % is append-only: % is not permitted. Record a correction as a new row.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

COMMENT ON FUNCTION public.crate_append_only() IS
  'Unconditional append-only guard for The Crate evidence tables. Raises on every UPDATE and DELETE for every role including service_role. Deliberately takes no GUC and checks no role: a conditional guard shipped inert to production once already (migration 233).';

-- ─── (1) crate_quality_reviews — the bytes that were reviewed ─────────────
--
-- Quality review today is five columns on the LISTING
-- (107_sync_listings_quality_review.sql:50-54) written by
-- app/api/sync-library/admin/[listingId]/quality/route.ts:97-105: a boolean, a
-- reviewer and a timestamp. Nothing records WHICH BYTES were approved, so capture
-- would depend on a verdict that cannot describe what it approved. Those five
-- columns keep working untouched; this table is the byte-level record.
--
-- Attribution is mandatory, not conventional. A review whose reviewer is unknown
-- is not evidence of a review, it is a row.

CREATE TABLE public.crate_quality_reviews (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id     UUID NOT NULL REFERENCES public.sync_listings(id) ON DELETE RESTRICT,
  source_bucket  TEXT NOT NULL,
  source_path    TEXT NOT NULL,
  sha256         TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0),
  mime_type      TEXT NOT NULL,

  -- OWNER DECISION 2026-11-28: this table means ONE thing — a named human
  -- approved THESE EXACT BYTES. An earlier attempt added a 'provenance' column
  -- so a backfill could live here as an "unreviewed review", which is a
  -- permanent semantic contradiction, and left every future consumer obliged to
  -- filter for it. Backfills now live in crate_backfill_attestations instead, so
  -- a row in THIS table is always and only evidence of human approval.
  reviewer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  verdict        TEXT NOT NULL CHECK (verdict IN ('passed', 'failed')),
  notes          TEXT
);

CREATE INDEX idx_crate_quality_reviews_listing
  ON public.crate_quality_reviews (listing_id, reviewed_at DESC);

CREATE TRIGGER crate_quality_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.crate_quality_reviews
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_quality_reviews IS
  'What a staff quality reviewer actually approved, identified by sha256 of the exact object. The legacy sync_listings.quality_* columns (107:50-54) record that a review happened; this records what it was of. Append-only: a corrected verdict is a new row.';

-- ─── (1b) crate_backfill_attestations — NOT a review ────────────────────
--
-- OWNER DECISION 2026-11-28, on the reviewer's recommendation. A backfill and a
-- quality review are different claims:
--
--   quality review       a named person approved these exact bytes
--   backfill attestation the system copied the current object, and NOBODY has
--                        confirmed it is the recording that was admitted
--
-- They are separate relations so the difference is structural rather than a
-- predicate every future writer must remember. A 50.5C approval writer holding
-- only an artifact id can require a passed quality review; a backfill
-- attestation cannot accidentally satisfy that, because it is not the same kind
-- of object and no foreign key reaches it.
--
-- An attestation is NEVER erased by a later re-review. It stays as truthful
-- historical evidence of how the song entered The Crate; the re-review appends a
-- real review of the captured object alongside it.

CREATE TABLE public.crate_backfill_attestations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id    UUID NOT NULL REFERENCES public.sync_listings(id) ON DELETE RESTRICT,
  source_bucket TEXT NOT NULL,
  source_path   TEXT NOT NULL,
  sha256        TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  mime_type     TEXT NOT NULL,

  -- The OPERATOR who ran the migration. Never the artist: the row is immutable,
  -- and recording the artist as having performed an operator's act is a false
  -- statement that can never be corrected.
  attested_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes         TEXT
);

CREATE INDEX idx_crate_backfill_attestations_listing
  ON public.crate_backfill_attestations (listing_id, attested_at DESC);

CREATE TRIGGER crate_backfill_attestations_append_only
  BEFORE UPDATE OR DELETE ON public.crate_backfill_attestations
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_backfill_attestations IS
  'A system statement that these bytes were copied from the live object at backfill time. NOT a review and deliberately not in crate_quality_reviews: nobody confirmed these are the bytes that were admitted, and the upload route permits replacing a track''s audio after admission. Survives a later re-review as historical evidence.';

-- ─── (2) crate_songs — the commercial identity ────────────────────────────
--
-- `id` IS the commercial identity (crate_song_id). source_track_id,
-- source_project_id and source_listing_id are PROVENANCE ONLY: never the
-- commercial identity, never cascade owners. Owner-confirmed 2026-11-20.

CREATE TABLE public.crate_songs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Provenance only. ON DELETE SET NULL is correct HERE and only here: these
  -- are not identity, and a vault deletion must not remove the captured song.
  source_track_id        UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  source_project_id      UUID REFERENCES public.vault_projects(id) ON DELETE SET NULL,

  -- The admission RPC's DATABASE idempotency boundary. sync_listings_active_track_uniq
  -- (096:63-65) is PARTIAL, so one track accumulates listings over time; without
  -- this a retried admission mints a second captured song. Never unique on
  -- source_track_id, source_project_id, or any checksum.
  source_listing_id      UUID UNIQUE REFERENCES public.sync_listings(id) ON DELETE SET NULL,

  -- A re-admission creates a NEW captured song that may name its predecessor.
  -- Not unique: withdrawal and re-admission can repeat.
  predecessor_crate_song_id UUID REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  CONSTRAINT crate_songs_no_self_predecessor CHECK (predecessor_crate_song_id <> id),

  -- Captured descriptive facts. Never dereferenced live from the Vault row.
  title                  TEXT NOT NULL,
  primary_artist_name    TEXT NOT NULL,
  captured_metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Captured owner/payee snapshot. The payment path reads the artist off the live
  -- project today, so a project edit must never change who gets paid.
  payee_user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payee_snapshot         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle PROJECTION. The event log is the history; this is what a reader
  -- asks. Advanced by compare-and-set against lifecycle_version in the same
  -- transaction as the event insert.
  lifecycle_state        TEXT NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_state IN ('draft', 'exposed', 'withdrawn', 'superseded')),
  lifecycle_version      INT NOT NULL DEFAULT 0,

  -- Current clearance assessment. The composite FK that forces same-song is added
  -- in section (6), once crate_clearance_assessments exists.
  current_assessment_id  UUID,

  -- M8 (review 2026-11-25): the compare-and-set counter for the assessment
  -- pointer. Separate from lifecycle_version because clearance advances and
  -- lifecycle transitions are different races. Omitting it would have forced a
  -- later slice to invent a different concurrency contract or alter production
  -- schema outside the approved 248/250 plan.
  assessment_version     INT NOT NULL DEFAULT 0,

  captured_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by            UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite targets other tables need to prove same-song membership.
  CONSTRAINT crate_songs_id_unique UNIQUE (id)
);

CREATE INDEX idx_crate_songs_lifecycle ON public.crate_songs (lifecycle_state, captured_at DESC);
CREATE INDEX idx_crate_songs_source_track ON public.crate_songs (source_track_id);

COMMENT ON TABLE public.crate_songs IS
  'The captured Crate song: one exact recording, identified by this id (crate_song_id) once Funun staff admit it. source_* columns are provenance only and are never the commercial identity. A vault edit or deletion never alters or removes this row; withdrawal is an explicit recorded act, not a cascade.';

COMMENT ON COLUMN public.crate_songs.source_listing_id IS
  'Provenance AND the admission idempotency boundary: UNIQUE so a retried capture cannot mint a second song for the same admission event.';

-- ─── (3) crate_song_artifacts — role-carrying, per D-18 ───────────────────
--
-- `role` is open text with a service-side allowlist in
-- lib/sync-library/crate-artifact.ts. Deliberately no enum and no CHECK: both
-- would require a migration to add an artifact kind, which is the thing this
-- design is avoiding.

CREATE TABLE public.crate_song_artifacts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crate_song_id         UUID NOT NULL REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  role                  TEXT NOT NULL,
  storage_bucket        TEXT NOT NULL,
  storage_path          TEXT NOT NULL,
  sha256                TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes            BIGINT NOT NULL CHECK (size_bytes > 0),
  mime_type             TEXT NOT NULL,
  source_bucket         TEXT NOT NULL,
  source_path           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed', 'superseded')),
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supersedes_artifact_id UUID,

  -- OWNER DECISION 2026-11-27: artifact lineage is LINEAR per captured song AND
  -- role. There is no case in this domain where one song and one role needs two
  -- parallel supersession histories: the roles already express the legitimate
  -- parallelism (a master and an instrumental are different roles, not competing
  -- branches), and D-18 closes the recording-version case because a re-admission
  -- creates a NEW captured song rather than branching the old song's artifacts.
  -- Branching would leave the (crate_song_id, role) current pointer naming one
  -- branch while another equally valid head had no defined status.
  chain_version          INT NOT NULL DEFAULT 1 CHECK (chain_version >= 1),
  supersedes_version     INT,

  -- A review_playback artifact must trace to EXACTLY ONE basis, and the two are
  -- mutually exclusive by construction: either a human approved these bytes, or
  -- a backfill attested that it copied them and nobody has. An artifact cannot
  -- be both, and cannot be neither.
  quality_review_id       UUID REFERENCES public.crate_quality_reviews(id) ON DELETE RESTRICT,
  backfill_attestation_id UUID REFERENCES public.crate_backfill_attestations(id) ON DELETE RESTRICT,
  CONSTRAINT crate_song_artifacts_playback_basis_xor CHECK (
    role <> 'review_playback'
    OR ((quality_review_id IS NOT NULL) <> (backfill_attestation_id IS NOT NULL))
  ),

  CONSTRAINT crate_song_artifacts_no_self_supersede CHECK (supersedes_artifact_id <> id),

  -- M6 plus the lineage decision: the predecessor must be the same song, the
  -- SAME ROLE, and the immediately preceding version. Same-song alone still let
  -- an instrumental claim it superseded that song's artwork, which is not
  -- lineage. Four columns, matching how approvals and manifests now work.
  CONSTRAINT crate_song_artifacts_predecessor_is_real
    FOREIGN KEY (supersedes_artifact_id, crate_song_id, role, supersedes_version)
    REFERENCES public.crate_song_artifacts (id, crate_song_id, role, chain_version)
    ON DELETE RESTRICT,

  -- One successor per predecessor: the chain cannot fork.
  CONSTRAINT crate_song_artifacts_linear_chain UNIQUE (supersedes_artifact_id),

  -- One root, and one row per version, per song and role: the chain cannot have
  -- two independent heads either, which is the hole the approvals chain had.
  CONSTRAINT crate_song_artifacts_one_per_song_role_version
    UNIQUE (crate_song_id, role, chain_version),

  CONSTRAINT crate_song_artifacts_chain_shape CHECK (
    (supersedes_artifact_id IS NULL) = (chain_version = 1)
    AND (supersedes_version IS NULL) = (chain_version = 1)
  ),
  CONSTRAINT crate_song_artifacts_chain_adjacent CHECK (
    supersedes_version IS NULL OR supersedes_version = chain_version - 1
  ),

  -- One stored object is captured once.
  CONSTRAINT crate_song_artifacts_object_unique UNIQUE (storage_bucket, storage_path),

  -- Composite targets. The three-column form is what lets a pointer or a manifest
  -- prove the artifact belongs to this song AND holds the role being claimed: a
  -- two-column (id, crate_song_id) target would let a (song, review_playback)
  -- pointer name that song's artwork with every declared constraint green.
  CONSTRAINT crate_song_artifacts_id_song UNIQUE (id, crate_song_id),
  CONSTRAINT crate_song_artifacts_id_song_role UNIQUE (id, crate_song_id, role),
  CONSTRAINT crate_song_artifacts_id_song_role_version
    UNIQUE (id, crate_song_id, role, chain_version)
);

CREATE INDEX idx_crate_song_artifacts_song_role
  ON public.crate_song_artifacts (crate_song_id, role, captured_at DESC);

COMMENT ON TABLE public.crate_song_artifacts IS
  'Files The Crate holds for a captured song, copied in rather than referenced (D-17). role is open text against a service-side allowlist (lib/sync-library/crate-artifact.ts) so a new kind needs no migration. review_playback is required at admission and must name the quality review whose sha256 it matched; a master or instrumental is a candidate; stems are not captured at admission (D-18).';

-- ─── (4) crate_song_current_artifacts — the per-role pointer ──────────────

CREATE TABLE public.crate_song_current_artifacts (
  crate_song_id UUID NOT NULL REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  role          TEXT NOT NULL,
  artifact_id   UUID NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (crate_song_id, role),

  -- Three columns, not two: the pointer must prove the artifact belongs to this
  -- song AND holds this role.
  CONSTRAINT crate_song_current_artifacts_same_song_and_role
    FOREIGN KEY (artifact_id, crate_song_id, role)
    REFERENCES public.crate_song_artifacts (id, crate_song_id, role) ON DELETE RESTRICT
);

COMMENT ON TABLE public.crate_song_current_artifacts IS
  'One current artifact per role per captured song, so the catalogue knows exactly which review_playback to sign when several versions exist. The composite FK carries role as well as song: without it a review_playback pointer could legally name that song''s artwork.';

-- ─── (5) crate_artifact_approvals — integrity is not approval ────────────
--
-- An earlier design put approval on the artifact as mutable columns, which means
-- a manifest citing that status can be flipped after the licence binds. Approval
-- is its own immutable record, and a reversal is a new row naming what it
-- supersedes. The pointer direction matters: an earlier revision put
-- `superseded_by_approval_id` on the OLD row, which requires UPDATEing a table
-- declared append-only, so either the field was unusable or the immutability was
-- a lie.

CREATE TABLE public.crate_artifact_approvals (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crate_song_id                UUID NOT NULL,
  artifact_id                  UUID NOT NULL,
  decision                     TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  approved_by                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approval_against_artifact_id UUID,
  basis                        TEXT NOT NULL,
  supersedes_approval_id       UUID,

  -- M7 (review 2026-11-25): UNIQUE (supersedes_approval_id) stops the chain
  -- FORKING but not CYCLING. PostgreSQL checks these non-deferrable FKs at
  -- statement completion, so one multi-row INSERT of "P1 supersedes P2, P2
  -- supersedes P1" satisfied every constraint. A monotonic counter makes a cycle
  -- unrepresentable rather than merely rejected.
  chain_version                INT NOT NULL DEFAULT 1 CHECK (chain_version >= 1),
  supersedes_version           INT,

  -- An approval must say what it was judged against; a rejection need not.
  CONSTRAINT crate_artifact_approvals_approved_needs_basis_artifact
    CHECK (decision <> 'approved' OR approval_against_artifact_id IS NOT NULL),

  -- Same-song, structurally. Cross-song approval is not merely rejected, it is
  -- unrepresentable: both columns are NOT NULL so MATCH SIMPLE cannot skip them.
  CONSTRAINT crate_artifact_approvals_artifact_same_song
    FOREIGN KEY (artifact_id, crate_song_id)
    REFERENCES public.crate_song_artifacts (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_artifact_approvals_against_same_song
    FOREIGN KEY (approval_against_artifact_id, crate_song_id)
    REFERENCES public.crate_song_artifacts (id, crate_song_id) ON DELETE RESTRICT,

  -- A supersession stays on the SAME artifact, and transitively the same song.
  CONSTRAINT crate_artifact_approvals_supersedes_same_artifact
    FOREIGN KEY (supersedes_approval_id, artifact_id)
    REFERENCES public.crate_artifact_approvals (id, artifact_id) ON DELETE RESTRICT,

  -- A LINEAR head, not a tree. Same-artifact alone does not stop two rows
  -- superseding one predecessor, which would make "is this superseded" ambiguous.
  CONSTRAINT crate_artifact_approvals_linear_chain UNIQUE (supersedes_approval_id),

  -- M7: an approval may not supersede itself. The manifests had this check and
  -- the approvals did not.
  CONSTRAINT crate_artifact_approvals_no_self_supersede
    CHECK (supersedes_approval_id <> id),
  CONSTRAINT crate_artifact_approvals_chain_shape CHECK (
    (supersedes_approval_id IS NULL) = (chain_version = 1)
    AND (supersedes_version IS NULL) = (chain_version = 1)
  ),
  CONSTRAINT crate_artifact_approvals_chain_adjacent CHECK (
    supersedes_version IS NULL OR supersedes_version = chain_version - 1
  ),
  CONSTRAINT crate_artifact_approvals_id_artifact_version
    UNIQUE (id, artifact_id, chain_version),

  -- M7, round two (review 2026-11-27): adjacency stopped cycles and
  -- UNIQUE (supersedes_approval_id) stopped forks from one predecessor, but
  -- nothing stopped MULTIPLE INDEPENDENT ROOTS. Two rows with chain_version = 1
  -- and a NULL predecessor both inserted cleanly, and each could then acquire its
  -- own version-2 successor, leaving parallel orphaned heads for one artifact.
  CONSTRAINT crate_artifact_approvals_one_root_per_artifact
    UNIQUE (artifact_id, chain_version),
  CONSTRAINT crate_artifact_approvals_predecessor_is_real
    FOREIGN KEY (supersedes_approval_id, artifact_id, supersedes_version)
    REFERENCES public.crate_artifact_approvals (id, artifact_id, chain_version) ON DELETE RESTRICT,

  CONSTRAINT crate_artifact_approvals_id_artifact UNIQUE (id, artifact_id),
  CONSTRAINT crate_artifact_approvals_id_song UNIQUE (id, crate_song_id)
);

CREATE INDEX idx_crate_artifact_approvals_song
  ON public.crate_artifact_approvals (crate_song_id, approved_at DESC);

CREATE TRIGGER crate_artifact_approvals_append_only
  BEFORE UPDATE OR DELETE ON public.crate_artifact_approvals
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_artifact_approvals IS
  'Immutable approval decisions on captured artifacts, separate from integrity (sha256) which lives on the artifact. A reversal is a new row naming what it supersedes, never an edit, and UNIQUE (supersedes_approval_id) keeps the chain linear so "is this superseded" has exactly one answer.';

-- ─── (6) crate_song_current_approvals — the CAS head ─────────────────────

CREATE TABLE public.crate_song_current_approvals (
  crate_song_id    UUID NOT NULL,
  artifact_id      UUID NOT NULL,
  approval_id      UUID NOT NULL,
  approval_version INT  NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (crate_song_id, artifact_id),

  CONSTRAINT crate_song_current_approvals_same_artifact
    FOREIGN KEY (approval_id, artifact_id)
    REFERENCES public.crate_artifact_approvals (id, artifact_id) ON DELETE RESTRICT,
  CONSTRAINT crate_song_current_approvals_same_song
    FOREIGN KEY (approval_id, crate_song_id)
    REFERENCES public.crate_artifact_approvals (id, crate_song_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.crate_song_current_approvals IS
  'The atomically maintained approval head per (song, artifact). Advanced by compare-and-set against approval_version, so two concurrent approvals cannot both believe they are current.';

-- ─── (7) crate_clearance_assessments — versioned, may regress ────────────
--
-- Malformed ancestry is made UNREPRESENTABLE rather than merely rejected by an
-- RPC: the predecessor's version is carried on the child row and constrained, so
-- the named predecessor must really hold that version, for this song, and must be
-- the immediate one.

CREATE TABLE public.crate_clearance_assessments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crate_song_id          UUID NOT NULL REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  version                INT  NOT NULL CHECK (version >= 1),
  previous_assessment_id UUID,
  previous_version       INT,
  created_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason                 TEXT NOT NULL,
  evidence_fingerprint   TEXT,

  CONSTRAINT crate_clearance_assessments_song_version UNIQUE (crate_song_id, version),
  CONSTRAINT crate_clearance_assessments_id_song UNIQUE (id, crate_song_id),
  CONSTRAINT crate_clearance_assessments_id_song_version UNIQUE (id, crate_song_id, version),

  -- Version 1 has no predecessor; every other version has BOTH fields.
  CONSTRAINT crate_clearance_assessments_origin_shape CHECK (
    (previous_assessment_id IS NULL) = (version = 1)
    AND (previous_version IS NULL) = (version = 1)
  ),
  -- Adjacency, in the row itself.
  CONSTRAINT crate_clearance_assessments_adjacent CHECK (
    previous_version IS NULL OR previous_version = version - 1
  ),
  -- The named predecessor must really hold that version, for this song.
  CONSTRAINT crate_clearance_assessments_predecessor_is_real
    FOREIGN KEY (previous_assessment_id, crate_song_id, previous_version)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id, version) ON DELETE RESTRICT
);

CREATE TRIGGER crate_clearance_assessments_append_only
  BEFORE UPDATE OR DELETE ON public.crate_clearance_assessments
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_clearance_assessments IS
  'Versioned clearance assessments for a captured song. May regress: a later version can be worse than its predecessor, and under D-20 a human decides what happens next rather than a rule classifying the change. Ancestry is structural, not RPC-enforced: the predecessor must hold version - 1 for this same song.';

CREATE TABLE public.crate_clearance_assessment_items (
  assessment_id     UUID NOT NULL REFERENCES public.crate_clearance_assessments(id) ON DELETE RESTRICT,
  requirement_key   TEXT NOT NULL,
  applicability     TEXT NOT NULL CHECK (applicability IN ('applicable', 'not_applicable')),
  state             TEXT NOT NULL CHECK (state IN ('satisfied', 'outstanding', 'unknown')),
  responsible_party TEXT,
  evidence_ref      TEXT,
  PRIMARY KEY (assessment_id, requirement_key)
);

CREATE TRIGGER crate_clearance_assessment_items_append_only
  BEFORE UPDATE OR DELETE ON public.crate_clearance_assessment_items
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_clearance_assessment_items IS
  'One row per requirement per assessment version. Append-only with its parent: a changed requirement produces a NEW assessment version rather than an UPDATE here.';

-- The song's current assessment must belong to the song. The song's own id is the
-- second column of the composite target, which is what forces that; without it a
-- song could name another song's assessment and only an RPC check would catch it.
ALTER TABLE public.crate_songs
  ADD CONSTRAINT crate_songs_current_assessment_same_song
  FOREIGN KEY (current_assessment_id, id)
  REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT;

-- ─── (8) crate_song_events — the lifecycle history ───────────────────────

CREATE TABLE public.crate_song_events (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crate_song_id           UUID NOT NULL REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  lifecycle_version_after INT  NOT NULL,
  kind                    TEXT NOT NULL,
  actor                   UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail                  JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- One event per version advance, so the log and the projection cannot silently
  -- disagree and the projection can be reconstructed from the log as an audit.
  CONSTRAINT crate_song_events_one_per_version UNIQUE (crate_song_id, lifecycle_version_after)
);

CREATE TRIGGER crate_song_events_append_only
  BEFORE UPDATE OR DELETE ON public.crate_song_events
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_song_events IS
  'Append-only lifecycle history for a captured song. crate_songs.lifecycle_state is the projection readers use; this is the record it must agree with. A re-admission is never a transition here: it creates a NEW captured song naming its predecessor.';

-- ─── (9) Nullable commercial references on DEPLOYED tables ───────────────
--
-- These are the backward-compatible half. Every column here is NULLABLE and stays
-- nullable until 250 contracts, after an automated zero-reader zero-writer check.
-- A NOT NULL on a column the deployed writer does not populate is an outage
-- window, not a tightening.

ALTER TABLE public.license_requests  ADD COLUMN IF NOT EXISTS crate_song_id UUID
  REFERENCES public.crate_songs(id) ON DELETE RESTRICT;
ALTER TABLE public.buyer_shortlists  ADD COLUMN IF NOT EXISTS crate_song_id UUID
  REFERENCES public.crate_songs(id) ON DELETE RESTRICT;
ALTER TABLE public.selects_tracks    ADD COLUMN IF NOT EXISTS crate_song_id UUID
  REFERENCES public.crate_songs(id) ON DELETE RESTRICT;

-- Snapshots of what the buyer was shown when the request was submitted.
ALTER TABLE public.license_requests
  ADD COLUMN IF NOT EXISTS clearance_assessment_id_at_submission UUID
    REFERENCES public.crate_clearance_assessments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS buyer_state_at_submission JSONB,
  ADD COLUMN IF NOT EXISTS terms_snapshot_at_submission JSONB;

-- The composite target the hold, authority and manifest records need to prove
-- same-song. id is already the primary key, so this adds no new uniqueness; it
-- exists so composite foreign keys can reference the pair.
ALTER TABLE public.license_requests
  ADD CONSTRAINT license_requests_id_crate_song UNIQUE (id, crate_song_id);

-- M2 (review 2026-11-25): the two expand columns were independently constrained,
-- so a request could record that the buyer saw ANOTHER SONG'S clearance state at
-- submission. Both columns are nullable, so MATCH SIMPLE leaves legacy rows
-- untouched; the pair is only checked once both are populated.
ALTER TABLE public.license_requests
  ADD CONSTRAINT license_requests_submission_assessment_same_song
  FOREIGN KEY (clearance_assessment_id_at_submission, crate_song_id)
  REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT;

-- Provenance integrity for the captured source reference.
ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_project_id_id_unique UNIQUE (project_id, id);

-- ─── (10) Holds, decisions and execution authority — D-20 ────────────────
--
-- D-20 (owner, 2026-11-20): staff may release a hold with a recorded reason, a
-- human accepts an improved assessment, and all four live request stages are
-- eligible. Because BOTH answers keep a person in the loop, nothing ever has to
-- decide whether a clearance change was better or worse — a design question
-- disappears rather than being answered.
--
-- There are NO release columns on the hold. An earlier revision gave it
-- released_at/released_by/release_reason, which makes release an UPDATE to a row
-- declared append-only. The columns were the lie, not the doctrine.

CREATE TABLE public.license_request_holds (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id               UUID NOT NULL,
  crate_song_id            UUID NOT NULL,
  triggering_assessment_id UUID NOT NULL,
  held_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Retry idempotency: re-firing the same advance cannot stack a second hold.
  CONSTRAINT license_request_holds_one_per_advance UNIQUE (request_id, triggering_assessment_id),

  -- M4 (review 2026-11-25): the composite target that lets coverage rows prove a
  -- hold and the decision covering it belong to the SAME REQUEST.
  CONSTRAINT license_request_holds_id_request UNIQUE (id, request_id),

  CONSTRAINT license_request_holds_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT license_request_holds_assessment_same_song
    FOREIGN KEY (triggering_assessment_id, crate_song_id)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT
);

CREATE TRIGGER license_request_holds_append_only
  BEFORE UPDATE OR DELETE ON public.license_request_holds
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.license_request_holds IS
  'A live request held because its song''s clearance assessment advanced. Deliberately has no release columns: release is an immutable attributable act recorded in license_request_hold_decisions, not an edit here. Stage eligibility (submitted, in_negotiation, terms_agreed, contract) is enforced in the RPC, not by a trigger on every request.';

CREATE TABLE public.license_request_hold_decisions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id             UUID NOT NULL,
  crate_song_id          UUID NOT NULL,
  decision               TEXT NOT NULL CHECK (decision IN ('released', 'reauthorized')),
  accepted_assessment_id UUID NOT NULL,
  decided_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mandatory on BOTH decision kinds. This reason is the entire control on the
  -- authority D-20 grants, so it may not be nullable for either.
  reason                 TEXT NOT NULL CHECK (btrim(reason) <> ''),

  CONSTRAINT license_request_hold_decisions_id_request UNIQUE (id, request_id),

  CONSTRAINT license_request_hold_decisions_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT license_request_hold_decisions_assessment_same_song
    FOREIGN KEY (accepted_assessment_id, crate_song_id)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT
);

CREATE TRIGGER license_request_hold_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.license_request_hold_decisions
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

-- ONE human act is ONE decision covering many holds. Recording a decision row per
-- hold would represent one click as several independent human judgements, which
-- is an audit that says something untrue.
CREATE TABLE public.license_request_hold_decision_holds (
  decision_id UUID NOT NULL,
  hold_id     UUID NOT NULL,

  -- M4 (review 2026-11-25): the request is carried HERE so both sides can be
  -- bound to it. With two independent single-column FKs, a decision on request A
  -- could cover a hold on request B, and UNIQUE (hold_id) then made B's hold
  -- appear permanently decided by a human act that never looked at it.
  request_id  UUID NOT NULL,

  PRIMARY KEY (decision_id, hold_id),

  -- A hold is decided once. A reversal is a new advance, a new hold and a new
  -- decision, never an edit.
  CONSTRAINT license_request_hold_decision_holds_once UNIQUE (hold_id),

  CONSTRAINT license_request_hold_decision_holds_decision_same_request
    FOREIGN KEY (decision_id, request_id)
    REFERENCES public.license_request_hold_decisions (id, request_id) ON DELETE RESTRICT,
  CONSTRAINT license_request_hold_decision_holds_hold_same_request
    FOREIGN KEY (hold_id, request_id)
    REFERENCES public.license_request_holds (id, request_id) ON DELETE RESTRICT
);

CREATE TRIGGER license_request_hold_decision_holds_append_only
  BEFORE UPDATE OR DELETE ON public.license_request_hold_decision_holds
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.license_request_hold_decision_holds IS
  'Which holds one human decision covered. UNIQUE (hold_id) keeps a hold decided exactly once while letting a single act clear several stacked holds, because a person who looked at the latest cumulative state and clicked once did not make three judgements.';

-- Inserting a hold decision atomically inserts the matching authority row naming
-- accepted_assessment_id. One RPC, one commit: there is no path where a hold is
-- decided and no authority exists, which is the gap that made an earlier design's
-- "released" state unable to execute.
CREATE TABLE public.license_request_execution_authority (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id             UUID NOT NULL,
  crate_song_id          UUID NOT NULL,
  accepted_assessment_id UUID NOT NULL,
  -- OWNER DECISION 2026-11-27: authority is GENERAL, with its provenance
  -- recorded. The review asked for decision_id NOT NULL on the grounds that
  -- authority only ever arises from a hold decision; the owner's answer is that a
  -- request whose clearance never changed must still be executable, so NOT NULL
  -- would make a clean first execution unrepresentable. Nullability is therefore
  -- kept AND tied to a declared kind, so the record always says which human act
  -- granted it rather than leaving a NULL to be interpreted.
  authority_kind         TEXT NOT NULL
    CHECK (authority_kind IN ('initial_acceptance', 'hold_decision')),
  decision_id            UUID,
  CONSTRAINT license_request_execution_authority_kind_matches_provenance CHECK (
    (authority_kind = 'hold_decision') = (decision_id IS NOT NULL)
  ),

  -- M4: the contract requires a stated basis, as it does for hold decisions.
  basis                  TEXT NOT NULL CHECK (btrim(basis) <> ''),

  granted_by             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT license_request_execution_authority_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT license_request_execution_authority_assessment_same_song
    FOREIGN KEY (accepted_assessment_id, crate_song_id)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT,

  -- M4: one authority per (request, accepted assessment). Re-granting for the
  -- same assessment is the same act, not a second one.
  CONSTRAINT license_request_execution_authority_one_per_assessment
    UNIQUE (request_id, accepted_assessment_id),

  CONSTRAINT license_request_execution_authority_decision_same_request
    FOREIGN KEY (decision_id, request_id)
    REFERENCES public.license_request_hold_decisions (id, request_id) ON DELETE RESTRICT
);

CREATE TRIGGER license_request_execution_authority_append_only
  BEFORE UPDATE OR DELETE ON public.license_request_execution_authority
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.license_request_execution_authority IS
  'Authority to execute a request, naming the exact assessment a human accepted. Execution requires BOTH no undecided hold AND an authority row naming the song''s CURRENT assessment: an undecided older hold means a change nobody looked at, and authority for a superseded assessment is stale.';

-- ─── (11) The delivery manifest ─────────────────────────────────────────
--
-- THE INVARIANT AN EARLIER REVISION GOT WRONG, stated so it is not lost: with
-- only approval_id NOT NULL, this row inserted cleanly and attached song B's
-- artifact to song A's request, every constraint green --
--
--   INSERT (request_id = R, crate_song_id = NULL, artifact_id = X, approval_id = P)
--     -> the two FKs containing crate_song_id are NOT CHECKED (MATCH SIMPLE)
--     -> (P, X) succeeds, because P really is X's approval
--
-- NOT NULL on all four identity columns is what makes the composite FKs
-- load-bearing at all. Without it they are decorative.

CREATE TABLE public.crate_delivery_manifests (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id             UUID NOT NULL,
  crate_song_id          UUID NOT NULL,
  version                INT  NOT NULL CHECK (version >= 1),
  accepted_assessment_id UUID NOT NULL,
  frozen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supersedes_manifest_id UUID,

  CONSTRAINT crate_delivery_manifests_request_version UNIQUE (request_id, version),
  CONSTRAINT crate_delivery_manifests_id_song UNIQUE (id, crate_song_id),
  CONSTRAINT crate_delivery_manifests_id_request UNIQUE (id, request_id),

  CONSTRAINT crate_delivery_manifests_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_delivery_manifests_assessment_same_song
    FOREIGN KEY (accepted_assessment_id, crate_song_id)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT,

  -- Supersession stays on the same request, and the chain cannot fork, exactly
  -- as approvals work. A partial unique index over "non-superseded" rows was
  -- considered and removed: a partial predicate cannot see whether a LATER row
  -- supersedes this one.
  CONSTRAINT crate_delivery_manifests_supersedes_same_request
    FOREIGN KEY (supersedes_manifest_id, request_id)
    REFERENCES public.crate_delivery_manifests (id, request_id) ON DELETE RESTRICT,
  CONSTRAINT crate_delivery_manifests_linear_chain UNIQUE (supersedes_manifest_id),
  CONSTRAINT crate_delivery_manifests_no_self_supersede CHECK (supersedes_manifest_id <> id),

  -- M7 (review 2026-11-25): UNIQUE stops a fork, not a cycle. version already
  -- exists here, so predecessor-version adjacency makes the cycle
  -- unrepresentable.
  supersedes_version     INT,
  CONSTRAINT crate_delivery_manifests_chain_shape CHECK (
    (supersedes_manifest_id IS NULL) = (version = 1)
    AND (supersedes_version IS NULL) = (version = 1)
  ),
  CONSTRAINT crate_delivery_manifests_chain_adjacent CHECK (
    supersedes_version IS NULL OR supersedes_version = version - 1
  ),
  CONSTRAINT crate_delivery_manifests_id_request_version
    UNIQUE (id, request_id, version),
  CONSTRAINT crate_delivery_manifests_predecessor_is_real
    FOREIGN KEY (supersedes_manifest_id, request_id, supersedes_version)
    REFERENCES public.crate_delivery_manifests (id, request_id, version) ON DELETE RESTRICT
);

CREATE TRIGGER crate_delivery_manifests_append_only
  BEFORE UPDATE OR DELETE ON public.crate_delivery_manifests
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_delivery_manifests IS
  'The manifest HEADER: the single thing a licence names. Without an aggregate a second freeze call could append another frozen set to the same request with every item-level constraint satisfied, and a licence would have nothing single to point at.';

CREATE TABLE public.crate_delivery_manifest_items (
  manifest_id    UUID NOT NULL,
  artifact_id    UUID NOT NULL,
  request_id     UUID NOT NULL,
  crate_song_id  UUID NOT NULL,
  approval_id    UUID NOT NULL,
  role           TEXT NOT NULL,
  sha256_at_bind TEXT NOT NULL CHECK (sha256_at_bind ~ '^[0-9a-f]{64}$'),
  bound_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One artifact cannot be listed twice in a manifest.
  PRIMARY KEY (manifest_id, artifact_id),

  CONSTRAINT crate_manifest_items_header_same_song
    FOREIGN KEY (manifest_id, crate_song_id)
    REFERENCES public.crate_delivery_manifests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_manifest_items_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,

  -- M5 (review 2026-11-25): the header FK proved the manifest belonged to the
  -- song and the request FK proved the request did, but nothing proved the
  -- manifest belonged to THAT REQUEST. Two buyers requesting the same song was
  -- all it took.
  CONSTRAINT crate_manifest_items_header_same_request
    FOREIGN KEY (manifest_id, request_id)
    REFERENCES public.crate_delivery_manifests (id, request_id) ON DELETE RESTRICT,
  CONSTRAINT crate_manifest_items_artifact_same_song_and_role
    FOREIGN KEY (artifact_id, crate_song_id, role)
    REFERENCES public.crate_song_artifacts (id, crate_song_id, role) ON DELETE RESTRICT,
  CONSTRAINT crate_manifest_items_approval_of_that_artifact
    FOREIGN KEY (approval_id, artifact_id)
    REFERENCES public.crate_artifact_approvals (id, artifact_id) ON DELETE RESTRICT,
  CONSTRAINT crate_manifest_items_approval_same_song
    FOREIGN KEY (approval_id, crate_song_id)
    REFERENCES public.crate_artifact_approvals (id, crate_song_id) ON DELETE RESTRICT
);

CREATE TRIGGER crate_delivery_manifest_items_append_only
  BEFORE UPDATE OR DELETE ON public.crate_delivery_manifest_items
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

COMMENT ON TABLE public.crate_delivery_manifest_items IS
  'What a frozen licence actually names, item by item. Four composite foreign keys beyond the header: two share crate_song_id, the other two chain identity through the artifact, which is what closes the loop. Every identity column is NOT NULL because PostgreSQL MATCH SIMPLE skips a composite FK when any column is NULL, and no FK here may use ON DELETE SET NULL, which would write a NULL back into a validated row.';

CREATE TABLE public.crate_request_current_manifests (
  request_id       UUID NOT NULL,
  crate_song_id    UUID NOT NULL,
  manifest_id      UUID NOT NULL,
  manifest_version INT  NOT NULL DEFAULT 0,
  frozen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (request_id),

  CONSTRAINT crate_request_current_manifests_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_request_current_manifests_names_a_real_manifest
    FOREIGN KEY (manifest_id, request_id)
    REFERENCES public.crate_delivery_manifests (id, request_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.crate_request_current_manifests IS
  'The frozen manifest head for a request, advanced by compare-and-set against manifest_version. Taking this row is step 4 of the global lock order (song, current approvals, current artifacts, manifest head, then license_requests in id order) which every transaction in this family obeys, INCLUDING the ones that start from the request side: execution, payment and migration 247''s checkout reset must take the song row first or they deadlock against an assessment advance.';

-- ─── (12) Contract identity ─────────────────────────────────────────────
--
-- Deals reference a Vault document today and nothing proves the signed document
-- names the same captured song and manifest. document_sha256 is what makes
-- "this is the document that was signed" checkable later rather than assumed.

CREATE TABLE public.crate_contract_snapshots (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id             UUID NOT NULL,
  crate_song_id          UUID NOT NULL,
  manifest_id            UUID NOT NULL,
  accepted_assessment_id UUID NOT NULL,
  document_id            UUID NOT NULL REFERENCES public.vault_documents(id) ON DELETE RESTRICT,
  document_sha256        TEXT NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  terms_snapshot         JSONB NOT NULL,
  signed_at              TIMESTAMPTZ NOT NULL,
  recorded_by            UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- One executed contract per request. A re-execution is a new request.
  CONSTRAINT crate_contract_snapshots_one_per_request UNIQUE (request_id),

  CONSTRAINT crate_contract_snapshots_request_same_song
    FOREIGN KEY (request_id, crate_song_id)
    REFERENCES public.license_requests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_contract_snapshots_assessment_same_song
    FOREIGN KEY (accepted_assessment_id, crate_song_id)
    REFERENCES public.crate_clearance_assessments (id, crate_song_id) ON DELETE RESTRICT,

  -- M3 (review 2026-11-25): manifest_id had NO foreign key at all, so a signed
  -- contract could name another song's manifest or a random UUID.
  CONSTRAINT crate_contract_snapshots_manifest_same_song
    FOREIGN KEY (manifest_id, crate_song_id)
    REFERENCES public.crate_delivery_manifests (id, crate_song_id) ON DELETE RESTRICT,
  CONSTRAINT crate_contract_snapshots_manifest_same_request
    FOREIGN KEY (manifest_id, request_id)
    REFERENCES public.crate_delivery_manifests (id, request_id) ON DELETE RESTRICT
);

CREATE TRIGGER crate_contract_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.crate_contract_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.crate_append_only();

-- ─── (13) Song terms ────────────────────────────────────────────────────

CREATE TABLE public.crate_song_terms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crate_song_id UUID REFERENCES public.crate_songs(id) ON DELETE RESTRICT,
  terms         JSONB NOT NULL DEFAULT '{}'::jsonb,
  authored_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.crate_song_terms.crate_song_id IS
  'Nullable in 248 like every other commercial reference added in this migration; NOT NULL waits for 250 after a zero-reader zero-writer check.';

-- ─── (14) crate_capture_orphans — durable cleanup ───────────────────────
--
-- "Capture is atomic" was withdrawn: Storage and Postgres cannot share a
-- transaction, and an orphaned private copy is always preferable to an admitted
-- song with no artifact.
--
-- LEASE FENCING is a real bug fix, not a nicety. Without a fencing token a worker
-- whose lease expired can finish its delete and mark the row deleted AFTER
-- another worker has already reacquired and acted on it. Acquiring bumps
-- lease_generation; every completion is conditional on the generation it was
-- handed, and zero rows updated means the worker was fenced out and must discard
-- its result rather than record it.

CREATE TABLE public.crate_capture_orphans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storage_bucket   TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  enqueued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner      TEXT,
  lease_expires_at TIMESTAMPTZ,
  lease_generation INT  NOT NULL DEFAULT 0,
  attempts         INT  NOT NULL DEFAULT 0,
  state            TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'leased', 'deleted', 'failed_terminal')),
  last_error       TEXT,

  CONSTRAINT crate_capture_orphans_object_unique UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX idx_crate_capture_orphans_claimable
  ON public.crate_capture_orphans (state, enqueued_at)
  WHERE state IN ('pending', 'leased');

COMMENT ON TABLE public.crate_capture_orphans IS
  'Private copies left behind when capture failed after the storage write. attempts increments on acquire; at 5 the row goes failed_terminal with last_error retained and is never leased again, because a terminal row is an alert rather than a silent grave. The reconciliation sweep is the BACKSTOP, not the mechanism: a queue entry can itself be lost before it is written.';

-- ─── (15) The private crate-audio bucket ────────────────────────────────
--
-- Provisioned BY MIGRATION, following the precedent set by 245: a bucket created
-- by hand is not reproducible and every production write fails until someone
-- notices. ON CONFLICT forces public = false, so a bucket of this id created
-- public by hand is flipped private by applying this migration.
--
-- The MIME list is the nine types lib/vault/track-audio.ts:7-15 actually accepts.
-- It is not a remembered list: an earlier session asserted audio/aiff, which
-- appears nowhere, and omitted three real types.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crate-audio',
  'crate-audio',
  false,
  52428800,
  ARRAY[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4',
    'audio/aac', 'audio/flac', 'audio/ogg', 'audio/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = false,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── (16) WHO MAY WRITE — the boundary (contract §4.12) ─────────────────
--
-- Round one of review skipped §4.12 entirely. Round two (2026-11-27) found the
-- first attempt still open, for three reasons worth stating because each is a
-- different way a privilege claim can read well and enforce nothing:
--
--   * Revoking only INSERT, UPDATE, DELETE and TRUNCATE left service_role with
--     the default TRIGGER privilege. It could attach crate_append_only() to a
--     MUTABLE projection such as crate_songs and block every future sanctioned
--     UPDATE. The fix is REVOKE ALL and then grant back only SELECT.
--   * §4.12 also required revoking CREATE on schema public from service_role.
--   * TRUNCATE does not fire row-level triggers, so statement-level guards are
--     needed behind the revoke, not instead of it.
--
-- Ownership transfer is LAST, after RLS, grants and triggers, and the executor's
-- temporary membership of the owning role is explicit: hosted Supabase has no
-- true superuser, and PostgreSQL requires the executor to be able to SET ROLE to
-- the new owner, so an implicit transfer can fail depending on server version and
-- createrole_self_grant.

-- The evidence owner. Attributes are hardened UNCONDITIONALLY rather than only at
-- creation: a role that already exists from an earlier environment could be
-- LOGIN or privileged, and trusting it would hand the boundary to whatever made it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'funun_crate_evidence') THEN
    CREATE ROLE funun_crate_evidence NOLOGIN NOINHERIT;
  END IF;
END
$$;

ALTER ROLE funun_crate_evidence NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- An application role that is a MEMBER of the owner inherits its rights and the
-- boundary is theatre. Fail loudly rather than transferring ownership into it.
DO $$
DECLARE offender TEXT;
BEGIN
  SELECT m.rolname INTO offender
    FROM pg_auth_members am
    JOIN pg_roles r ON r.oid = am.roleid
    JOIN pg_roles m ON m.oid = am.member
   WHERE r.rolname = 'funun_crate_evidence'
     AND m.rolname IN ('service_role', 'authenticated', 'anon', 'authenticator')
   LIMIT 1;
  IF offender IS NOT NULL THEN
    RAISE EXCEPTION
      'role % is a member of funun_crate_evidence; the write boundary would be inherited away', offender
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

COMMENT ON ROLE funun_crate_evidence IS
  'Owns The Crate capture and evidence tables. NOLOGIN, NOINHERIT. Writes reach these tables only through narrow SECURITY DEFINER functions owned by this role; service_role holds SELECT and EXECUTE, never INSERT, UPDATE, DELETE, TRUNCATE or TRIGGER.';

-- Owning a table in a schema requires CREATE on that schema.
GRANT CREATE ON SCHEMA public TO funun_crate_evidence;

-- RLS on with ZERO policies. Belt, not braces: service_role carries BYPASSRLS in
-- Supabase, so RLS is not what stops it. The grants below are.
ALTER TABLE public.crate_quality_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_song_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_song_current_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_artifact_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_song_current_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_clearance_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_clearance_assessment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_song_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_request_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_request_hold_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_request_hold_decision_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_request_execution_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_delivery_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_delivery_manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_request_current_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_contract_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_song_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_capture_orphans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crate_backfill_attestations ENABLE ROW LEVEL SECURITY;

-- Browser roles: nothing at all.
REVOKE ALL ON public.crate_quality_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_songs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_song_artifacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_song_current_artifacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_artifact_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_song_current_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_clearance_assessments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_clearance_assessment_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_song_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.license_request_holds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.license_request_hold_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.license_request_hold_decision_holds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.license_request_execution_authority FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_delivery_manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_delivery_manifest_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_request_current_manifests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_contract_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_song_terms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_capture_orphans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crate_backfill_attestations FROM PUBLIC, anon, authenticated;

-- service_role: REVOKE ALL, not an enumerated list. The enumerated form left
-- TRIGGER behind, which was enough to sabotage the mutable projections.
REVOKE ALL ON public.crate_quality_reviews FROM service_role;
REVOKE ALL ON public.crate_songs FROM service_role;
REVOKE ALL ON public.crate_song_artifacts FROM service_role;
REVOKE ALL ON public.crate_song_current_artifacts FROM service_role;
REVOKE ALL ON public.crate_artifact_approvals FROM service_role;
REVOKE ALL ON public.crate_song_current_approvals FROM service_role;
REVOKE ALL ON public.crate_clearance_assessments FROM service_role;
REVOKE ALL ON public.crate_clearance_assessment_items FROM service_role;
REVOKE ALL ON public.crate_song_events FROM service_role;
REVOKE ALL ON public.license_request_holds FROM service_role;
REVOKE ALL ON public.license_request_hold_decisions FROM service_role;
REVOKE ALL ON public.license_request_hold_decision_holds FROM service_role;
REVOKE ALL ON public.license_request_execution_authority FROM service_role;
REVOKE ALL ON public.crate_delivery_manifests FROM service_role;
REVOKE ALL ON public.crate_delivery_manifest_items FROM service_role;
REVOKE ALL ON public.crate_request_current_manifests FROM service_role;
REVOKE ALL ON public.crate_contract_snapshots FROM service_role;
REVOKE ALL ON public.crate_song_terms FROM service_role;
REVOKE ALL ON public.crate_capture_orphans FROM service_role;
REVOKE ALL ON public.crate_backfill_attestations FROM service_role;

-- Then exactly one privilege back.
GRANT SELECT ON public.crate_quality_reviews TO service_role;
GRANT SELECT ON public.crate_songs TO service_role;
GRANT SELECT ON public.crate_song_artifacts TO service_role;
GRANT SELECT ON public.crate_song_current_artifacts TO service_role;
GRANT SELECT ON public.crate_artifact_approvals TO service_role;
GRANT SELECT ON public.crate_song_current_approvals TO service_role;
GRANT SELECT ON public.crate_clearance_assessments TO service_role;
GRANT SELECT ON public.crate_clearance_assessment_items TO service_role;
GRANT SELECT ON public.crate_song_events TO service_role;
GRANT SELECT ON public.license_request_holds TO service_role;
GRANT SELECT ON public.license_request_hold_decisions TO service_role;
GRANT SELECT ON public.license_request_hold_decision_holds TO service_role;
GRANT SELECT ON public.license_request_execution_authority TO service_role;
GRANT SELECT ON public.crate_delivery_manifests TO service_role;
GRANT SELECT ON public.crate_delivery_manifest_items TO service_role;
GRANT SELECT ON public.crate_request_current_manifests TO service_role;
GRANT SELECT ON public.crate_contract_snapshots TO service_role;
GRANT SELECT ON public.crate_song_terms TO service_role;
GRANT SELECT ON public.crate_capture_orphans TO service_role;
GRANT SELECT ON public.crate_backfill_attestations TO service_role;

-- §4.12: service_role must not be able to create objects in this schema either,
-- which would let it introduce its own writers beside these tables.
REVOKE CREATE ON SCHEMA public FROM service_role;

-- Statement-level TRUNCATE guards, because the row-level triggers cover UPDATE
-- and DELETE only. Defence in depth behind the REVOKE above.
CREATE TRIGGER crate_backfill_attestations_no_truncate
  BEFORE TRUNCATE ON public.crate_backfill_attestations
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_quality_reviews_no_truncate
  BEFORE TRUNCATE ON public.crate_quality_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_artifact_approvals_no_truncate
  BEFORE TRUNCATE ON public.crate_artifact_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_clearance_assessments_no_truncate
  BEFORE TRUNCATE ON public.crate_clearance_assessments
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_clearance_assessment_items_no_truncate
  BEFORE TRUNCATE ON public.crate_clearance_assessment_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_song_events_no_truncate
  BEFORE TRUNCATE ON public.crate_song_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER license_request_holds_no_truncate
  BEFORE TRUNCATE ON public.license_request_holds
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER license_request_hold_decisions_no_truncate
  BEFORE TRUNCATE ON public.license_request_hold_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER license_request_hold_decision_holds_no_truncate
  BEFORE TRUNCATE ON public.license_request_hold_decision_holds
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER license_request_execution_authority_no_truncate
  BEFORE TRUNCATE ON public.license_request_execution_authority
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_delivery_manifests_no_truncate
  BEFORE TRUNCATE ON public.crate_delivery_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_delivery_manifest_items_no_truncate
  BEFORE TRUNCATE ON public.crate_delivery_manifest_items
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();
CREATE TRIGGER crate_contract_snapshots_no_truncate
  BEFORE TRUNCATE ON public.crate_contract_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION public.crate_append_only();

-- M1 (review 2026-11-28): the definer functions run AS funun_crate_evidence,
-- which is NOINHERIT and owns none of the legacy tables. Without these grants
-- they fail at runtime with permission denied on the first SELECT. Column-level
-- so the role can read exactly the facts it must derive and nothing else —
-- note these are GRANTS, which are precise; a column-level REVOKE over a table
-- grant is the no-op this house shipped to production once already.
GRANT SELECT (id, status, track_id, vault_project_id, artist_user_id)
  ON public.sync_listings TO funun_crate_evidence;
GRANT SELECT (id, title, audio_file_url, project_id)
  ON public.tracks TO funun_crate_evidence;
GRANT SELECT (id, artist_name)
  ON public.user_profiles TO funun_crate_evidence;

-- OWNERSHIP TRANSFER LAST, with explicit temporary membership. PostgreSQL
-- requires the executor to be able to SET ROLE to the new owner; hosted Supabase
-- has no true superuser, so relying on an implicit grant is not portable.
GRANT funun_crate_evidence TO CURRENT_USER;

ALTER TABLE public.crate_quality_reviews OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_songs OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_song_artifacts OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_song_current_artifacts OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_artifact_approvals OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_song_current_approvals OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_clearance_assessments OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_clearance_assessment_items OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_song_events OWNER TO funun_crate_evidence;
ALTER TABLE public.license_request_holds OWNER TO funun_crate_evidence;
ALTER TABLE public.license_request_hold_decisions OWNER TO funun_crate_evidence;
ALTER TABLE public.license_request_hold_decision_holds OWNER TO funun_crate_evidence;
ALTER TABLE public.license_request_execution_authority OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_delivery_manifests OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_delivery_manifest_items OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_request_current_manifests OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_contract_snapshots OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_song_terms OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_capture_orphans OWNER TO funun_crate_evidence;
ALTER TABLE public.crate_backfill_attestations OWNER TO funun_crate_evidence;
ALTER FUNCTION public.crate_append_only() OWNER TO funun_crate_evidence;

REVOKE funun_crate_evidence FROM CURRENT_USER;

-- THE WRITERS THEMSELVES ARE NOT IN THIS MIGRATION. Each slice brings its own
-- narrow SECURITY DEFINER function, owned by funun_crate_evidence with a fixed
-- search_path, granting EXECUTE to service_role.
--
-- MIGRATION NUMBERING (owner decision 2026-11-27, correcting what this comment
-- said before): the "exactly two migrations" rule is retired. Writer expands are
-- 251+, allocated per slice, and the CONTRACT migration number is deliberately
-- UNALLOCATED until every expand is numbered, so it can sit above all of them. A
-- contract numbered below a later expand would, on a clean replay, tear down
-- transitional schema before that expand's consumers existed.
--
-- WHAT IS NOT PROVEN HERE, STATED PLAINLY. These REVOKEs and this ownership
-- transfer are asserted, not demonstrated. Before 50.5B's capture path is
-- enabled, probe the live database: confirm service_role is REFUSED on INSERT,
-- UPDATE, DELETE, TRUNCATE and TRIGGER for each table, with a must-succeed
-- control alongside. "The migration ran" and "the privilege is gone" are
-- separate claims, and this repository has shipped the gap between them before.

COMMIT;

NOTIFY pgrst, 'reload schema';
