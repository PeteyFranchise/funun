// Source-assertion guard for the Antenna POST opportunity-posting gate
// (INDUSTRY-01). Mirrors the readFileSync/path.join(process.cwd(), ...)
// text-assertion pattern from __tests__/migration-061.test.ts, applied to a
// route file instead of a migration file: the dead `industry_profiles`
// double-gate (zero writers anywhere in the app — 28-RESEARCH.md Pitfall 1)
// must be gone, while the authoritative hasCapability('industry') gate must
// remain untouched.
//
// Live 401/403/200 HTTP behavior is Manual-Only (no Next.js request harness
// in this repo) — recorded in the 28-01-SUMMARY.md Manual-Only table.

import { readFileSync } from 'fs'
import path from 'path'

const route = readFileSync(
  path.join(process.cwd(), 'app/api/antenna/opportunities/route.ts'),
  'utf8'
)

describe('Antenna POST /api/antenna/opportunities — industry gate (INDUSTRY-01)', () => {
  it('no longer references the dead industry_profiles table', () => {
    expect(route).not.toContain('industry_profiles')
  })

  it('no longer writes an industry_profile_id insert field', () => {
    expect(route).not.toContain('industry_profile_id')
  })

  it('still contains the hasCapability(user.id, "industry") gate', () => {
    expect(route).toContain("hasCapability(user.id, 'industry')")
  })
})
