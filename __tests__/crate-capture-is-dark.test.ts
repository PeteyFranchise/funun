import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { BYTE_TIED_QUALITY_REVIEW_ENABLED } from '@/lib/sync-library/crate-byte-tied-review'
import { CRATE_CAPTURE_ENABLED } from '@/lib/sync-library/crate-capture'
import { WITHHELD_READ_SURFACES } from '@/lib/deals/buyer-song-unit-read-withholding'

// ─── Phase 50.5B (B5): prove the slice is dark ──────────────────────────
//
// "Dark" is an absence claim, and absence claims are where this project's
// mistakes cluster: the recorded pattern is a grep for one naming shape read as
// proof that nothing does X. So this walks the ENTIRE app/, components/ and lib/
// tree and states its search space, rather than grepping a guessed path.
//
// What it proves: no buyer-facing or staff-read surface can reach the capture
// code, because nothing outside two write routes imports it, and both flags are
// off regardless. What it CANNOT prove is runtime behaviour with the flags on;
// that needs the migrations applied and a database, and is named in the plan as
// owner-run evidence.

const ROOTS = ['app', 'components', 'lib']
const CAPTURE_MODULES = [
  '@/lib/sync-library/crate-capture',
  '@/lib/sync-library/crate-byte-tied-review',
]

// The ONLY files allowed to reach the capture path: the two staff WRITE routes
// where admission and quality review happen, plus the modules themselves.
const PERMITTED_IMPORTERS = [
  'app/api/sync-library/admin/[listingId]/route.ts',
  'app/api/sync-library/admin/[listingId]/quality/route.ts',
  'lib/sync-library/crate-capture.ts',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(path.join(process.cwd(), r)))
  .map((f) => path.relative(process.cwd(), f))

describe('50.5B is dark — the search space', () => {
  it('walked a non-trivial tree, so a passing result means something', () => {
    // If this ever collapses to a handful of files the walk broke, and every
    // absence assertion below would pass vacuously.
    expect(files.length).toBeGreaterThan(400)
  })
})

describe('50.5B is dark — nothing buyer-facing can reach capture', () => {
  const importers = files.filter((f) => {
    const src = readFileSync(path.join(process.cwd(), f), 'utf8')
    return CAPTURE_MODULES.some((m) => src.includes(m))
  })

  it('is imported only by the two staff write routes', () => {
    expect([...importers].sort()).toEqual([...PERMITTED_IMPORTERS].sort())
  })

  it('is reachable from no buyer surface', () => {
    const buyerFacing = importers.filter(
      (f) => f.startsWith('components/buyer') || f.startsWith('app/sync') || f.startsWith('lib/deals')
    )
    expect(buyerFacing).toEqual([])
  })

  it('is reachable from no artist surface', () => {
    const artistFacing = importers.filter(
      (f) => f.includes('app/(artist)') || f.startsWith('components/vault')
    )
    expect(artistFacing).toEqual([])
  })
})

describe('50.5B is dark — the flags', () => {
  it('byte-tied review is off until 248 and 251 are applied', () => {
    expect(BYTE_TIED_QUALITY_REVIEW_ENABLED).toBe(false)
  })

  it('capture is off until 248, 251, 252 are applied', () => {
    expect(CRATE_CAPTURE_ENABLED).toBe(false)
  })
})

describe('50.5B is dark — 50.5A containment is untouched', () => {
  it('still withholds exactly the same fourteen surfaces', () => {
    // If a capture change had quietly altered what buyers are shown, the
    // inventory is where it would surface first.
    expect(WITHHELD_READ_SURFACES.length).toBe(14)
  })

  it('no capture module leaks into the withholding seams', () => {
    const seams = files.filter((f) => f.startsWith('lib/deals/') && f.endsWith('-view.ts'))
    expect(seams.length).toBeGreaterThan(0)
    for (const seam of seams) {
      const src = readFileSync(path.join(process.cwd(), seam), 'utf8')
      for (const m of CAPTURE_MODULES) expect(src).not.toContain(m)
    }
  })
})
