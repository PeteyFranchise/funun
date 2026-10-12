// Buyer-facing rights states: three → two (quick 260910), with the REASON
// replaced on 2026-10-11 by owner decision D-11.
//
// WHAT THIS FILE USED TO SAY, and why it is recorded rather than quietly
// edited: "The catalogue is an UNLOCK-then-ADMIT gate, not a labelled browse: a
// track only reaches a buyer after every required document is signed, every
// owner has authorized licensing, and a Funūn team member has admitted it to
// The Crate." D-11 overturned exactly that premise. An admitted, musically
// complete track with a playable finished master stays discoverable WHILE
// clearance work continues, so a buyer routinely sees a track whose paperwork
// is open. 'Clearance required' is now the ordinary state, not the exception.
//
// 'partial' remains unreachable for a buyer, but for a DIFFERENT reason:
// clearanceToCatalogRights (lib/sync-library/track-clearance.ts) maps every
// non-ready clearance to 'req' and never emits 'part'. The old reason was
// "nothing part-way gets admitted"; the new one is "the buyer answer is binary".
// Same assertion, different mechanism — worth knowing when this next changes.
//
// So this file guards a two-sided contract:
//   - the BUYER surfaces stop advertising 'partial'
//   - the ENGINE keeps computing it, because staff Crate review needs it
// and, since D-11, a third thing: the buyer-facing label for 'req' must not
// name a cause the data does not establish (review finding F2).
//
// See .planning/deliberations/2026-10-10-owner-decisions-phase-50-rescope.md
// (D-11) and 50-REVIEWS.md F2.
import { readFileSync } from 'fs'
import path from 'path'
import type { Stage3Result } from '@/lib/vault/stage3'
import { rightsBadge, RIGHTS_BADGE_TO_CATALOG_RIGHTS } from '@/lib/sync-library/gate'
import { catalogRightsFromStage3 } from '@/lib/deals/catalog'

// Comment-stripped scanning, reusing the stripper from the caller-lock suite
// (which tests the stripper itself). The explanatory comments in this file name
// SAMPLE_CATALOG_ROWS repeatedly, so without stripping the lock below would
// fail against its own prose.
import { stripComments } from './storage-usage-rpc-caller-lock.test'

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

// The `label:` string of a BADGES entry, by its `cls` code. Added 2026-10-11:
// F2 was a defect in the LABEL, which no assertion in this file could see.
function badgeLabel(cls: string): string | null {
  const entry = helpPage.split('\n').find(line => line.includes(`cls: '${cls}'`))
  if (!entry) return null
  const m = entry.match(/label:\s*'((?:[^'\\]|\\.)*)'/)
  return m ? m[1] : null
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

  // ─── REPLACED 2026-10-11 (owner decision D-11, review finding F2) ───────
  // This asserted the 'req' state was "a sample that needs clearing". Under
  // D-11 the `req` code is reached by ANY open clearance item — unsigned
  // splits, missing copyright evidence, an unconfirmed hire credit, unresolved
  // AI provenance — so naming a sample stated a specific and usually false
  // cause, on a public page, about a song's legal status.
  //
  // NOTE WHY IT HAD TO BE REPLACED RATHER THAN LEFT: the new generic copy still
  // mentions a sample as ONE cause, so the old assertions both still passed.
  // A test that keeps passing over behaviour it no longer describes is the
  // trap this repo has been bitten by repeatedly — see
  // [[reference_fixture_gap_masks_removed_gate]].
  it('describes the req state as clearance generally, naming no single cause as THE cause', () => {
    const label = badgeLabel('req') as string
    const copy = (badgeCopy('req') as string).toLowerCase()

    // The label must not assert a cause at all.
    expect(label.toLowerCase()).toContain('clearance')
    expect(label.toLowerCase()).not.toContain('sample')

    // The copy must still explain that something needs clearing...
    expect(copy).toContain('clear')
    // ...and must name MORE THAN ONE possible cause, so a sample reads as an
    // example rather than the diagnosis.
    const causes = ['paperwork', 'credit', 'sample', 'split', 'copyright', 'provenance']
    expect(causes.filter(c => copy.includes(c)).length).toBeGreaterThanOrEqual(2)
    // And it must not open by asserting a sample exists, which the old copy did.
    expect(copy).not.toMatch(/^there(’|')s a sample/)
  })

  // D-11's positive half: the track is in the catalogue legitimately. The copy
  // must not read as an apology or as a listing error.
  it('says the track belongs in the catalogue while clearance is open (D-11)', () => {
    const copy = (badgeCopy('req') as string).toLowerCase()
    expect(copy).toMatch(/catalogue|crate/)
    expect(copy).not.toMatch(/shouldn(’|')t be here|by mistake|not available/)
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

  // An uncleared sample is a demand signal, not a dead end. But HOW that
  // demand gets served is undecided: `clear vs facilitate vs partner` is an
  // OPEN sub-decision, and whether Funūn reliably commissions originals is
  // downstream of it. So this asserts the copy opens a CONVERSATION, and
  // deliberately does NOT pin the word "original" — an earlier version stated
  // a commissioned original as confidently as the clearance route, which
  // promised a capability the business has not committed to.
  it('opens the forward path without promising a specific deliverable', () => {
    const copy = (badgeCopy('req') as string).toLowerCase()
    expect(copy).toContain('brief')
    // An invitation to talk, not a stated outcome.
    expect(copy).toMatch(/tell us|send the request|talk/)
  })

  it('does not commit Funūn to producing an original', () => {
    const copy = (badgeCopy('req') as string).toLowerCase()
    // "we'll write you one" / "an original is the other way" — a promise that
    // outruns the open clear/facilitate/partner decision.
    expect(copy).not.toMatch(/we('|’)ll (write|make|produce|create|cut)/)
    expect(copy).not.toMatch(/original (cut|track|is the other)/)
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
    // 2026-10-11 (D-11/F2): was 'Contains a sample'.
    expect(filterLine).toContain("'Clearance required'")
    expect(filterLine).not.toContain("'Contains a sample'")
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

// ─── REPLACED 2026-10-11 (owner decision) ────────────────────────────────
// This block asserted that SAMPLE_CATALOG_ROWS — the public empty-state
// fixture — carried only the two buyer rights states. Its own comment said the
// quiet part: "a row here is a row a real buyer sees."
//
// It was right about that and it was the wrong thing to guard. The owner-run
// buyer-domain preflight proved every buyer table holds zero rows, so the
// "fallback" was simply what the public catalogue rendered: eight invented
// songs with invented artist names, synthetic project ids, and a licence button
// that 404s. A catalogue of music Funūn does not represent is a false claim
// about what is available to license.
//
// The fixture is deleted. What replaces this block is a LOCK: no hardcoded row
// fixture may reach a buyer surface again. Checking the states of a fabricated
// row is worthless next to ensuring no fabricated row exists.
describe('no fabricated catalogue row can reach a buyer surface', () => {
  const sample = read('lib/deals/catalog-sample.ts')

  it('exports no row fixture from the buyer view-model module', () => {
    // mapCardsToLightRows and gradientFor stay; a row array does not.
    const code = stripComments(sample)
    expect(code).not.toMatch(/export const \w*(SAMPLE|FIXTURE|DEMO|PLACEHOLDER)\w*/i)
    expect(code).not.toMatch(/CatalogRow\[\]\s*=\s*\[/)
  })

  it('leaves the real mapper intact', () => {
    // The deletion must not have taken the live path with it.
    expect(stripComments(sample)).toContain('export function mapCardsToLightRows')
  })

  it('has no buyer render path importing a row fixture', () => {
    for (const rel of ['app/sync/page.tsx', 'app/sync/catalog/page.tsx']) {
      const code = stripComments(read(rel))
      expect(code).not.toMatch(/SAMPLE_CATALOG_ROWS/)
    }
  })

  it('renders an honest empty state instead of substituting rows', () => {
    // The distinct zero-rows branch, separate from the filter-empty one: an
    // empty catalogue is a different fact from filters excluding everything,
    // and the filter copy would be a lie with nothing to come back to.
    const code = stripComments(crate)
    expect(code).toMatch(/rows\.length === 0/)
    expect(code).toMatch(/Nothing in The Crate yet/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// COUPLING GUARD — the Rights filter matches on the LABEL STRING.
//
// `matchesFilters()` does `sel.Rights.has(RIGHTS_FILTER_LABEL[row.rights])`,
// so every option offered in FILTER_OPTIONS.Rights must appear VERBATIM as a
// value in RIGHTS_FILTER_LABEL. Rename one without the other and the filter
// silently matches nothing — which renders as an empty catalogue, not as an
// error. Nobody sees a stack trace; a buyer just concludes you have no music.
//
// This nearly happened renaming 'Contact required' to 'Contains a sample'
// (2026-09-10): four constants across two files had to move together. It was
// exercised again renaming 'Contains a sample' to 'Clearance required'
// (2026-10-11, D-11/F2) — and this guard is what confirmed the options list and
// the label map moved in lockstep, so the filter did not silently match nothing.
// ─────────────────────────────────────────────────────────────────────────
describe('Rights filter options stay coupled to the label map', () => {
  const optionsLine = crate.split('\n').find(l => l.trim().startsWith('Rights: ['))
  const filterMapLine = crate.split('\n').find(l => l.includes('const RIGHTS_FILTER_LABEL'))

  it('finds both sides of the coupling', () => {
    expect(optionsLine).toBeTruthy()
    expect(filterMapLine).toBeTruthy()
  })

  it('every offered Rights option exists verbatim in RIGHTS_FILTER_LABEL', () => {
    const offered = [...(optionsLine ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
    const mapped = [...(filterMapLine ?? '').matchAll(/:\s*'([^']+)'/g)].map(m => m[1])
    expect(offered.length).toBeGreaterThan(0)
    // Report the actual strings on failure, not just a boolean — a rename is
    // diagnosed instantly when both lists are visible.
    expect({ offered, unmatched: offered.filter(o => !mapped.includes(o)) })
      .toEqual({ offered, unmatched: [] })
  })
})
