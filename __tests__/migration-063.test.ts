import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/063_split_sheet_legal_grade.sql'),
  'utf8'
)

describe('migration 063 — legal-grade split-sheet document fields (P17-09)', () => {
  describe('split_sheet_parties: per-writer legal/publishing fields', () => {
    it('adds legal_name, publishing_designee, administrator additively', () => {
      expect(migration).toMatch(/ALTER TABLE split_sheet_parties[\s\S]*?ADD COLUMN IF NOT EXISTS legal_name\s+TEXT/)
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS publishing_designee\s+TEXT/)
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS administrator\s+TEXT/)
    })
  })

  describe('split_sheets: standalone work-detail fields', () => {
    it('adds artist_name, album_project_title, record_label additively', () => {
      expect(migration).toMatch(/ALTER TABLE split_sheets[\s\S]*?ADD COLUMN IF NOT EXISTS artist_name\s+TEXT/)
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS album_project_title\s+TEXT/)
      expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS record_label\s+TEXT/)
    })
  })

  describe('artist_profiles: administrator (decision 3a prefill source)', () => {
    it('adds the column additively', () => {
      expect(migration).toMatch(/ALTER TABLE artist_profiles[\s\S]*?ADD COLUMN IF NOT EXISTS administrator\s+TEXT/)
    })

    it('documents the column-privilege doctrine (migration 040) rather than granting the column to authenticated/anon', () => {
      expect(migration).toMatch(/migration 040/i)
      // No actual SQL GRANT statement in this migration at all — administrator
      // inherits migration 040's private-by-default posture with no new
      // REVOKE/GRANT needed (see the comment above the ALTER TABLE).
      const sqlLines = migration.split('\n').map(l => l.trim())
      expect(sqlLines.some(l => /^GRANT\s/i.test(l))).toBe(false)
    })
  })

  describe('collaborators: administrator (recommended)', () => {
    it('adds the column additively', () => {
      expect(migration).toMatch(/ALTER TABLE collaborators[\s\S]*?ADD COLUMN IF NOT EXISTS administrator\s+TEXT/)
    })
  })

  describe('additive-only constraint (no existing column or constraint altered)', () => {
    it('never uses ALTER COLUMN, DROP COLUMN, or DROP CONSTRAINT', () => {
      expect(migration).not.toMatch(/ALTER COLUMN/i)
      expect(migration).not.toMatch(/DROP COLUMN/i)
      expect(migration).not.toMatch(/DROP CONSTRAINT/i)
    })

    it('every ADD COLUMN uses the IF NOT EXISTS additive form', () => {
      const addColumnLines = migration
        .split('\n')
        .filter(line => /ADD COLUMN/i.test(line))
      expect(addColumnLines.length).toBeGreaterThan(0)
      for (const line of addColumnLines) {
        expect(line).toMatch(/ADD COLUMN IF NOT EXISTS/i)
      }
    })

    it('does not touch the split_percentage 100% CHECK or the readiness trigger (062 owns it)', () => {
      expect(migration).not.toMatch(/CHECK\s*\([^)]*split_percentage/i)
      expect(migration).not.toMatch(/calculate_vault_readiness/i)
    })

    it('never adds a NOT NULL column without a DEFAULT', () => {
      expect(migration).not.toMatch(/ADD COLUMN[^,;]*NOT NULL(?!\s+DEFAULT)/i)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
