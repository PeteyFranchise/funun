import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { stripComments } from './storage-usage-rpc-caller-lock.test'
import { syncReadinessCoverage } from '@/lib/deals/catalog'
import { SYNC_READINESS_KEYS } from '@/lib/sync-library/readiness'
import type { CatalogProjectLike } from '@/lib/deals/catalog'

// ─── Why this test exists ────────────────────────────────────────────────
// `'unreleased'` has been sync-ELIGIBLE since the owner's 2026-09-26 reversal
// (lib/sync-library/readiness.ts:63-73), but the release-oriented readiness
// registry emits only 2 of the 6 sync keys for that type. Every caller of
// isRightsReady() builds its readiness list WITHOUT `onlyKeys`, so four keys
// never arrive, the completeness check fails closed on absent keys, and the
// song is admitted-but-permanently-invisible to buyers. Full chain:
// 50-RESEARCH.md §7.
//
// THE REAL FIX IS S5b: supply SYNC_READINESS_KEYS at all five call sites. Two
// of those five are Selects files, which the Pass 6 H-2 workstream owns while
// it is in flight, so S5b is BLOCKED-ON-H2 and sequenced in
// 50-SLICE-SEQUENCE.md.
//
// This test holds the line meanwhile. It does not fix anything. It makes the
// caller set and the key-set producer IMMOVABLE, so the divergence cannot
// quietly grow a sixth caller or a second producer while the fix is blocked.
//
// WHAT THIS TEST DELIBERATELY DOES NOT CLAIM:
//   - It does NOT make 'unreleased' licensable. That is S5b.
//   - It does NOT prove the five existing call sites are correct. They are not
//     — all five build their lists without onlyKeys, which is the defect.
//   - It does NOT check statuses, readiness, or any rights question.
//   It proves one thing only: the caller set has not grown.
//
// Scanning runs on COMMENT-STRIPPED source, reusing the stripper from
// storage-usage-rpc-caller-lock.test.ts (which tests the stripper itself). A
// comment explaining this trap must not be able to satisfy or trip an
// assertion — this repo has been bitten by that three times.
//
// The file sits at a FLAT __tests__/ path on purpose. A bracketed path such as
// `app/api/.../[listingId]/...` parses as a regex character class and silently
// matches zero tests, which is one of this repo's two known harness traps
// (50-RESEARCH.md Pitfall 8).

const ROOTS = ['app', 'lib', 'components']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const sources = ROOTS.flatMap(root => walk(path.join(process.cwd(), root)))
  .filter(file => !/\.test\.tsx?$/.test(file))
  .map(file => ({
    rel: path.relative(process.cwd(), file),
    code: stripComments(readFileSync(file, 'utf8')),
  }))

const DEFINITION = path.join('lib', 'deals', 'catalog.ts')

/** The five call expressions, across four files. Counted 2026-10-11. */
const EXPECTED_CALLERS = [
  path.join('lib', 'deals', 'catalog-query.ts'),
  path.join('lib', 'deals', 'shortlists.ts'),
  path.join('lib', 'selects', 'tracks-query.ts'),
  path.join('lib', 'selects', 'ai-draft.ts'),
].sort()

const EXPECTED_ONLYKEYS_PRODUCER = path.join('lib', 'sync-library', 'readiness.ts')

describe('the isRightsReady caller set is locked while the divergence is open', () => {
  it('has exactly the four known caller files, plus its own definition', () => {
    const callers = sources
      .filter(({ rel, code }) => rel !== DEFINITION && code.includes('isRightsReady('))
      .map(({ rel }) => rel)
      .sort()

    expect(callers).toEqual(
      EXPECTED_CALLERS,
    )
  })

  it('names the two choices a new caller has, so the failure is actionable', () => {
    // Guards the message above from being deleted as noise: a lock test whose
    // failure does not say what to do gets commented out rather than obeyed.
    const self = readFileSync(__filename, 'utf8')
    expect(self).toContain('SYNC_READINESS_KEYS')
    expect(self).toContain('50-SLICE-SEQUENCE.md')
  })
})

describe('the sync key set has exactly one producer', () => {
  it('only lib/sync-library/readiness.ts passes onlyKeys', () => {
    // A second producer of readiness items for the SYNC question must be
    // deliberate, not incidental. Today syncReadinessForTrack is the only
    // caller that asks for the six by name; every isRightsReady caller inherits
    // the release applies_to table instead, which is the defect.
    const producers = sources
      .filter(({ code }) => code.includes('onlyKeys'))
      .map(({ rel }) => rel)
      .filter(rel => rel !== path.join('lib', 'vault', 'readiness.ts'))
      .sort()

    expect(producers).toEqual([EXPECTED_ONLYKEYS_PRODUCER])
  })
})

describe('the coverage check reads the shared constant, not a local copy', () => {
  it('SYNC_READINESS_KEYS has six members', () => {
    expect(SYNC_READINESS_KEYS).toHaveLength(6)
  })

  it('an empty item list reports exactly those six keys as missing, proving the constant is the source', () => {
    // Asserted by IMPORTING both and comparing, never by scanning text: a
    // duplicated local list would still satisfy a grep for the identifier.
    const project: CatalogProjectLike = { has_admitted_sync_listing: true, type: 'single' }
    const verdict = syncReadinessCoverage(project, [])
    expect(verdict.status).toBe('indeterminate')
    const missing = verdict.status === 'indeterminate' ? [...verdict.missingKeys].sort() : []
    expect(missing).toEqual([...SYNC_READINESS_KEYS].sort())
  })
})
