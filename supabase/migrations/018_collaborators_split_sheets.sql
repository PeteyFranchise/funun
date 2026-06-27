-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails
-- Migration 018: collaborators, split_sheets, split_sheet_parties,
--                collaborator_invites
-- All tables keyed by user_id so industry pros and non-artist
-- users can maintain their own roster (D-20).
-- Run via: supabase db push
-- ============================================================

-- ─── Collaborators ───────────────────────────────────────────
-- Global roster per user. One entry per person — reused across all
-- vault projects. No split % stored here (D-17).
CREATE TABLE collaborators (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name             TEXT NOT NULL,
  email            TEXT,
  phone            TEXT,
  pro              TEXT,          -- matches PRO type from lib/metadata/schema.ts
  ipi              TEXT,          -- IPI/CAE number registered with their PRO
  publisher        TEXT,
  mlc_id           TEXT,          -- The MLC member ID
  soundexchange_id TEXT,
  mailing_address  JSONB DEFAULT '{}', -- structured: street, city, state, zip, country
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collaborators" ON collaborators
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_collaborators_user_id ON collaborators (user_id);

-- ─── Split Sheets ─────────────────────────────────────────────
-- Standalone split sheet entity, decoupled from vault_projects (D-18).
-- vault_project_id is nullable — a split sheet can exist without a
-- linked project.
CREATE TABLE split_sheets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  initiator_user_id   UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  vault_project_id    UUID REFERENCES vault_projects ON DELETE SET NULL, -- nullable (D-18)
  song_name           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'pending_approval', 'approved', 'countered')),
  all_approved_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE split_sheets ENABLE ROW LEVEL SECURITY;
-- Initiator manages their own split sheets
CREATE POLICY "Initiator manages split sheet" ON split_sheets
  USING (auth.uid() = initiator_user_id) WITH CHECK (auth.uid() = initiator_user_id);
-- Party members can view split sheets they are named on (D-19)
CREATE POLICY "Parties can view split sheets" ON split_sheets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheet_parties
      WHERE split_sheet_id = split_sheets.id AND user_id = auth.uid()
    )
  );

-- ─── Split Sheet Parties ──────────────────────────────────────
-- One row per named party. Denormalized snapshot of contact/rights data
-- at creation time (legal documents should not change under collaborator
-- edits). email/name are intentionally frozen at creation (D-19, Pitfall 3).
CREATE TABLE split_sheet_parties (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  split_sheet_id    UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL,
  collaborator_id   UUID REFERENCES collaborators ON DELETE SET NULL, -- null if not in roster
  user_id           UUID REFERENCES auth.users ON DELETE SET NULL,    -- null until they sign up
  name              TEXT NOT NULL,     -- snapshot at time of creation (denormalized)
  email             TEXT,
  pro               TEXT,
  ipi               TEXT,
  split_percentage  NUMERIC(6,3) NOT NULL CHECK (split_percentage >= 0 AND split_percentage <= 100),
  role              TEXT,              -- lyrics, melody, production, etc.
  approval_status   TEXT NOT NULL DEFAULT 'pending'
                    CHECK (approval_status IN ('pending', 'approved', 'countered')),
  counter_proposal  NUMERIC(6,3),     -- filled when countered (D-16)
  approval_token    TEXT UNIQUE,       -- 64-char hex token for /approve/[token] page (D-15)
  token_expires_at  TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE split_sheet_parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Initiator sees all parties" ON split_sheet_parties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM split_sheets
      WHERE id = split_sheet_parties.split_sheet_id AND initiator_user_id = auth.uid()
    )
  );
CREATE POLICY "Party sees own row" ON split_sheet_parties
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_split_sheet_parties_sheet_id ON split_sheet_parties (split_sheet_id);
CREATE INDEX idx_split_sheet_parties_token    ON split_sheet_parties (approval_token);

-- ─── Collaborator Invites ─────────────────────────────────────
-- Tracks invite emails sent to collaborators who are missing IPI (D-08).
-- A collaborator without a user_id can be invited via this table.
-- Once accepted, accepted_user_id is populated and status → 'accepted'.
CREATE TABLE collaborator_invites (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collaborator_id   UUID REFERENCES collaborators ON DELETE CASCADE NOT NULL,
  inviting_user_id  UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  invited_email     TEXT NOT NULL,
  invite_token      TEXT UNIQUE NOT NULL, -- 64-char hex (crypto.randomBytes(32))
  token_expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired')),
  accepted_user_id  UUID REFERENCES auth.users ON DELETE SET NULL,
  sent_at           TIMESTAMPTZ DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ
);

ALTER TABLE collaborator_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inviting user manages invites" ON collaborator_invites
  USING (auth.uid() = inviting_user_id) WITH CHECK (auth.uid() = inviting_user_id);
CREATE INDEX idx_collaborator_invites_token     ON collaborator_invites (invite_token);
CREATE INDEX idx_collaborator_invites_collab_id ON collaborator_invites (collaborator_id);
