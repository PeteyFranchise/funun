// Structural-proxy test for migration 068's coverage-based split-sheet
// readiness redefinition (P18-14/P18-15/P18-16, 18-04). Jest cannot
// execute PL/pgSQL, so this is a STRING-ASSERTION test in the style of
// __tests__/migration-062.test.ts — it confirms the SQL contains the
// structural elements each named scenario in lib/vault/coverage-fixtures.ts
// requires (the attachment join, the tier values, the minimum aggregate,
// the needing-set derivation including uncovered tracks, and the
// preserved legacy branch). It cannot prove the SQL computes the exact
// same numbers as the TS twin for a given scenario; that executable half
// of the parity is the human spot-check at this plan's blocking
// checkpoint against real data.

import { readFileSync } from 'fs'
import path from 'path'
import { COVERAGE_FIXTURES } from '@/lib/vault/coverage-fixtures'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/068_split_sheet_coverage_readiness.sql'),
  'utf8'
)

describe('migration 068 — coverage-based split-sheet readiness', () => {
  it('redefines calculate_vault_readiness', () => {
    expect(migration).toContain('create or replace function public.calculate_vault_readiness(project_uuid uuid)')
  })

  describe('the needing-set derivation — every track, including uncovered ones (P18-15)', () => {
    it('derives track_tiers from a LEFT JOIN starting at tracks, not an aggregate over attachments alone', () => {
      // A LEFT JOIN from tracks (rather than a plain JOIN/aggregate that
      // starts at split_sheet_attachments) is what keeps an uncovered
      // track in the needing set instead of silently dropping it — the
      // exact bug this migration exists to fix, reproduced in a new place
      // if this join direction were ever flipped.
      expect(migration).toMatch(/FROM tracks t\s*\n\s*LEFT JOIN split_sheet_attachments sa/)
      expect(migration).toContain('ON sa.track_id = t.id AND sa.vault_project_id = project_uuid')
      expect(migration).toMatch(/LEFT JOIN split_sheets ss\s*\n\s*ON ss\.id = sa\.split_sheet_id/)
    })

    it('scopes the join to this project\'s own tracks', () => {
      expect(migration).toContain('WHERE t.project_id = project_uuid')
    })

    it('takes the per-track tier as the MAX (best) of its attached sheets, defaulting to 0 when none', () => {
      expect(migration).toMatch(/COALESCE\(MAX\(/)
    })
  })

  describe('the tier CASE matches SPLIT_SHEET_TIER_MAP exactly (same values as migration 062)', () => {
    it('every named coverage-fixture tier value appears with the correct point mapping', () => {
      // Cross-check against the shared fixture: every attached-status
      // string used anywhere in the fixtures must have a matching WHEN
      // clause here, keeping the CASE from silently drifting out of sync
      // with what the fixtures (and the TS twin) actually exercise.
      const usedStatuses = new Set(
        COVERAGE_FIXTURES.flatMap(s => s.tracks.flatMap(t => t.attachedStatuses))
      )
      expect(usedStatuses.size).toBeGreaterThan(0)
      for (const status of usedStatuses) {
        expect(migration).toContain(`WHEN '${status}'`)
      }
      expect(migration).toMatch(/WHEN 'executed'\s+THEN 15/)
      expect(migration).toMatch(/WHEN 'esign_pending'\s+THEN 10/)
      expect(migration).toMatch(/WHEN 'approved'\s+THEN 10/)
      expect(migration).toMatch(/WHEN 'countered'\s+THEN 5/)
      expect(migration).toMatch(/WHEN 'pending_approval'\s+THEN 5/)
      expect(migration).toMatch(/ELSE 0/)
    })
  })

  describe('the minimum aggregate — all tracks covered (P18-16, unchanged pre-068 semantic)', () => {
    it('takes MIN(tier) when no needing track has a zero tier', () => {
      expect(migration).toMatch(/WHEN COUNT\(\*\) FILTER \(WHERE tier = 0\) = 0 THEN MIN\(tier\)/)
    })
  })

  describe('proportional credit — at least one track entirely uncovered (P18-16)', () => {
    it('falls back to ROUND(AVG(tier)) rather than a MIN that would collapse to 0', () => {
      expect(migration).toMatch(/ELSE ROUND\(AVG\(tier\)\)::INTEGER/)
    })
  })

  describe('no-signal degrade — a project with no tracks at all', () => {
    it('relies on MIN/AVG over an empty set yielding NULL, matching coverageTier()\'s null return', () => {
      expect(migration).toContain('coverage_tier IS NOT NULL')
      // Documented in-source, since this behavior is implicit in SQL
      // aggregate semantics rather than an explicit branch.
      expect(migration).toMatch(/zero tracks yields an empty track_tiers set/)
    })
  })

  describe('legacy signed-document branch — preserved as an equally valid route to 15 (AM-1)', () => {
    it('checks vault_documents for a signed split_sheet before falling back to coverage', () => {
      expect(migration).toContain(
        "WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed'"
      )
      expect(migration).toMatch(/IF doc_count > 0 THEN\s+score := score \+ 15;/)
    })

    it('only falls back to the coverage tier when no signed document exists', () => {
      expect(migration).toMatch(/ELSIF coverage_tier IS NOT NULL THEN\s+score := score \+ coverage_tier;/)
    })
  })

  describe('only track_id IS NOT NULL attachments count toward per-track coverage', () => {
    it('joins on sa.track_id, not a whole-release (NULL track_id) attachment', () => {
      expect(migration).toContain('sa.track_id = t.id')
    })
  })

  describe('every other scoring branch stays byte-identical to migration 062', () => {
    it('preserves every non-split-sheet branch verbatim', () => {
      expect(migration).toContain('IF track_count > 0 THEN score := score + 10; END IF;')
      expect(migration).toContain("type = 'cover_art'")
      expect(migration).toContain("type = 'copyright_registration'")
      expect(migration).toContain('isrc IS NOT NULL')
      expect(migration).toContain('score := score + 5;')
      expect(migration).toContain("type = 'hire_right' AND status = 'signed'")
      expect(migration).toContain("tool_slug = 'epkfyi'")
      expect(migration).toContain('jsonb_array_elements')
      expect(migration).toContain('dist IS NOT NULL')
      expect(migration).toContain("project_type = 'snippet'")
      expect(migration).toContain('RETURN LEAST(score, 100);')
    })
  })

  describe('recompute', () => {
    it('ends with the standard recompute UPDATE so scores refresh', () => {
      expect(
        migration
          .trim()
          .endsWith('update vault_projects set vault_readiness_score = calculate_vault_readiness(id);')
      ).toBe(true)
    })
  })

  describe('executor safety note', () => {
    it('warns that supabase db push must never be run by an executor agent', () => {
      expect(migration).toMatch(/never.*supabase db push|supabase db push.*checkpoint/i)
    })
  })

  describe('user-visible score movement is acknowledged (T-18-24)', () => {
    it('the header documents that this changes scores users can already see', () => {
      expect(migration).toMatch(/changes scores users can already see/)
    })
  })
})
