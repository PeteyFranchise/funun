// Wave 0 RED — Phase 9 (rich-member-profile). Defines the contract 09-01b's
// lib/profile/validate.ts must satisfy: isFeaturableProjectRow() (PROFILE-05).
// Tests the extracted pure predicate against fixture rows, not the live DB.
// This module does not exist yet — these tests are expected to fail until
// 09-01b creates it.

import { isFeaturableProjectRow } from '@/lib/profile/validate'

type FixtureProjectRow = { id: string; user_id: string; is_public: boolean }

const OWNER_ID = 'user-owner'
const OTHER_ID = 'user-other'

describe('isFeaturableProjectRow', () => {
  it('returns not-found for a project the caller does not own', () => {
    const row: FixtureProjectRow = { id: 'p1', user_id: OTHER_ID, is_public: true }
    expect(isFeaturableProjectRow(row, OWNER_ID)).toBe('not-found')
  })

  it('returns rejected-not-public for an owned-but-private project', () => {
    const row: FixtureProjectRow = { id: 'p1', user_id: OWNER_ID, is_public: false }
    expect(isFeaturableProjectRow(row, OWNER_ID)).toBe('rejected-not-public')
  })

  it('accepts an owned public project', () => {
    const row: FixtureProjectRow = { id: 'p1', user_id: OWNER_ID, is_public: true }
    expect(isFeaturableProjectRow(row, OWNER_ID)).toBe('ok')
  })
})
