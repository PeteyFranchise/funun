// ─── completion-certificate.tsx tests ──────────────────────────────────
// Covers Funūn's own Certificate of Completion (ESIGN-19, P17-10) and,
// centrally, the honesty constraint: every fact Funūn did not itself
// observe must render ONLY inside the attributed provider-record region,
// under a heading naming the signing provider as its source.
//
// The containment assertion is the load-bearing test in this file. It
// walks the rendered element tree (the pattern split-sheet.test.ts
// established in 17-03/17-09), locates the provider-record subtree by its
// marker id, and asserts that removing that subtree's text from the
// document's text leaves NO occurrence of any providerReported value
// anywhere else on the page.

import {
  renderCompletionCertificate,
  CompletionCertificateDocument,
  NOT_LEGAL_ADVICE_STATEMENT,
  PROVIDER_RECORD_ID,
  type CompletionCertificateInput,
} from './completion-certificate'

// ─── Tree-walk helpers (same approach as split-sheet.test.ts) ───────────

type Expanded =
  | string
  | number
  | null
  | Expanded[]
  | { type: string; props: Record<string, unknown>; children: Expanded }

function isElement(node: unknown): node is { type: unknown; props?: { children?: unknown } } {
  return typeof node === 'object' && node !== null && 'type' in node
}

function expand(node: unknown): Expanded {
  if (node == null || typeof node === 'boolean') return null
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(expand)
  if (isElement(node)) {
    if (typeof node.type === 'function') {
      return expand((node.type as (props: unknown) => unknown)(node.props))
    }
    const props = (node.props ?? {}) as Record<string, unknown>
    return { type: node.type as string, props, children: expand(props.children) }
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

function documentText(input: CompletionCertificateInput): string {
  return collectText(expand(CompletionCertificateDocument(input))).join('')
}

/** The aggregated text of the single attributed provider-record region. */
function providerRecordText(input: CompletionCertificateInput): string {
  const views = findAll(expand(CompletionCertificateDocument(input)), 'VIEW')
  const region = views.find(v => v.props.id === PROVIDER_RECORD_ID)
  expect(region).toBeDefined()
  return region!.text
}

/**
 * Everything on the page EXCEPT the attributed provider-record region.
 * The region's text is a contiguous run of the document's text (tree
 * order), so removing that one run yields exactly the unattributed
 * surface — which must contain no provider-reported fact at all.
 */
function textOutsideProviderRecord(input: CompletionCertificateInput): string {
  const full = documentText(input)
  const region = providerRecordText(input)
  expect(full).toContain(region)
  return full.replace(region, '')
}

// ─── Fixtures ────────────────────────────────────────────────────────────

const input: CompletionCertificateInput = {
  funuunObserved: {
    songName: 'Neon Static',
    artistName: 'Maya Carter',
    albumProjectTitle: 'Neon Hours (EP)',
    recordLabel: 'Independent',
    projectTitle: 'Neon Hours',
    splitSheetId: '7f3c1b90-2d44-4a51-9c02-8be1f0a44c11',
    executedDocumentPath: 'contracts/2026/neon-static-split-sheet-executed.pdf',
    parties: [
      {
        legalName: 'Maya Elise Carter',
        professionalName: 'Maya Carter',
        splitPercentage: 60,
        pro: 'ASCAP',
        publishingDesignee: 'Neon Hours Publishing',
        administrator: 'Songtrust',
      },
      {
        legalName: 'Nikola Jokić',
        professionalName: 'NJ Keys',
        splitPercentage: 40,
        pro: 'BMI',
      },
    ],
  },
  providerReported: {
    providerName: 'DocuSeal',
    submissionId: 'sub_9f21ac77',
    originalDocumentSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00',
    resultDocumentSha256: '00ffeeddccbbaa998877665544332211f09e8d7c6b5a4938271605f4e3d2c1b0',
    auditLogPath: 'contracts/2026/neon-static-audit-log.pdf',
    signers: [
      {
        name: 'Maya Elise Carter',
        email: 'maya@example.com',
        completedAt: '2026-07-18T14:32:05Z',
        completionMethod: 'interactive',
        emailVerified: true,
        ipAddress: '203.0.113.24',
        sessionId: 'sess_4d19be02',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        timezone: 'America/New_York',
      },
      {
        name: 'Nikola Jokić',
        email: 'nikola@example.com',
        completedAt: '2026-07-19T09:07:41Z',
        completionMethod: 'api',
        emailVerified: false,
        ipAddress: '198.51.100.7',
        sessionId: 'sess_bb70cc31',
        userAgent: 'funun-server/1.0',
        timezone: 'Europe/Belgrade',
      },
    ],
  },
}

/** Every raw provider-reported string that must never escape the region. */
const PROVIDER_REPORTED_VALUES = [
  input.providerReported.submissionId,
  input.providerReported.originalDocumentSha256!,
  input.providerReported.resultDocumentSha256!,
  input.providerReported.auditLogPath!,
  ...input.providerReported.signers.flatMap(s => [
    s.ipAddress!,
    s.sessionId!,
    s.userAgent!,
    s.timezone!,
  ]),
]

// ─── The honesty constraint (T-17-30) ────────────────────────────────────

describe('provenance containment (T-17-30 — the honesty constraint)', () => {
  it('renders exactly one attributed provider-record region', () => {
    const views = findAll(expand(CompletionCertificateDocument(input)), 'VIEW')
    expect(views.filter(v => v.props.id === PROVIDER_RECORD_ID)).toHaveLength(1)
  })

  it('renders every provider-reported value somewhere on the certificate', () => {
    const full = documentText(input)
    for (const value of PROVIDER_REPORTED_VALUES) {
      expect(full).toContain(value)
    }
  })

  it('renders every provider-reported value ONLY inside the attributed region', () => {
    const outside = textOutsideProviderRecord(input)
    for (const value of PROVIDER_REPORTED_VALUES) {
      expect(outside).not.toContain(value)
    }
  })

  it('keeps per-signer completion timestamps inside the attributed region too', () => {
    const outside = textOutsideProviderRecord(input)
    const region = providerRecordText(input)
    expect(region).toContain('July 18, 2026')
    expect(region).toContain('July 19, 2026')
    expect(outside).not.toContain('July 18, 2026')
    expect(outside).not.toContain('July 19, 2026')
  })

  it('keeps email-verification status inside the attributed region', () => {
    const outside = textOutsideProviderRecord(input)
    expect(outside.toLowerCase()).not.toContain('verified')
  })

  it('names the provider as the source in the attributed region heading', () => {
    const region = providerRecordText(input)
    expect(region).toContain('DocuSeal')
  })

  it('states that the provider captured these details and that Funūn did not', () => {
    const region = providerRecordText(input).toLowerCase()
    expect(region).toContain('captured and reported by docuseal')
    expect(region).toContain('did not independently capture')
  })

  it("cites the provider's audit log as the underlying evidence record, by location", () => {
    const region = providerRecordText(input).toLowerCase()
    expect(region).toContain('audit log')
    expect(region).toContain(input.providerReported.auditLogPath!.toLowerCase())
  })

  it("does not reproduce or claim to have produced the provider's audit log", () => {
    const full = documentText(input).toLowerCase()
    expect(full).not.toContain('funūn audit log')
    expect(full).not.toContain('audit log generated by funūn')
  })

  it('still contains provider data only inside the region when hashes and audit path are absent', () => {
    const sparse: CompletionCertificateInput = {
      ...input,
      providerReported: {
        ...input.providerReported,
        originalDocumentSha256: null,
        resultDocumentSha256: null,
        auditLogPath: null,
      },
    }
    const outside = textOutsideProviderRecord(sparse)
    expect(outside).not.toContain(sparse.providerReported.submissionId)
    for (const signer of sparse.providerReported.signers) {
      expect(outside).not.toContain(signer.ipAddress!)
    }
  })
})

// ─── Funūn-observed surface ──────────────────────────────────────────────

describe('CompletionCertificateDocument — Funūn-observed facts', () => {
  it("identifies the document as Funūn's own Certificate of Completion", () => {
    const text = documentText(input)
    expect(text).toContain('Certificate of Completion')
    expect(text).toContain('Funūn')
  })

  it('renders the song, artist, album/project, label, and linked project', () => {
    const text = documentText(input)
    expect(text).toContain('Neon Static')
    expect(text).toContain('Maya Carter')
    expect(text).toContain('Neon Hours (EP)')
    expect(text).toContain('Independent')
    expect(text).toContain('Neon Hours')
  })

  it('renders each party with legal name, p/k/a professional name, and share', () => {
    const text = documentText(input)
    expect(text).toContain('Maya Elise Carter')
    expect(text).toContain('Nikola Jokić (p/k/a NJ Keys)')
    expect(text).toContain('60%')
    expect(text).toContain('40%')
  })

  it('reports the share dimension the executed agreement states, labelled as such', () => {
    const text = documentText(input)
    expect(text).toContain('Songwriting / Publishing Split')
  })

  it("carries the agreement's master-ownership scope clarification rather than implying master coverage", () => {
    const text = documentText(input).toLowerCase()
    expect(text).toContain('master')
  })

  it('renders the Funūn split-sheet identifier and the executed-document location', () => {
    const text = documentText(input)
    expect(text).toContain(input.funuunObserved.splitSheetId)
    expect(text).toContain(input.funuunObserved.executedDocumentPath)
  })

  it('carries the not-legal-advice statement', () => {
    expect(documentText(input)).toContain(NOT_LEGAL_ADVICE_STATEMENT)
  })

  it('never asserts legal effect beyond recording completion', () => {
    const text = documentText(input).toLowerCase()
    expect(text).not.toContain('legally binding')
    expect(text).not.toContain('enforceable in')
    expect(text).toContain('records the completion')
  })

  it('degrades missing optional work details to an em-dash rather than blank or "undefined"', () => {
    const sparse: CompletionCertificateInput = {
      ...input,
      funuunObserved: {
        ...input.funuunObserved,
        artistName: null,
        albumProjectTitle: null,
        recordLabel: null,
        projectTitle: null,
      },
    }
    const text = documentText(sparse)
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
    expect((text.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
})

// ─── Completion method distinction ───────────────────────────────────────

describe('completion method', () => {
  it('renders an API-completed signer distinguishably from an interactive one', () => {
    const region = providerRecordText(input)
    expect(region.toLowerCase()).toContain('api')
    // The two signers must not read identically.
    const perSigner = findAll(
      expand(CompletionCertificateDocument(input)),
      'VIEW'
    ).filter(v => v.props.id === PROVIDER_RECORD_ID)
    expect(perSigner).toHaveLength(1)
    expect(region).toContain('Maya Elise Carter')
    expect(region).toContain('Nikola Jokić')
  })

  it('labels an interactive signature and an API completion with different wording', () => {
    const interactiveOnly = providerRecordText({
      ...input,
      providerReported: {
        ...input.providerReported,
        signers: [input.providerReported.signers[0]],
      },
    })
    const apiOnly = providerRecordText({
      ...input,
      providerReported: {
        ...input.providerReported,
        signers: [input.providerReported.signers[1]],
      },
    })
    expect(interactiveOnly).not.toBe(apiOnly)
    expect(apiOnly.toLowerCase()).toContain('api')
    expect(interactiveOnly.toLowerCase()).not.toContain('completed via')
  })

  it('handles a signer whose completion timestamp is not yet known', () => {
    const pending: CompletionCertificateInput = {
      ...input,
      providerReported: {
        ...input.providerReported,
        signers: [{ ...input.providerReported.signers[0], completedAt: null }],
      },
    }
    const region = providerRecordText(pending)
    expect(region).toContain('—')
    expect(region).not.toContain('Invalid Date')
  })
})

// ─── Unicode / font (17-08 regression surface) ───────────────────────────

describe('font registration (ESIGN-15 / P17-08)', () => {
  it('points every styled Text at the registered Funūn PDF font family', () => {
    const texts = findAll(expand(CompletionCertificateDocument(input)), 'TEXT')
    expect(texts.length).toBeGreaterThan(0)
    // The page style carries the family; no Text may override it with a
    // standard-14 WinAnsi font, which silently corrupts "Jokić"/"Funūn".
    for (const t of texts) {
      const style = t.props.style as Record<string, unknown> | Record<string, unknown>[] | undefined
      const entries = Array.isArray(style) ? style : style ? [style] : []
      for (const entry of entries) {
        const family = entry?.fontFamily
        if (family !== undefined) expect(family).toBe('Noto Sans')
      }
    }
  })
})

// ─── renderCompletionCertificate ─────────────────────────────────────────

describe('renderCompletionCertificate', () => {
  it('returns a non-empty Buffer with a valid PDF header', async () => {
    const buffer = await renderCompletionCertificate(input)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })

  it('renders a single-party, single-signer certificate without crashing', async () => {
    const solo: CompletionCertificateInput = {
      funuunObserved: {
        ...input.funuunObserved,
        parties: [input.funuunObserved.parties[0]],
      },
      providerReported: {
        ...input.providerReported,
        signers: [input.providerReported.signers[0]],
      },
    }
    const buffer = await renderCompletionCertificate(solo)
    expect(buffer.subarray(0, 5).toString('utf-8')).toBe('%PDF-')
  })
})
