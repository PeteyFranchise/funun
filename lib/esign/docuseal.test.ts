// RED-first tests for the DocuSeal fetch adapter (ESIGN-01, 17-06 Task 1).
//
// EVERY test here mocks global.fetch. This suite must NEVER reach the live
// DocuSeal API: each completed document bills $0.20 and each submission
// mints real signature invites to real inboxes. A test that hits the
// network is a test that spends money and emails strangers.

import { createHmac } from 'crypto'
import {
  DocuSealProvider,
  DOCUSEAL_API_BASE,
  SUBMISSION_EXPIRY_DAYS,
} from './docuseal'

// ─── Fetch harness ──────────────────────────────────────────────────────

type Call = { url: string; init: RequestInit }

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function bytesResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => '',
  } as unknown as Response
}

/** Records every fetch call and replies from a queue of responses. */
function mockFetch(responses: Response[]): { calls: Call[] } {
  const calls: Call[] = []
  const queue = [...responses]
  global.fetch = jest.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit })
    const next = queue.shift()
    if (!next) throw new Error(`Unexpected extra fetch call to ${String(url)}`)
    return next
  }) as unknown as typeof fetch
  return { calls }
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

function headerOf(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name]
}

const TEMPLATE_RESPONSE = { id: 55501, slug: 'tmplSlug', name: 'Split Sheet' }

const SUBMITTERS_RESPONSE = [
  {
    id: 9001,
    submission_id: 9477115,
    email: 'aisha@example.com',
    role: 'Party1',
    slug: 'aaaaSlug',
    external_id: 'party-a',
    embed_src: 'https://docuseal.com/s/aaaaSlug',
  },
  {
    id: 9002,
    submission_id: 9477115,
    email: 'ben@example.com',
    role: 'Party2',
    slug: 'bbbbSlug',
    external_id: 'party-b',
    embed_src: 'https://docuseal.com/s/bbbbSlug',
  },
]

const INPUT = {
  title: 'Split Sheet — Blue Hour',
  pdf: { filename: 'split-sheet.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
  signers: [
    { name: 'Aisha Rahman', email: 'aisha@example.com', role: 'Party1', externalId: 'party-a' },
    { name: 'Ben Ortiz', email: 'ben@example.com', role: 'Party2', externalId: 'party-b' },
  ],
  embedded: true,
  replyTo: 'esign@funun.studio',
}

const originalFetch = global.fetch
const originalEnv = { ...process.env }

beforeEach(() => {
  process.env.DOCUSEAL_API_KEY = 'test-api-key-never-real'
  process.env.DOCUSEAL_WEBHOOK_SECRET = 'whsec_testsecret'
})

afterEach(() => {
  global.fetch = originalFetch
  process.env = { ...originalEnv }
  jest.restoreAllMocks()
})

// ─── Interface conformance ──────────────────────────────────────────────

describe('DocuSealProvider identity', () => {
  it('declares the docuseal provider id from the shared union', () => {
    expect(new DocuSealProvider().id).toBe('docuseal')
  })
})

// ─── createRequest ──────────────────────────────────────────────────────

describe('DocuSealProvider.createRequest', () => {
  it('posts the rendered PDF to /templates/pdf, then /submissions against that template', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe(`${DOCUSEAL_API_BASE}/templates/pdf`)
    expect(calls[1].url).toBe(`${DOCUSEAL_API_BASE}/submissions`)
    expect(bodyOf(calls[1]).template_id).toBe(TEMPLATE_RESPONSE.id)
  })

  it('base64-encodes the Funūn-rendered buffer as the only document (AM-2 template-only)', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    const documents = bodyOf(calls[0]).documents as { name: string; file: string }[]
    expect(documents).toHaveLength(1)
    expect(documents[0].file).toBe(Buffer.from(INPUT.pdf.bytes).toString('base64'))
    expect(documents[0].name).toBe(INPUT.pdf.filename)
  })

  it("mints with order 'random' so all parties can sign in parallel, days apart (P17-01/P17-02)", async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    expect(bodyOf(calls[1]).order).toBe('random')
  })

  it('disables the provider invite email — Funūn sends the only invite (P17-10, ESIGN-18)', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    const body = bodyOf(calls[1])
    expect(body.send_email).toBe(false)
    // Belt and braces: per-submitter too, so a submission-level default
    // change upstream cannot silently re-enable provider mail.
    for (const submitter of body.submitters as Record<string, unknown>[]) {
      expect(submitter.send_email).toBe(false)
    }
  })

  it('sets a per-submitter reply_to so a collaborator reply reaches a monitored Funūn mailbox', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    const body = bodyOf(calls[1])
    for (const submitter of body.submitters as Record<string, unknown>[]) {
      expect(submitter.reply_to).toBe('esign@funun.studio')
    }
    expect(body.reply_to).toBe('esign@funun.studio')
  })

  it('omits reply_to entirely when no e-sign mailbox is configured', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest({ ...INPUT, replyTo: undefined })

    const body = bodyOf(calls[1])
    expect(body).not.toHaveProperty('reply_to')
    for (const submitter of body.submitters as Record<string, unknown>[]) {
      expect(submitter).not.toHaveProperty('reply_to')
    }
  })

  it('carries each signer role verbatim so DocuSeal binds them to the PDF text tags', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    const submitters = bodyOf(calls[1]).submitters as Record<string, unknown>[]
    expect(submitters.map(s => s.role)).toEqual(['Party1', 'Party2'])
    expect(submitters.map(s => s.email)).toEqual(['aisha@example.com', 'ben@example.com'])
    expect(submitters.map(s => s.external_id)).toEqual(['party-a', 'party-b'])
  })

  it('sets expire_at well beyond the 30-day Funūn approval window (RESEARCH A4)', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])
    const before = Date.now()

    await new DocuSealProvider().createRequest(INPUT)

    const expireAt = String(bodyOf(calls[1]).expire_at)
    // Parsed back from the "YYYY-MM-DD HH:MM:SS UTC" format DocuSeal documents.
    const parsed = Date.parse(expireAt.replace(' UTC', 'Z').replace(' ', 'T'))
    const days = (parsed - before) / (1000 * 60 * 60 * 24)
    expect(SUBMISSION_EXPIRY_DAYS).toBeGreaterThanOrEqual(30)
    expect(days).toBeGreaterThan(30)
  })

  it('authenticates both calls with X-Auth-Token from the server-only env var', async () => {
    const { calls } = mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    await new DocuSealProvider().createRequest(INPUT)

    expect(headerOf(calls[0], 'X-Auth-Token')).toBe('test-api-key-never-real')
    expect(headerOf(calls[1], 'X-Auth-Token')).toBe('test-api-key-never-real')
  })

  it('never leaks the API key into the returned result (T-17-15)', async () => {
    mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    const result = await new DocuSealProvider().createRequest(INPUT)

    expect(JSON.stringify(result)).not.toContain('test-api-key-never-real')
  })

  it('returns the submission id plus a per-signer slug and embed src for the client embed', async () => {
    mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse(SUBMITTERS_RESPONSE)])

    const result = await new DocuSealProvider().createRequest(INPUT)

    expect(result.requestId).toBe('9477115')
    expect(result.templateId).toBe('55501')
    expect(result.signers).toEqual([
      {
        email: 'aisha@example.com',
        role: 'Party1',
        externalId: 'party-a',
        submitterId: '9001',
        slug: 'aaaaSlug',
        embedSrc: 'https://docuseal.com/s/aaaaSlug',
      },
      {
        email: 'ben@example.com',
        role: 'Party2',
        externalId: 'party-b',
        submitterId: '9002',
        slug: 'bbbbSlug',
        embedSrc: 'https://docuseal.com/s/bbbbSlug',
      },
    ])
    expect(result.signingUrls).toEqual([
      { email: 'aisha@example.com', url: 'https://docuseal.com/s/aaaaSlug' },
      { email: 'ben@example.com', url: 'https://docuseal.com/s/bbbbSlug' },
    ])
  })

  it('derives the embed src from the slug when the provider omits embed_src', async () => {
    mockFetch([
      jsonResponse(TEMPLATE_RESPONSE),
      jsonResponse([{ id: 9003, submission_id: 77, email: 'c@example.com', role: 'Party1', slug: 'ccccSlug' }]),
    ])

    const result = await new DocuSealProvider().createRequest(INPUT)

    expect(result.signers?.[0].embedSrc).toBe('https://docuseal.com/s/ccccSlug')
  })

  it('throws a descriptive error when DOCUSEAL_API_KEY is unset — never calls out unauthenticated', async () => {
    delete process.env.DOCUSEAL_API_KEY
    const { calls } = mockFetch([])

    await expect(new DocuSealProvider().createRequest(INPUT)).rejects.toThrow(/DOCUSEAL_API_KEY/)
    expect(calls).toHaveLength(0)
  })

  it('throws with the provider status and body when template creation fails', async () => {
    mockFetch([jsonResponse({ error: 'plan required' }, 402)])

    await expect(new DocuSealProvider().createRequest(INPUT)).rejects.toThrow(/402/)
  })

  it('throws when the submission response carries no submitters', async () => {
    mockFetch([jsonResponse(TEMPLATE_RESPONSE), jsonResponse([])])

    await expect(new DocuSealProvider().createRequest(INPUT)).rejects.toThrow(/submitter/i)
  })

  it('rejects an empty signer list before spending a template call', async () => {
    const { calls } = mockFetch([])

    await expect(
      new DocuSealProvider().createRequest({ ...INPUT, signers: [] })
    ).rejects.toThrow(/signer/i)
    expect(calls).toHaveLength(0)
  })
})

// ─── archiveSubmission (void path, P17-02) ──────────────────────────────

describe('DocuSealProvider.archiveSubmission', () => {
  it('DELETEs the submission — archives rather than completes, so it never bills', async () => {
    const { calls } = mockFetch([jsonResponse({ id: 9477116, archived_at: '2026-07-20T00:00:00Z' })])

    await new DocuSealProvider().archiveSubmission('9477116')

    expect(calls[0].url).toBe(`${DOCUSEAL_API_BASE}/submissions/9477116`)
    expect(calls[0].init.method).toBe('DELETE')
    expect(headerOf(calls[0], 'X-Auth-Token')).toBe('test-api-key-never-real')
  })

  it('throws on a failed archive so the void route can surface it', async () => {
    mockFetch([jsonResponse({ error: 'not found' }, 404)])

    await expect(new DocuSealProvider().archiveSubmission('nope')).rejects.toThrow(/404/)
  })
})

// ─── downloadSignedPdf ──────────────────────────────────────────────────

describe('DocuSealProvider.downloadSignedPdf', () => {
  it('resolves the document URL then fetches its bytes', async () => {
    const pdfBytes = new Uint8Array([1, 2, 3, 4])
    const { calls } = mockFetch([
      jsonResponse({ id: 1, documents: [{ name: 'split-sheet', url: 'https://docuseal.com/file/x.pdf' }] }),
      bytesResponse(pdfBytes),
    ])

    const result = await new DocuSealProvider().downloadSignedPdf('1001')

    expect(calls[0].url).toBe(`${DOCUSEAL_API_BASE}/submissions/1001/documents`)
    expect(calls[1].url).toBe('https://docuseal.com/file/x.pdf')
    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('throws when the submission has no documents yet', async () => {
    mockFetch([jsonResponse({ id: 1, documents: [] })])

    await expect(new DocuSealProvider().downloadSignedPdf('1001')).rejects.toThrow(/document/i)
  })
})

// ─── parseWebhook ───────────────────────────────────────────────────────
// Verification itself lives in lib/esign/webhook.ts (17-01) and is tested
// there; these assert the adapter DELEGATES rather than re-implementing.

function signedRequest(payload: unknown, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Request {
  const rawBody = JSON.stringify(payload)
  const hmac = createHmac('sha256', secret).update(`${nowSeconds}.${rawBody}`).digest('hex')
  return {
    text: async () => rawBody,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-docuseal-signature' ? `${nowSeconds}.${hmac}` : null) },
  } as unknown as Request
}

describe('DocuSealProvider.parseWebhook', () => {
  it('maps a valid submission.completed event to all_signed', async () => {
    const request = signedRequest(
      { event_type: 'submission.completed', data: { id: '9477115' } },
      'whsec_testsecret'
    )

    const event = await new DocuSealProvider().parseWebhook(request)

    expect(event).toEqual({ type: 'all_signed', requestId: '9477115' })
  })

  it('maps a valid form.completed event to signed with the signer email', async () => {
    const request = signedRequest(
      { event_type: 'form.completed', data: { submission_id: '9477115', email: 'aisha@example.com' } },
      'whsec_testsecret'
    )

    const event = await new DocuSealProvider().parseWebhook(request)

    expect(event).toEqual({ type: 'signed', requestId: '9477115', signerEmail: 'aisha@example.com' })
  })

  it('rejects a payload signed with the wrong secret (tampered signature)', async () => {
    const request = signedRequest(
      { event_type: 'submission.completed', data: { id: '9477115' } },
      'whsec_attacker'
    )

    await expect(new DocuSealProvider().parseWebhook(request)).rejects.toThrow(/signature/i)
  })

  it('rejects a stale timestamp outside the tolerance window', async () => {
    const stale = Math.floor(Date.now() / 1000) - 60 * 60
    const request = signedRequest(
      { event_type: 'submission.completed', data: { id: '9477115' } },
      'whsec_testsecret',
      stale
    )

    await expect(new DocuSealProvider().parseWebhook(request)).rejects.toThrow(/signature/i)
  })

  it('throws when DOCUSEAL_WEBHOOK_SECRET is unset rather than accepting unverified events', async () => {
    delete process.env.DOCUSEAL_WEBHOOK_SECRET
    const request = signedRequest(
      { event_type: 'submission.completed', data: { id: '9477115' } },
      'whsec_testsecret'
    )

    await expect(new DocuSealProvider().parseWebhook(request)).rejects.toThrow(/DOCUSEAL_WEBHOOK_SECRET/)
  })
})
