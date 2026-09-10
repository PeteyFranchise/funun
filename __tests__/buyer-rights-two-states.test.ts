// Buyer-facing rights states: three → two (quick 260910).
//
// The catalogue is an UNLOCK-then-ADMIT gate, not a labelled browse: a track
// only reaches a buyer after every required document is signed, every owner
// has authorized licensing, and a Funūn team member has admitted it to The
// Crate. That makes rightsBadge()'s 'partial' UNREACHABLE for a buyer — not
// wrong. See .planning/deliberations/sync-catalogue-entry-and-samples.md.
//
// So this file guards a two-sided contract:
//   - the BUYER surfaces stop advertising 'partial'
//   - the ENGINE keeps computing it, because staff Crate review needs it
import { readFileSync } from 'fs'
import path from 'path'
import type { Stage3Result } from '@/lib/vault/stage3'
import { rightsBadge, RIGHTS_BADGE_TO_CATALOG_RIGHTS } from '@/lib/sync-library/gate'
import { catalogRightsFromStage3 } from '@/lib/deals/catalog'
import { SAMPLE_CATALOG_ROWS } from '@/lib/deals/catalog-sample'

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')
const helpPage = read('app/help/page.tsx')
const crate = read('components/buyer/CatalogBrowserLight.tsx')

function stage3(overrides: Partial<Stage3Result> = {}): Stage3Result {
  return {
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 3,
    requiredTotal: 3,
    canContinue: true,
    sampleBlock: false,
    ...overrides,
  }
}

// The `d:` string of a BADGES entry, by its `cls` code.
function badgeCopy(cls: string): string | null {
  const entry = helpPage
    .split('\n')
    .find(line => line.includes(`cls: '${cls}'`))
  if (!entry) return null
  const m = entry.match(/d:\s*'((?:[^'\\]|\\.)*)'/)
  return m ? m[1] : null
}

describe('help page publishes two buyer rights states', () => {
  it('no longer publishes a Partial-rights definition', () => {
    expect(badgeCopy('part')).toBeNull()
    expect(helpPage).not.toContain("label: 'Partial rights'")
    expect(helpPage).not.toContain("cls: 'part'")
  })

  it('still publishes exactly the two reachable states', () => {
    expect(badgeCopy('ok')).toBeTruthy()
    expect(badgeCopy('req')).toBeTruthy()
    const clsCount = (helpPage.match(/cls: '/g) ?? []).length
    expect(clsCount).toBe(2)
  })

  it('describes the "Contact required" state as a sample that needs clearing', () => {
    const copy = badgeCopy('req') as string
    expect(copy.toLowerCase()).toContain('sample')
    expect(copy.toLowerCase()).toContain('clear')
  })

  // The deliberation records that an assistant invented "typically 4-8 weeks"
  // and the owner nearly shipped it. Sample clearance is a third party's
  // decision on a third party's schedule: it routinely takes months and often
  // fails outright. Any duration in this copy is a promise Funūn cannot keep.
  it('promises NO clearance timeline, expressed or implied', () => {
    const copy = (badgeCopy('req') as string).toLowerCase()
    const timeUnits = /\b(second|minute|hour|day|week|fortnight|month|quarter|year|business day|turnaround|eta|deadline|sla)s?\b/
    const speedClaims = /\b(quick(ly)?|fast|rapid|prompt(ly)?|soon|immediate(ly)?|right away|within|no time|shortly|typically|usually|on average|average)\b/
    const durations = /\b\d+\s*[-–]?\s*\d*\s*(s|sec|min|hr|h|d|w|m|mo|yr)\b/
    expect(copy).not.toMatch(timeUnits)
    expect(copy).not.toMatch(speedClaims)
    expect(copy).not.toMatch(durations)
  })

  // An uncleared sample is a demand signal, not a dead end — the buyer's route
  // may be a commissioned original built to the same brief.
  it('opens the forward path instead of leaving a dead end', () => {
    const copy = (badgeCopy('req') as string).toLowerCase()
    expect(copy).toContain('original')
    expect(copy).toContain('brief')
  })
})

describe('buyer Rights filter offers two states', () => {
  const filterLine = crate
    .split('\n')
    .find(line => line.trimStart().startsWith('Rights: [')) as string

  it('exists', () => {
    expect(filterLine).toBeTruthy()
  })

  it('does not offer Partial — an always-empty option reads as broken', () => {
    expect(filterLine).not.toContain("'Partial'")
    expect(filterLine).toContain("'Rights ready'")
    expect(filterLine).toContain("'Contact required'")
    expect(filterLine.match(/'/g)?.length).toBe(4) // exactly two quoted options
  })

  it('offers no Partial anywhere else in the buyer chrome', () => {
    // The maps below legitimately still contain the word — this asserts the
    // filter OPTIONS list is the only place it could have leaked back in.
    const optionLists = crate.match(/^\s*\w+: \[[^\]]*\],$/gm) ?? []
    expect(optionLists.some(l => l.includes("'Partial'"))).toBe(false)
  })
})

describe('the label maps stay exhaustive over CatalogRights', () => {
  // Deliberate: rightsBadge() still returns 'partial' for staff review, so a
  // legacy or mid-migration row can still arrive carrying rights: 'part'. A
  // narrowed map would render `undefined` in the badge.
  it.each(['RIGHTS_LABEL', 'RIGHTS_FILTER_LABEL'])('%s keeps all three keys', name => {
    const line = crate.split('\n').find(l => l.startsWith(`const ${name}`)) as string
    expect(line).toBeTruthy()
    expect(line).toContain('Record<CatalogRights, string>')
    expect(line).toMatch(/\bok:/)
    expect(line).toMatch(/\bpart:/)
    expect(line).toMatch(/\breq:/)
  })

  it('does not narrow the CatalogRights union', () => {
    expect(crate).toContain("export type CatalogRights = 'ok' | 'part' | 'req'")
  })

  it('keeps the RightsBadge renderer branch for a legacy part row', () => {
    expect(crate).toContain("rights === 'part'")
  })
})

// ─── DRIFT GUARD ───────────────────────────────────────────────────────────
// Reading "buyer rights states: three to two" the tempting next move is to
// delete the third state from the engine. DO NOT. rightsBadge() feeds staff
// Crate review (30-08 needs_completion / pending_admit), which legitimately
// needs 'partial' to show a part-way submission that has not been admitted.
// Only the BUYER surfaces stopped advertising it.
//
// These assertions are deliberately behavioural, not text matches: deleting
// the `return 'partial'` branch, or collapsing it into 'contact'/'ready',
// must fail here.
describe('DRIFT GUARD: rightsBadge() still computes three states', () => {
  it("returns 'ready' when every required doc is signed and the gate is open", () => {
    expect(rightsBadge(stage3({ canContinue: true, requiredComplete: 3, requiredTotal: 3 }))).toBe('ready')
  })

  it("returns 'contact' when nothing required is done, or a sample is blocking", () => {
    expect(rightsBadge(stage3({ canContinue: false, requiredComplete: 0, requiredTotal: 3 }))).toBe('contact')
    expect(
      rightsBadge(stage3({ canContinue: true, requiredComplete: 3, requiredTotal: 3, sampleBlock: true }))
    ).toBe('contact')
  })

  it("STILL returns 'partial' for a part-way submission — staff review needs it", () => {
    expect(rightsBadge(stage3({ canContinue: false, requiredComplete: 2, requiredTotal: 3 }))).toBe('partial')
    expect(rightsBadge(stage3({ canContinue: true, requiredComplete: 1, requiredTotal: 3 }))).toBe('partial')
  })

  it('returns three DISTINCT values across the three input shapes', () => {
    const badges = new Set([
      rightsBadge(stage3({ canContinue: true, requiredComplete: 3, requiredTotal: 3 })),
      rightsBadge(stage3({ canContinue: false, requiredComplete: 2, requiredTotal: 3 })),
      rightsBadge(stage3({ canContinue: false, requiredComplete: 0, requiredTotal: 3 })),
    ])
    expect(badges.size).toBe(3)
    expect([...badges].sort()).toEqual(['contact', 'partial', 'ready'])
  })

  it('keeps the tri-state mapping and its downstream composition intact', () => {
    expect(RIGHTS_BADGE_TO_CATALOG_RIGHTS).toEqual({ ready: 'ok', partial: 'part', contact: 'req' })
    expect(catalogRightsFromStage3(stage3({ canContinue: false, requiredComplete: 2, requiredTotal: 3 }))).toBe('part')
  })
})

describe('the public catalogue fixture carries only buyer states', () => {
  // SAMPLE_CATALOG_ROWS is the empty-state fallback on the PUBLIC /sync and
  // /sync/catalog pages — a row here is a row a real buyer sees.
  it("has no 'part' row", () => {
    expect(SAMPLE_CATALOG_ROWS.filter(r => r.rights === 'part')).toEqual([])
  })

  it('still demonstrates both buyer states', () => {
    expect(SAMPLE_CATALOG_ROWS.some(r => r.rights === 'ok')).toBe(true)
    expect(SAMPLE_CATALOG_ROWS.some(r => r.rights === 'req')).toBe(true)
  })
})
