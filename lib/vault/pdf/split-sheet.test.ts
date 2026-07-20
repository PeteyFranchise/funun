// ─── split-sheet.tsx tests ─────────────────────────────────────────────
// Asserts renderSplitSheet produces a real PDF buffer, partyRoleTag is
// stable/unique, and SplitSheetDocument wires each party into a table row
// plus a role-tagged DocuSeal signature text tag.

import { renderSplitSheet, SplitSheetDocument, partyRoleTag } from './split-sheet'
import type { SplitSheetParty } from '@/lib/split-sheets/approval'

// React elements from @react-pdf/renderer are plain {type, props} objects —
// no renderer/DOM needed to inspect them. JSX only calls React.createElement,
// it never invokes component functions, so composite elements (PartyRow,
// PartySignatureBlock) must be manually "rendered" (call type(props)) to
// reach their output; primitive elements (Document/Page/View/Text) carry
// their real content directly in props.children. Walk both cases and
// flatten every string/number leaf into one array so we can assert on
// rendered content without react-test-renderer (not installed) or a PDF
// parser.
function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return acc
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node))
    return acc
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, acc)
    return acc
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (typeof el.type === 'function') {
      const rendered = (el.type as (props: unknown) => unknown)(el.props)
      collectText(rendered, acc)
      return acc
    }
    if (el.props) collectText(el.props.children, acc)
  }
  return acc
}

const parties: SplitSheetParty[] = [
  {
    name: 'Aiko Rivera',
    email: 'aiko@example.com',
    pro: 'ASCAP',
    ipi: '00123456789',
    role: 'composer_lyricist',
    split_percentage: 60,
  },
  {
    name: 'Marco Belan',
    email: 'marco@example.com',
    pro: 'BMI',
    ipi: null,
    role: 'producer',
    split_percentage: 40,
  },
]

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

describe('SplitSheetDocument', () => {
  it('renders a row and a role-tagged signature field for every party', () => {
    const doc = SplitSheetDocument({
      songName: 'Neon Static',
      projectTitle: 'Neon Static EP',
      initiatorName: 'Aiko Rivera',
      parties,
    })
    // Join with no separator — adjacent Text children (e.g. `{n}` then a
    // literal `%`) render contiguous in the actual PDF, so this mirrors
    // visual output rather than the artificial ' | ' debug boundary.
    const text = collectText(doc).join('')

    parties.forEach((party, i) => {
      expect(text).toContain(party.name)
      expect(text).toContain(`${party.split_percentage}%`)
      // Ipi rendered when present, em dash when absent.
      if (party.ipi) expect(text).toContain(party.ipi)
      // Signature text tag bound to this party's stable role tag.
      const tag = partyRoleTag(i)
      expect(text).toContain(`{{Signature;role=${tag};type=signature}}`)
    })

    // PRO labels resolved via lib/metadata/schema.ts, not raw codes.
    expect(text).toContain('ASCAP (US)')
    expect(text).toContain('BMI (US)')

    // Header + total-splits line.
    expect(text).toContain('Neon Static')
    expect(text).toContain('Aiko Rivera')
    expect(text).toContain('100.0%')
  })

  it('shows an em dash for a party with no IPI', () => {
    const doc = SplitSheetDocument({
      songName: 'No IPI Song',
      projectTitle: null,
      initiatorName: 'Marco Belan',
      parties: [parties[1]],
    })
    // Join with no separator — adjacent Text children (e.g. `{n}` then a
    // literal `%`) render contiguous in the actual PDF, so this mirrors
    // visual output rather than the artificial ' | ' debug boundary.
    const text = collectText(doc).join('')
    expect(text).toContain('—')
  })
})

describe('renderSplitSheet', () => {
  it('returns a non-empty Buffer with a valid PDF header', async () => {
    const buffer = await renderSplitSheet({
      songName: 'Neon Static',
      projectTitle: 'Neon Static EP',
      initiatorName: 'Aiko Rivera',
      parties,
    })

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
    // PDF files start with the literal bytes "%PDF-".
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('renders successfully with a single party and no project attached (standalone sheet)', async () => {
    const buffer = await renderSplitSheet({
      songName: 'Standalone Song',
      projectTitle: null,
      initiatorName: 'Aiko Rivera',
      parties: [parties[0]],
    })
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
