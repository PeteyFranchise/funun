import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/069_split_sheet_change_summary.sql'),
  'utf8'
)

describe('migration 069 — split-sheet change summary (WR-03, P18-09)', () => {
  describe('split_sheets: last_change_summary', () => {
    it('adds last_change_summary additively as a nullable jsonb column', () => {
      expect(migration).toMatch(
        /ALTER TABLE split_sheets[\s\S]*?ADD COLUMN IF NOT EXISTS last_change_summary\s+jsonb/i
      )
    })

    it('does not add it NOT NULL (a pre-069 row must render with a null summary)', () => {
      expect(migration).not.toMatch(/last_change_summary[^,;]*NOT NULL/i)
    })
  })

  describe('additive-only constraint (no existing column or constraint altered)', () => {
    it('never uses ALTER COLUMN, DROP COLUMN, or DROP CONSTRAINT', () => {
      expect(migration).not.toMatch(/ALTER COLUMN/i)
      expect(migration).not.toMatch(/DROP COLUMN/i)
      expect(migration).not.toMatch(/DROP CONSTRAINT/i)
    })

    it('every ADD COLUMN uses the IF NOT EXISTS additive form', () => {
      const addColumnLines = migration.split('\n').filter(line => /ADD COLUMN/i.test(line))
      expect(addColumnLines.length).toBeGreaterThan(0)
      for (const line of addColumnLines) {
        expect(line).toMatch(/ADD COLUMN IF NOT EXISTS/i)
      }
    })
  })

  describe('P18-13 safety is documented', () => {
    it('records why no free-text channel and no column-lockdown are needed', () => {
      expect(migration).toMatch(/P18-13/)
      expect(migration).toMatch(/summarizePartyChanges/)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
