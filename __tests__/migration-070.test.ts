import { readFileSync } from 'fs'
import path from 'path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/070_readiness_definer_privilege_sweep.sql'),
  'utf8'
)

describe('migration 070 — readiness DEFINER + TRUNCATE/TRIGGER sweep (Phase 17 hardening)', () => {
  describe('item 1: TRUNCATE/TRIGGER privilege sweep on the five flagged tables', () => {
    const tables = [
      'capability_grants',
      'green_room_placements',
      'reports',
      'dm_threads',
      'dm_messages',
    ]
    for (const table of tables) {
      it(`revokes TRUNCATE, TRIGGER on ${table} from authenticated, anon`, () => {
        expect(migration).toMatch(
          new RegExp(`REVOKE TRUNCATE, TRIGGER ON ${table}\\s+FROM authenticated, anon;`)
        )
      })
    }
  })

  describe('item 2: calculate_vault_readiness → SECURITY DEFINER', () => {
    it('redefines the function as SECURITY DEFINER with an emptied search_path', () => {
      expect(migration).toMatch(
        /CREATE OR REPLACE FUNCTION public\.calculate_vault_readiness\(project_uuid uuid\)/
      )
      expect(migration).toMatch(/SECURITY DEFINER/)
      expect(migration).toMatch(/SET search_path = ''/)
    })

    it('schema-qualifies its table reads with public. (required once search_path is empty)', () => {
      expect(migration).toMatch(/FROM public\.vault_projects/)
      expect(migration).toMatch(/FROM public\.tracks/)
      expect(migration).toMatch(/JOIN public\.split_sheet_attachments/)
      expect(migration).toMatch(/JOIN public\.split_sheets/)
    })

    it('preserves the coverage scoring logic byte-for-byte (spot-check key values)', () => {
      // tier CASE values, legacy branch, proportional fallback, and the cap.
      expect(migration).toMatch(/WHEN 'executed'\s+THEN 15/)
      expect(migration).toMatch(/WHEN 'esign_pending'\s+THEN 10/)
      expect(migration).toMatch(/score := score \+ 15; -- legacy wet-sign-upload path/)
      expect(migration).toMatch(/ELSE ROUND\(AVG\(tier\)\)::INTEGER/)
      expect(migration).toMatch(/RETURN LEAST\(score, 100\)/)
    })
  })

  describe('item 2b: EXECUTE lockdown (close the direct-RPC oracle)', () => {
    it('revokes EXECUTE on the function from PUBLIC, anon, authenticated', () => {
      expect(migration).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.calculate_vault_readiness\(uuid\) FROM PUBLIC, anon, authenticated;/
      )
    })
  })

  describe('safety', () => {
    it('is non-destructive — no DROP of tables/columns/constraints', () => {
      expect(migration).not.toMatch(/DROP TABLE/i)
      expect(migration).not.toMatch(/DROP COLUMN/i)
      expect(migration).not.toMatch(/DROP CONSTRAINT/i)
      expect(migration).not.toMatch(/DROP FUNCTION/i)
    })

    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })
})
