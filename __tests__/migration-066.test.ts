import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/066_split_sheet_identity_foundation.sql'),
  'utf8'
)

describe('migration 066 — split-sheet identity foundation (18-05)', () => {
  describe('collaborators: legal_name + status', () => {
    it('adds legal_name additively', () => {
      expect(migration).toMatch(/ALTER TABLE collaborators[\s\S]*?ADD COLUMN IF NOT EXISTS legal_name\s+TEXT/)
    })

    it('adds status NOT NULL DEFAULT confirmed additively', () => {
      expect(migration).toMatch(
        /ALTER TABLE collaborators[\s\S]*?ADD COLUMN IF NOT EXISTS status\s+TEXT NOT NULL DEFAULT 'confirmed'/
      )
    })

    it('constrains status to pending or confirmed via a CHECK constraint', () => {
      expect(migration).toMatch(/CHECK\s*\(status IN \('pending', 'confirmed'\)\)/)
    })
  })

  describe('artist_profiles: legal_name_locked_at', () => {
    it('adds the column additively as a nullable TIMESTAMPTZ', () => {
      expect(migration).toMatch(
        /ALTER TABLE artist_profiles[\s\S]*?ADD COLUMN IF NOT EXISTS legal_name_locked_at\s+TIMESTAMPTZ/
      )
    })

    it('documents the column-privilege doctrine (migration 040) rather than granting the column to authenticated/anon', () => {
      expect(migration).toMatch(/migration 040/i)
    })
  })

  describe('trigger 1: claimed ⇒ confirmed (BEFORE trigger on collaborators)', () => {
    it('defines the trigger function', () => {
      expect(migration).toMatch(
        /CREATE OR REPLACE FUNCTION public\.collaborators_claimed_implies_confirmed\(\)/
      )
      expect(migration).toMatch(/NEW\.claimed_by IS NOT NULL/)
      expect(migration).toMatch(/NEW\.status := 'confirmed'/)
    })

    it('drops before create for idempotent re-runs', () => {
      expect(migration).toMatch(
        /DROP TRIGGER IF EXISTS collaborators_claimed_implies_confirmed_trigger ON collaborators/
      )
    })

    it('wires a BEFORE INSERT OR UPDATE trigger on collaborators', () => {
      expect(migration).toMatch(
        /CREATE TRIGGER collaborators_claimed_implies_confirmed_trigger\s+BEFORE INSERT OR UPDATE ON collaborators/
      )
    })
  })

  describe('trigger 2: sheet-response ⇒ confirmed (AFTER trigger on split_sheet_parties)', () => {
    it('defines the SECURITY DEFINER trigger function', () => {
      expect(migration).toMatch(
        /CREATE OR REPLACE FUNCTION public\.split_sheet_party_response_confirms_collaborator\(\)/
      )
      expect(migration).toMatch(/SECURITY DEFINER/)
    })

    it('is scoped strictly by NEW.collaborator_id, never a client-supplied id', () => {
      expect(migration).toMatch(/WHERE id = NEW\.collaborator_id/)
    })

    it('guards on OLD.approval_status = pending and NEW.approval_status <> pending', () => {
      expect(migration).toMatch(/OLD\.approval_status = 'pending'/)
      expect(migration).toMatch(/NEW\.approval_status <> 'pending'/)
      expect(migration).toMatch(/NEW\.collaborator_id IS NOT NULL/)
    })

    it('is a no-op when the collaborator is already confirmed', () => {
      expect(migration).toMatch(/AND status <> 'confirmed'/)
    })

    it('drops before create for idempotent re-runs', () => {
      expect(migration).toMatch(
        /DROP TRIGGER IF EXISTS split_sheet_party_response_confirms_collaborator_trigger ON split_sheet_parties/
      )
    })

    it('wires an AFTER UPDATE OF approval_status trigger on split_sheet_parties', () => {
      expect(migration).toMatch(
        /CREATE TRIGGER split_sheet_party_response_confirms_collaborator_trigger\s+AFTER UPDATE OF approval_status ON split_sheet_parties/
      )
    })
  })

  describe('migration 026 (claim/backfill chain) is untouched', () => {
    it('never mutates backfill_claimed_collaborators or claim_collaborators function bodies', () => {
      expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.backfill_claimed_collaborators/)
      expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.claim_collaborators/)
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

    it('never adds a NOT NULL column without a DEFAULT', () => {
      expect(migration).not.toMatch(/ADD COLUMN[^,;]*NOT NULL(?!\s+DEFAULT)/i)
    })
  })

  describe('no GRANT statement is emitted', () => {
    it('emits no GRANT statement at all — legal_name_locked_at is private by omission', () => {
      const sqlLines = migration.split('\n').map(l => l.trim())
      expect(sqlLines.some(l => /^GRANT\s/i.test(l))).toBe(false)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
