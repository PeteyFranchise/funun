import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { stripComments } from './storage-usage-rpc-caller-lock.test'
import { syncReadinessCoverage } from '@/lib/deals/catalog'
import { SYNC_READINESS_KEYS } from '@/lib/sync-library/readiness'
import type { CatalogProjectLike } from '@/lib/deals/catalog'

// ─── REWRITTEN 2026-10-11 — the invariant was SUPERSEDED, not inconvenient ─
//
// The original lock (shipped `ec54ffbe`) asserted that `isRightsReady` had
// exactly FOUR caller files and that `onlyKeys` had exactly one producer. It
// existed to freeze a known divergence: `'unreleased'` had been sync-eligible
// since the owner's 2026-09-26 reversal, the release-oriented readiness registry
// emits only 2 of the 6 sync keys for that type, and every isRightsReady caller
// built its list without `onlyKeys` — so four keys never arrived, the
// completeness check failed closed on absent keys, and the song was
// admitted-but-permanently-invisible to buyers (50-RESEARCH.md §7).
//
// Owner decision D-11 (2026-10-11) dissolved that divergence instead of
// repairing it. The six readiness keys stopped being a visibility question at
// all; exposure is now decided per track by `trackExposure` from the track's own
// admitted listing and a bound master, and the keys became a CLEARANCE question
// that moves a badge. So the old assertion is now false by design.
//
// THE DISTINCTION THIS PARAGRAPH EXISTS TO RECORD. This lock was rewritten
// because owner doctrine changed the invariant, NOT because the lock was
// inconvenient to the change it was guarding. That distinction is the whole
// value of the file: the original divergence survived as long as it did partly
// because each successive caller was easier to permit than to question. A lock
// edited to let its own violation through is worse than no lock, so the new
// invariant below is strictly STRONGER than the one it replaces — the permitted
// caller set shrank from four files to two, and both remaining entries are named
// with the reason they are still there and the task that removes them.
//
// THE NEW INVARIANT: no surface may decide Crate visibility except through
// `trackExposure`.
//
// WHAT THIS TEST DELIBERATELY DOES NOT CLAIM:
//   - It does NOT prove the two remaining Selects callers are correct. They are
//     not — they still gate on rights completeness, which D-11 forbids. They are
//     plan 50-05 Task 7, BLOCKED-ON-H2 because the Pass 6 H-2 workstream owns
//     those files while it is in flight (50-SLICE-SEQUENCE.md).
//   - It does NOT check any rights or clearance answer. Those have their own
//     unit tests.
//   It proves that the authorities are singular and that the surfaces consume
//   them rather than re-deriving them.
//
// WHAT A TEXT LOCK CANNOT CATCH, established by running the control rather than
// reasoned about: a surface that CALLS trackExposure and then ignores its answer
// passes every assertion here. Neutering the comparison in
// lib/deals/request-target.ts to `.status !== 'definitely-not-a-status'` left
// all 13 cases below green. Four BEHAVIOURAL cases in
// lib/deals/request-target.test.ts failed on that same edit, which is where
// that class of defect is actually covered. Two controls this file DOES catch,
// both run and reverted: adding a new `isRightsReady` caller, and a second file
// emitting the exposure vocabulary.
//
// Scanning runs on COMMENT-STRIPPED source, reusing the stripper from
// storage-usage-rpc-caller-lock.test.ts (which tests the stripper itself). A
// comment explaining this trap must not be able to satisfy or trip an
// assertion — this repo has been bitten by that three times. Note that the long
// explanation above mentions every identifier this file asserts on, so without
// the stripper this test would pass against itself.
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

const RIGHTS_READY_DEFINITION = path.join('lib', 'deals', 'catalog.ts')
const EXPOSURE_AUTHORITY = path.join('lib', 'sync-library', 'track-exposure.ts')
const CLEARANCE_AUTHORITY = path.join('lib', 'sync-library', 'track-clearance.ts')

/**
 * The ONLY files still permitted to call `isRightsReady`. Both are Selects
 * surfaces inside the Pass 6 H-2 blast radius, which is the single reason they
 * were not converted with the rest. Plan 50-05 Task 7 removes them, and this
 * list must then go to empty — never grow.
 */
const BLOCKED_ON_H2_CALLERS = [
  path.join('lib', 'selects', 'tracks-query.ts'),
  path.join('lib', 'selects', 'ai-draft.ts'),
].sort()

/**
 * The surfaces that decide what a buyer may discover or request. Each must
 * consume `trackExposure` and must not consult `isRightsReady`.
 */
const EXPOSURE_CONSUMERS = [
  path.join('lib', 'deals', 'catalog-query.ts'),
  path.join('lib', 'deals', 'shortlists.ts'),
  path.join('lib', 'deals', 'request-target.ts'),
]

const EXPECTED_ONLYKEYS_PRODUCER = path.join('lib', 'sync-library', 'readiness.ts')

describe('no surface decides Crate visibility except through trackExposure', () => {
  it('leaves isRightsReady with exactly the two BLOCKED-ON-H2 Selects callers', () => {
    const callers = sources
      .filter(({ rel, code }) => rel !== RIGHTS_READY_DEFINITION && code.includes('isRightsReady('))
      .map(({ rel }) => rel)
      .sort()

    // If this fails with a file ADDED: do not add it to the list. Decide
    // visibility with trackExposure (lib/sync-library/track-exposure.ts) and the
    // badge with trackClearance. If it fails with a file REMOVED, Task 7 landed
    // — delete the entry, and when the list is empty delete isRightsReady.
    expect(callers).toEqual(BLOCKED_ON_H2_CALLERS)
  })

  it('has every buyer-facing surface consuming trackExposure', () => {
    // The mirror of the assertion above. Without it the caller list could reach
    // zero by a surface dropping its gate entirely rather than converting it,
    // which would expose everything and still pass.
    for (const rel of EXPOSURE_CONSUMERS) {
      const file = sources.find(s => s.rel === rel)
      expect(file).toBeDefined()
      expect(file?.code).toContain('trackExposure(')
      expect(file?.code).not.toContain('isRightsReady(')
    }
  })

  it('defines each authority exactly once', () => {
    const exposureDefs = sources.filter(({ code }) => code.includes('export function trackExposure'))
    const clearanceDefs = sources.filter(({ code }) => code.includes('export function trackClearance'))

    expect(exposureDefs.map(f => f.rel)).toEqual([EXPOSURE_AUTHORITY])
    expect(clearanceDefs.map(f => f.rel)).toEqual([CLEARANCE_AUTHORITY])
  })

  it('keeps the exposure vocabulary inside the exposure authority', () => {
    // 'no_playable_master' is unique to trackExposure's result union — unlike
    // 'not_admitted', which syncReadinessCoverage also produces for a different
    // question. A second file emitting it would be a second exposure model.
    const emitters = sources.filter(({ code }) => code.includes('no_playable_master')).map(f => f.rel)

    expect(emitters).toEqual([EXPOSURE_AUTHORITY])
  })

  it('names the two choices a new caller has, so the failure is actionable', () => {
    // Guards the guidance above from being deleted as noise: a lock test whose
    // failure does not say what to do gets commented out rather than obeyed.
    const self = readFileSync(__filename, 'utf8')
    expect(self).toContain('trackExposure')
    expect(self).toContain('50-SLICE-SEQUENCE.md')
  })
})

describe('the sync key set has exactly one producer', () => {
  it('only lib/sync-library/readiness.ts passes onlyKeys', () => {
    // Unchanged by D-11 and still load-bearing. The six keys moved from the
    // exposure question to the clearance question; they did not become free to
    // re-derive. A second producer of the SYNC item set must be deliberate.
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
