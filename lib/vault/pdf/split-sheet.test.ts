// ─── split-sheet.tsx tests ─────────────────────────────────────────────
// Asserts the rebuilt agreement document (P17-09) renders all seven
// approved sections, the verbatim operative/guidance text, the five-
// column Split Breakdown, per-signature Date tags, wrap={false}
// signature blocks, the title/subtitle overlap fix, and full
// backwards-compatible degradation for a pre-063 legacy row.

import { renderSplitSheet, SplitSheetDocument, partyRoleTag } from './split-sheet'
import { AGREEMENT_CLAUSES, GUIDANCE_NOTES } from '@/lib/split-sheets/agreement'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'

// ─── Tree-walk helpers ───────────────────────────────────────────────────
// React elements from @react-pdf/renderer are plain {type, props} objects
// — no renderer/DOM needed to inspect them. JSX only calls
// React.createElement, it never invokes component functions, so composite
// elements (PartyRow, PartySignatureBlock, WorkDetailRow, …) must be
// manually "rendered" (call type(props)) to reach their output; primitive
// react-pdf elements (Document/Page/View/Text) carry their real content
// directly in props.children and use STRING tags ('DOCUMENT'/'PAGE'/
// 'VIEW'/'TEXT'), not function components — confirmed by inspecting the
// exports directly (typeof Text === 'string', Text === 'TEXT').

type Expanded =
  | string
  | number
  | null
  | Expanded[]
  | { type: string; props: Record<string, unknown>; children: Expanded }

function isElement(node: unknown): node is { type: unknown; props?: { children?: unknown } } {
  return typeof node === 'object' && node !== null && 'type' in node
}

/** Fully expands composite (function) elements into the primitive
 * react-pdf tree, preserving type/props/children at every primitive
 * node — used by both collectText (flatten to strings) and the
 * style/structure assertions below (which need props). */
function expand(node: unknown): Expanded {
  if (node == null || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(expand)
  if (isElement(node)) {
    if (typeof node.type === 'function') {
      const rendered = (node.type as (props: unknown) => unknown)(node.props)
      return expand(rendered)
    }
    const props = (node.props ?? {}) as Record<string, unknown>
    const children = expand(props.children)
    return { type: node.type as string, props, children }
  }
  return null
}

function collectText(node: Expanded, acc: string[] = []): string[] {
  if (node == null) return acc
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node))
    return acc
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, acc)
    return acc
  }
  collectText(node.children, acc)
  return acc
}

/** Finds every node of a given react-pdf tag (e.g. 'TEXT', 'VIEW') in an
 * expanded tree, returning its props and its own flattened text. */
function findAll(
  node: Expanded,
  tag: string,
  out: { props: Record<string, unknown>; text: string }[] = []
): { props: Record<string, unknown>; text: string }[] {
  if (node == null) return out
  if (typeof node === 'string' || typeof node === 'number') return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, tag, out)
    return out
  }
  if (node.type === tag) {
    out.push({ props: node.props, text: collectText(node.children).join('') })
  }
  findAll(node.children, tag, out)
  return out
}

// ─── Fixtures ────────────────────────────────────────────────────────────

const legacyParty: SplitSheetParty = {
  // A pre-063 row: only the original 018 fields exist. No legal_name,
  // publishing_designee, or administrator — the degradation path must
  // still render a complete, honest document.
  name: 'Marco Belan',
  email: 'marco@example.com',
  pro: 'BMI',
  ipi: '00987654321',
  role: 'producer',
  split_percentage: 40,
}

const fullParties: SplitSheetParty[] = [
  {
    name: 'Maya Carter',
    email: 'maya@example.com',
    pro: 'ASCAP',
    ipi: '00123456789',
    role: 'composer_lyricist',
    split_percentage: 60,
    legal_name: 'Maya Elise Carter',
    publishing_designee: 'Neon Hours Publishing',
    administrator: 'Songtrust',
  },
  legacyParty,
]

// ─── partyRoleTag ────────────────────────────────────────────────────────

describe('partyRoleTag', () => {
  it('is deterministic for the same index', () => {
    expect(partyRoleTag(0)).toBe(partyRoleTag(0))
    expect(partyRoleTag(3)).toBe(partyRoleTag(3))
  })

  it('is unique per index', () => {
    const tags = [0, 1, 2, 3].map(partyRoleTag)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('produces DocuSeal-safe identifiers (alphanumeric, no spaces)', () => {
    expect(partyRoleTag(0)).toMatch(/^[A-Za-z0-9]+$/)
    expect(partyRoleTag(9)).toMatch(/^[A-Za-z0-9]+$/)
  })
})

// ─── Title/subtitle overlap regression (the bug this large title
// introduced) — assert the computed style values directly so the test
// fails if someone removes the explicit lineHeight overrides. ───────────

describe('title/subtitle overlap regression', () => {
  it('gives the 19pt title an explicit lineHeight so it does not collapse the subtitle into it', () => {
    const tree = expand(
      SplitSheetDocument({ songName: 'Test Song', parties: fullParties })
    )
    const texts = findAll(tree, 'TEXT')
    const title = texts.find(t => t.text === 'Split Sheet powered by Funūn')
    const subtitle = texts.find(t => t.text === 'Songwriter and Publishing Split Confirmation')

    expect(title).toBeDefined()
    expect(subtitle).toBeDefined()

    const titleStyle = title!.props.style as Record<string, unknown>
    const subtitleStyle = subtitle!.props.style as Record<string, unknown>

    expect(titleStyle.fontSize).toBe(19)
    expect(titleStyle.lineHeight).toBe(1.2)

    // The subtitle must be pushed clear of the title via its own marginTop
    // and given a controlled lineHeight — both of which are the fix.
    expect(subtitleStyle.marginTop).toBeGreaterThanOrEqual(6)
    expect(subtitleStyle.lineHeight).toBe(1.3)
  })
})

// ─── Full document ───────────────────────────────────────────────────────

describe('SplitSheetDocument', () => {
  it('renders the title and subtitle exactly as approved', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Split Sheet powered by Funūn')
    expect(text).toContain('Songwriter and Publishing Split Confirmation')
  })

  it('renders Work Details: date, composition title, artist name, album/project title, record label', () => {
    const doc = SplitSheetDocument({
      songName: 'Neon Static',
      artistName: 'Maya Carter',
      albumProjectTitle: 'Neon Hours (EP)',
      recordLabel: 'Independent',
      agreementDate: '2026-07-20',
      parties: fullParties,
    })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Date')
    expect(text).toContain('July 20, 2026')
    expect(text).toContain('Composition Title')
    expect(text).toContain('Neon Static')
    expect(text).toContain('Artist Name')
    expect(text).toContain('Maya Carter')
    expect(text).toContain('Album / Project Title')
    expect(text).toContain('Neon Hours (EP)')
    expect(text).toContain('Record Label')
    expect(text).toContain('Independent')
  })

  it('prints "Prepared by {name} · sent through Funūn" only when an initiator name is present', () => {
    const withInitiator = SplitSheetDocument({
      songName: 'Neon Static',
      initiatorName: 'Maya Carter',
      parties: fullParties,
    })
    expect(collectText(expand(withInitiator)).join('')).toContain(
      'Prepared byMaya Carter · sent through Funūn'
    )

    const withoutInitiator = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    expect(collectText(expand(withoutInitiator)).join('')).not.toContain('Prepared by')
  })

  it('renders exactly the five approved Split Breakdown columns (no Role, no IPI)', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Writer Legal Name')
    expect(text).toContain('Split %')
    expect(text).toContain('PRO / Society')
    expect(text).toContain('Publishing Designee')
    expect(text).toContain('Administrator')
    // IPI numbers must never render — retained in the DB for CWR/PRO
    // registration but not part of the approved five columns.
    expect(text).not.toContain('00123456789')
    expect(text).not.toContain('00987654321')
  })

  it('renders "Legal Name (p/k/a Professional Name)" when they differ, legal name alone when they match', () => {
    const doc = SplitSheetDocument({
      songName: 'Neon Static',
      parties: [
        { name: 'André Beaumont', pro: 'SACEM', split_percentage: 50, legal_name: 'André Beaumont' },
        { name: 'NJ Keys', pro: 'BMI', split_percentage: 50, legal_name: 'Nikola Jokić' },
      ],
    })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('André Beaumont')
    expect(text).not.toContain('André Beaumont (p/k/a André Beaumont)')
    expect(text).toContain('Nikola Jokić (p/k/a NJ Keys)')
  })

  it('renders the Split Breakdown total', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Total')
    expect(text).toContain('100.0%')
  })

  it('renders both AGREEMENT_CLAUSES sentences verbatim, in order', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    for (const clause of AGREEMENT_CLAUSES) {
      expect(text).toContain(clause)
    }
    expect(text.indexOf(AGREEMENT_CLAUSES[0])).toBeLessThan(text.indexOf(AGREEMENT_CLAUSES[1]))
  })

  it('renders a numbered Writer Signature Details block per party with locked PRO/Designee/Administrator and both DocuSeal tags', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')

    expect(text).toContain('(1) Maya Elise Carter (p/k/a Maya Carter)')
    expect(text).toContain('(2) Marco Belan')

    fullParties.forEach((party, i) => {
      const tag = partyRoleTag(i)
      expect(text).toContain(`{{Signature;role=${tag};type=signature}}`)
      expect(text).toContain(`{{Date;role=${tag};type=date}}`)
    })
    expect(text).toContain('Signature')
    expect(text).toContain('Date')
  })

  it('wraps each signature block in wrap={false} so it never splits across a page boundary', () => {
    const tree = expand(SplitSheetDocument({ songName: 'Neon Static', parties: fullParties }))
    const views = findAll(tree, 'VIEW')
    // findAll pushes every VIEW ancestor, so text-substring matching alone
    // would also catch outer wrapper views; the wrap prop is only ever set
    // on the signature-block View itself, so filter on that directly.
    const signatureBlocks = views.filter(v => v.props.wrap === false)
    expect(signatureBlocks.length).toBe(fullParties.length)
    for (const block of signatureBlocks) {
      expect(block.text).toContain('{{Signature;role=')
    }
  })

  it('renders exactly the three approved Guidance Notes verbatim, in order, inside a callout with the accent border', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    for (const note of GUIDANCE_NOTES) {
      expect(text).toContain(note)
    }

    const tree = expand(doc)
    const views = findAll(tree, 'VIEW')
    // findAll pushes every VIEW ancestor, so an outer section wrapper also
    // "contains" all three notes in its aggregated text; the accent border
    // is only ever set on the callout box itself, so select on that.
    const calloutBox = views.find(v => {
      const style = v.props.style as Record<string, unknown> | undefined
      return typeof style?.borderLeft === 'string'
    })
    expect(calloutBox).toBeDefined()
    expect(GUIDANCE_NOTES.every(n => calloutBox!.text.includes(n))).toBe(true)
    const style = calloutBox!.props.style as Record<string, unknown>
    expect(String(style.borderLeft)).toContain('#818CF8')
  })

  it('renders the confidential-use footer', () => {
    const doc = SplitSheetDocument({ songName: 'Neon Static', parties: fullParties })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Prepared with Funūn · Confidential — for licensing and registration use only')
  })

  describe('backwards-compatible degradation (pre-063 legacy row)', () => {
    it('uses the professional name for a party with no legal_name, with no p/k/a suffix', () => {
      const doc = SplitSheetDocument({ songName: 'Legacy Song', parties: [legacyParty] })
      const text = collectText(expand(doc)).join('')
      expect(text).toContain('Marco Belan')
      expect(text).not.toContain('(p/k/a')
    })

    it('renders an em-dash for missing publishing designee and administrator, never a blank cell', () => {
      const doc = SplitSheetDocument({ songName: 'Legacy Song', parties: [legacyParty] })
      const text = collectText(expand(doc)).join('')
      expect(text).toContain('—')
    })

    it('renders em-dashes for missing standalone work details (artist name, album title, record label, date)', () => {
      const doc = SplitSheetDocument({ songName: 'Legacy Song', parties: [legacyParty] })
      const text = collectText(expand(doc)).join('')
      // Composition title always renders; the other four Work Details
      // fields fall back to an em-dash rather than being blank/omitted.
      const emDashCount = (text.match(/—/g) ?? []).length
      expect(emDashCount).toBeGreaterThanOrEqual(4)
    })

    it('still renders every section and does not crash on a fully legacy sheet', async () => {
      const buffer = await renderSplitSheet({ songName: 'Legacy Song', parties: [legacyParty] })
      expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
    })
  })
})

// ─── renderSplitSheet ──────────────────────────────────────────────────

describe('renderSplitSheet', () => {
  it('returns a non-empty Buffer with a valid PDF header', async () => {
    const buffer = await renderSplitSheet({ songName: 'Neon Static', parties: fullParties })
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('renders successfully with a single party and no work details attached (standalone sheet)', async () => {
    const buffer = await renderSplitSheet({ songName: 'Standalone Song', parties: [fullParties[0]] })
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('accepts the legacy projectTitle field as a fallback for albumProjectTitle', async () => {
    const doc = SplitSheetDocument({
      songName: 'Neon Static',
      projectTitle: 'Neon Static EP',
      parties: fullParties,
    })
    const text = collectText(expand(doc)).join('')
    expect(text).toContain('Neon Static EP')
  })
})
