import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/067_split_sheet_song_attachment.sql'),
  'utf8'
)

describe('migration 067 — song-level split-sheet attachment (18-03)', () => {
  describe('split_sheets: track_id + source', () => {
    it('adds track_id additively, nullable, ON DELETE SET NULL against tracks', () => {
      expect(migration).toMatch(
        /ALTER TABLE split_sheets[\s\S]*?ADD COLUMN IF NOT EXISTS track_id\s+UUID REFERENCES tracks ON DELETE SET NULL/
      )
    })

    it('adds source additively, NOT NULL DEFAULT funun, constrained to funun/uploaded', () => {
      expect(migration).toMatch(
        /ALTER TABLE split_sheets[\s\S]*?ADD COLUMN IF NOT EXISTS source\s+TEXT NOT NULL DEFAULT 'funun'/
      )
      expect(migration).toMatch(/CHECK\s*\(source IN \('funun', 'uploaded'\)\)/)
    })
  })

  describe('split_sheet_attachments: the join table', () => {
    it('creates the table with the columns design section 2b specifies', () => {
      expect(migration).toMatch(/CREATE TABLE split_sheet_attachments/)
      expect(migration).toMatch(
        /split_sheet_id\s+UUID REFERENCES split_sheets ON DELETE CASCADE NOT NULL/
      )
      expect(migration).toMatch(
        /vault_project_id\s+UUID REFERENCES vault_projects ON DELETE CASCADE NOT NULL/
      )
      expect(migration).toMatch(/track_id\s+UUID REFERENCES tracks ON DELETE SET NULL/)
      expect(migration).toMatch(/attached_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/)
      expect(migration).toMatch(/attached_by\s+UUID REFERENCES auth\.users/)
    })

    it('comments the opposite cascade choice at each foreign key', () => {
      expect(migration).toMatch(/cascades away/i)
      expect(migration).toMatch(/when its project is deleted/i)
      expect(migration).toMatch(/deleting a track must never delete the/i)
      expect(migration).toMatch(/legal record of who wrote it/i)
    })
  })

  describe('uniqueness — both the track-set and track-null cases', () => {
    it('has a partial unique index for the track-set case', () => {
      expect(migration).toMatch(
        /CREATE UNIQUE INDEX idx_split_sheet_attachments_unique_track[\s\S]*?ON split_sheet_attachments \(split_sheet_id, vault_project_id, track_id\)[\s\S]*?WHERE track_id IS NOT NULL/
      )
    })

    it('has a partial unique index for the track-null (project-level) case', () => {
      expect(migration).toMatch(
        /CREATE UNIQUE INDEX idx_split_sheet_attachments_unique_project_only[\s\S]*?ON split_sheet_attachments \(split_sheet_id, vault_project_id\)[\s\S]*?WHERE track_id IS NULL/
      )
    })

    it('explains why a plain 3-column UNIQUE constraint is insufficient', () => {
      expect(migration).toMatch(/NULLs as distinct|null values compare as distinct|treat NULLs as distinct/i)
    })
  })

  describe('server-owned write doctrine (RLS)', () => {
    it('revokes INSERT/UPDATE/DELETE/TRUNCATE from authenticated and anon', () => {
      expect(migration).toMatch(
        /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON split_sheet_attachments FROM authenticated, anon/
      )
    })

    it('enables row level security', () => {
      expect(migration).toMatch(/ALTER TABLE split_sheet_attachments ENABLE ROW LEVEL SECURITY/)
    })

    it('has an initiator-sees-all SELECT policy', () => {
      expect(migration).toMatch(/CREATE POLICY "Initiator sees all attachments"/)
    })

    it('has a party-sees-own SELECT policy', () => {
      expect(migration).toMatch(/CREATE POLICY "Party sees own sheet's attachments"/)
    })

    it('has a project-owner SELECT policy (new — the third path)', () => {
      expect(migration).toMatch(/CREATE POLICY "Project owner sees attachments to their release"/)
    })
  })

  describe('idempotent backfill', () => {
    it('inserts an attachment row for every sheet with a non-null vault_project_id', () => {
      expect(migration).toMatch(
        /INSERT INTO split_sheet_attachments[\s\S]*?FROM split_sheets ss[\s\S]*?WHERE ss\.vault_project_id IS NOT NULL/
      )
    })

    it('guards against re-run duplication with a NOT EXISTS check using IS NOT DISTINCT FROM for the null track case', () => {
      expect(migration).toMatch(/NOT EXISTS[\s\S]*?track_id IS NOT DISTINCT FROM ss\.track_id/)
    })

    it('carries the sheet track_id, created_at as attached_at, and initiator as attached_by', () => {
      expect(migration).toMatch(
        /SELECT ss\.id, ss\.vault_project_id, ss\.track_id, ss\.created_at, ss\.initiator_user_id/
      )
    })
  })

  describe('additive-only constraint (no existing column or constraint altered)', () => {
    it('never uses ALTER COLUMN or DROP COLUMN on an existing table', () => {
      expect(migration).not.toMatch(/ALTER COLUMN/i)
      expect(migration).not.toMatch(/DROP COLUMN/i)
    })

    it('does not drop any existing constraint', () => {
      expect(migration).not.toMatch(/DROP CONSTRAINT/i)
    })

    it('every split_sheets ADD COLUMN uses the IF NOT EXISTS additive form', () => {
      const addColumnLines = migration.split('\n').filter(line => /ADD COLUMN/i.test(line))
      expect(addColumnLines.length).toBeGreaterThan(0)
      for (const line of addColumnLines) {
        expect(line).toMatch(/ADD COLUMN IF NOT EXISTS/i)
      }
    })

    it('leaves split_sheets.vault_project_id untouched as the origin field', () => {
      expect(migration).not.toMatch(/ALTER TABLE split_sheets[\s\S]*?vault_project_id[\s\S]*?DROP/)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
