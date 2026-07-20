// ─── DocuSeal completion webhook — verification + idempotency ─────────
// Phase 17 plan 07, Task 1 (ESIGN-07).
//
// NOTHING HERE TOUCHES THE LIVE PROVIDER. `fetch` is never called by the
// route under test (the adapter is mocked wholesale), no envelope is
// minted, no submission is voided, and no invite is sent. Each completed
// DocuSeal document bills $0.20 and mails real collaborators — a test
// suite must never be able to spend either.
//
// The two properties this file exists to prove, both security-load-bearing:
//
//   1. A forged or stale `submission.completed` produces ZERO side effects.
//      The assertion is deliberately "the service client was never even
//      constructed", not "the update was not applied" — a route that
//      queried first and verified second would still fail that check
//      (T-17-20, RESEARCH V6).
//   2. A redelivered completion for an already-completed envelope repeats
//      no work. Providers retry; a non-idempotent handler double-files
//      documents into a collaborator's locker (T-17-21, RESEARCH Pitfall 7).

import { createHmac } from 'crypto'

const WEBHOOK_SECRET = 'whsec_test_secret_do_not_use_live'

// ─── Mocks ────────────────────────────────────────────────────────────

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}))

const mockFetchCompletionArtifacts = jest.fn()
jest.mock('@/lib/esign/docuseal', () => ({
  docusealProvider: {
    fetchCompletionArtifacts: (...args: unknown[]) => mockFetchCompletionArtifacts(...args),
  },
}))

const mockRenderCompletionCertificate = jest.fn()
jest.mock('@/lib/vault/pdf/completion-certificate', () => ({
  renderCompletionCertificate: (...args: unknown[]) => mockRenderCompletionCertificate(...args),
}))

const mockCreateNotification = jest.fn()
jest.mock('@/lib/notifications', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}))

import { POST } from '@/app/api/webhooks/docuseal/route'

// ─── Fake service client ──────────────────────────────────────────────
// Records every write so a test can assert both what happened and, more
// importantly, what did not.

type Recorded = {
  updates: { table: string; values: Record<string, unknown> }[]
  inserts: { table: string; rows: unknown }[]
  uploads: { bucket: string; path: string; contentType?: string }[]
  selectedTables: string[]
}

function makeService(envelopeRow: unknown) {
  const recorded: Recorded = { updates: [], inserts: [], uploads: [], selectedTables: [] }

  const from = jest.fn((table: string) => {
    recorded.selectedTables.push(table)
    const q: Record<string, unknown> = {}
    const resolved = () => Object.assign(Promise.resolve({ data: null, error: null }), q)

    q.select = jest.fn(() => q)
    q.eq = jest.fn(() => resolved())
    q.in = jest.fn(() => resolved())
    q.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: table === 'esign_envelopes' ? envelopeRow : null, error: null })
    )
    q.update = jest.fn((values: Record<string, unknown>) => {
      recorded.updates.push({ table, values })
      return q
    })
    q.insert = jest.fn((rows: unknown) => {
      recorded.inserts.push({ table, rows })
      return resolved()
    })
    return q
  })

  const storage = {
    from: jest.fn((bucket: string) => ({
      upload: jest.fn((path: string, _body: unknown, opts?: { contentType?: string }) => {
        recorded.uploads.push({ bucket, path, contentType: opts?.contentType })
        return Promise.resolve({ data: { path }, error: null })
      }),
      getPublicUrl: jest.fn((path: string) => ({
        data: { publicUrl: `https://storage.test/${bucket}/${path}` },
      })),
    })),
  }

  return { client: { from, storage }, recorded }
}

// ─── Fixtures ─────────────────────────────────────────────────────────

const SUBMISSION_ID = '9477999'
const SHEET_ID = 'sheet-uuid-1'
const ENVELOPE_ID = 'env-uuid-1'

function pendingEnvelope() {
  return {
    id: ENVELOPE_ID,
    status: 'pending',
    split_sheet_id: SHEET_ID,
    docuseal_submission_id: SUBMISSION_ID,
    esign_envelope_signers: [
      { id: 'signer-1', split_sheet_party_id: 'party-1', docuseal_submitter_id: 'sub-1' },
      { id: 'signer-2', split_sheet_party_id: 'party-2', docuseal_submitter_id: 'sub-2' },
    ],
    split_sheets: {
      id: SHEET_ID,
      song_name: 'Test Song',
      artist_name: 'Test Artist',
      album_project_title: null,
      record_label: null,
      vault_project_id: 'project-1',
      initiator_user_id: 'user-initiator',
      split_sheet_parties: [
        {
          id: 'party-1',
          user_id: 'user-initiator',
          name: 'Ada',
          email: 'ada@test.local',
          legal_name: 'Ada Lovelace',
          split_percentage: 50,
          pro: 'ASCAP',
          publishing_designee: null,
          administrator: null,
        },
        {
          id: 'party-2',
          user_id: null,
          name: 'Nikola',
          email: 'nikola@test.local',
          legal_name: 'Nikola Jokić',
          split_percentage: 50,
          pro: null,
          publishing_designee: null,
          administrator: null,
        },
      ],
    },
  }
}

function completionPayload() {
  return {
    event_type: 'submission.completed',
    timestamp: '2026-07-20T12:00:00Z',
    data: {
      id: SUBMISSION_ID,
      audit_log_url: 'https://docuseal.test/audit.pdf',
      submitters: [
        { id: 'sub-1', email: 'ada@test.local', name: 'Ada', completed_at: '2026-07-20T11:00:00Z' },
        {
          id: 'sub-2',
          email: 'nikola@test.local',
          name: 'Nikola',
          completed_at: '2026-07-20T11:30:00Z',
        },
      ],
    },
  }
}

function sign(body: string, secret = WEBHOOK_SECRET, tsSeconds = Math.floor(Date.now() / 1000)) {
  const hex = createHmac('sha256', secret).update(`${tsSeconds}.${body}`).digest('hex')
  return `${tsSeconds}.${hex}`
}

function request(body: string, signature: string | null) {
  return new Request('http://test.local/api/webhooks/docuseal', {
    method: 'POST',
    body,
    headers: signature ? { 'X-Docuseal-Signature': signature } : {},
  })
}

function artifacts() {
  return {
    executedPdf: new Uint8Array([1, 2, 3]),
    auditLog: new Uint8Array([4, 5, 6]),
    originalDocumentSha256: 'a'.repeat(64),
    resultDocumentSha256: 'b'.repeat(64),
    signers: [
      {
        submitterId: 'sub-1',
        name: 'Ada',
        email: 'ada@test.local',
        completedAt: '2026-07-20T11:00:00Z',
        completionMethod: 'interactive' as const,
        emailVerified: true,
        ipAddress: '203.0.113.7',
        sessionId: 'sess-1',
        userAgent: 'Mozilla/5.0',
        timezone: 'America/New_York',
      },
      {
        submitterId: 'sub-2',
        name: 'Nikola',
        email: 'nikola@test.local',
        completedAt: '2026-07-20T11:30:00Z',
        completionMethod: 'api' as const,
        emailVerified: false,
        ipAddress: null,
        sessionId: null,
        userAgent: null,
        timezone: null,
      },
    ],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.DOCUSEAL_WEBHOOK_SECRET = WEBHOOK_SECRET
  mockFetchCompletionArtifacts.mockResolvedValue(artifacts())
  mockRenderCompletionCertificate.mockResolvedValue(Buffer.from([7, 8, 9]))
  mockCreateNotification.mockResolvedValue({ ok: true })
})

// ─── Signature gate (T-17-20) ─────────────────────────────────────────

describe('POST /api/webhooks/docuseal — signature gate', () => {
  it('rejects a tampered body with a non-2xx and does no work at all', async () => {
    const genuine = JSON.stringify(completionPayload())
    const signature = sign(genuine)
    // Same signature, different body — the forgery a raw-body-first gate
    // is the only defense against.
    const tampered = JSON.stringify({ ...completionPayload(), extra: 'injected' })

    const res = await POST(request(tampered, signature))

    expect(res.status).toBeGreaterThanOrEqual(400)
    // The strongest possible assertion of "zero side effects": the service
    // client was never even constructed.
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
    expect(mockFetchCompletionArtifacts).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('rejects a stale timestamp outside the 5-minute window', async () => {
    const body = JSON.stringify(completionPayload())
    const stale = Math.floor(Date.now() / 1000) - 6 * 60

    const res = await POST(request(body, sign(body, WEBHOOK_SECRET, stale)))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a signature computed with the wrong secret', async () => {
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body, 'whsec_wrong_secret')))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a missing signature header', async () => {
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, null))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('refuses to process anything when the secret is not configured', async () => {
    delete process.env.DOCUSEAL_WEBHOOK_SECRET
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })
})

// ─── Event routing ────────────────────────────────────────────────────

describe('POST /api/webhooks/docuseal — event routing', () => {
  it('acknowledges a non-completion event without writing', async () => {
    const body = JSON.stringify({ event_type: 'form.viewed', data: { id: SUBMISSION_ID } })

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    expect(mockFetchCompletionArtifacts).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
  })

  it('acknowledges an unknown submission id without retry-storming the provider', async () => {
    const { client } = makeService(null)
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    expect(mockFetchCompletionArtifacts).not.toHaveBeenCalled()
  })
})

// ─── Completion path ──────────────────────────────────────────────────

describe('POST /api/webhooks/docuseal — completion', () => {
  it('re-hosts both documents and marks envelope, signers, and sheet executed', async () => {
    const { client, recorded } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    expect(mockFetchCompletionArtifacts).toHaveBeenCalledWith(SUBMISSION_ID)

    // Both provider documents re-hosted — their URLs expire in ~40 minutes,
    // so a queued download is a lost document (RESEARCH Anti-Patterns).
    const buckets = recorded.uploads.map(u => u.bucket)
    expect(buckets.every(b => b === 'release-documents')).toBe(true)
    expect(recorded.uploads.length).toBeGreaterThanOrEqual(2)
    expect(recorded.uploads.some(u => u.path.includes('executed'))).toBe(true)
    expect(recorded.uploads.some(u => u.path.includes('audit-log'))).toBe(true)

    const envelopeUpdate = recorded.updates.find(u => u.table === 'esign_envelopes')
    expect(envelopeUpdate?.values).toMatchObject({ status: 'completed' })
    expect(envelopeUpdate?.values.completed_at).toEqual(expect.any(String))
    expect(envelopeUpdate?.values.executed_file_path).toEqual(expect.any(String))
    expect(envelopeUpdate?.values.audit_log_path).toEqual(expect.any(String))

    const signerUpdate = recorded.updates.find(u => u.table === 'esign_envelope_signers')
    expect(signerUpdate?.values).toMatchObject({ status: 'completed' })
    expect(signerUpdate?.values.signed_at).toEqual(expect.any(String))

    const sheetUpdate = recorded.updates.find(u => u.table === 'split_sheets')
    expect(sheetUpdate?.values).toMatchObject({ status: 'executed' })
  })

  it('never writes composers[] — the write-back is offered, never silent', async () => {
    const { client, recorded } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    expect(recorded.updates.some(u => u.table === 'tracks')).toBe(false)
    expect(recorded.selectedTables).not.toContain('tracks')
  })
})

// ─── Certificate + cross-account fan-out (Task 2) ─────────────────────

describe('POST /api/webhooks/docuseal — Funūn Certificate of Completion', () => {
  it('renders and files Funūn’s own certificate beside the two provider artifacts', async () => {
    const { client, recorded } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    expect(mockRenderCompletionCertificate).toHaveBeenCalledTimes(1)
    expect(recorded.uploads.some(u => u.path.includes('certificate'))).toBe(true)
    // All three artifacts land in the same locker bucket.
    expect(recorded.uploads).toHaveLength(3)
  })

  it('keeps provenance separated at the type level — never flattened into one bag', async () => {
    const { client } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    const input = mockRenderCompletionCertificate.mock.calls[0][0]
    expect(Object.keys(input).sort()).toEqual(['funuunObserved', 'providerReported'])

    // Funūn-observed facts come from Funūn's own rows.
    expect(input.funuunObserved).toMatchObject({
      songName: 'Test Song',
      splitSheetId: SHEET_ID,
    })
    expect(input.funuunObserved.executedDocumentPath).toEqual(expect.any(String))
    expect(input.funuunObserved.parties).toHaveLength(2)

    // Provider-reported facts come from the provider, attributed to it,
    // and cite the audit log by its STORED location (17-10's one
    // integration invariant: the citation must resolve).
    expect(input.providerReported.providerName).toBe('DocuSeal')
    expect(input.providerReported.submissionId).toBe(SUBMISSION_ID)
    expect(input.providerReported.auditLogPath).toEqual(expect.stringContaining('audit-log'))
    expect(input.providerReported.signers).toHaveLength(2)

    // The honesty constraint, asserted at the boundary this route owns: no
    // provider-captured value may ride in on the Funūn-observed group.
    const observed = JSON.stringify(input.funuunObserved)
    expect(observed).not.toContain('203.0.113.7')
    expect(observed).not.toContain('Mozilla/5.0')
    expect(observed).not.toContain(SUBMISSION_ID)
  })

  it('cites no audit-log path when the provider reported no audit log', async () => {
    mockFetchCompletionArtifacts.mockResolvedValue({ ...artifacts(), auditLog: null })
    const { client, recorded } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    const input = mockRenderCompletionCertificate.mock.calls[0][0]
    expect(input.providerReported.auditLogPath).toBeNull()
    expect(recorded.uploads.some(u => u.path.includes('audit-log'))).toBe(false)
  })
})

describe('POST /api/webhooks/docuseal — cross-account fan-out', () => {
  it('files one locker row per ACCOUNT-HOLDER party, all sharing one stored file', async () => {
    const { client, recorded } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    const insert = recorded.inserts.find(i => i.table === 'vault_documents')
    const rows = insert?.rows as Record<string, unknown>[]
    // party-2 has no Funūn account, so exactly one row.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: 'user-initiator',
      project_id: 'project-1',
      type: 'split_sheet',
      status: 'signed',
    })
    // Evidence guard (migration 045/049): status='signed' requires
    // signed_at AND a file_url.
    expect(rows[0].signed_at).toEqual(expect.any(String))
    expect(rows[0].file_url).toEqual(expect.any(String))
    // The attach affordance's join key back to the sheet (17-05).
    expect((rows[0].document_data as Record<string, unknown>).split_sheet_id).toBe(SHEET_ID)
  })

  it('files nothing when no party holds a Funūn account', async () => {
    const envelope = pendingEnvelope()
    envelope.split_sheets.split_sheet_parties.forEach(p => {
      p.user_id = null
    })
    const { client, recorded } = makeService(envelope)
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    expect(recorded.inserts.find(i => i.table === 'vault_documents')).toBeUndefined()
  })
})

describe('POST /api/webhooks/docuseal — notification + offered write-back', () => {
  it('notifies each account-holder party that the sheet is executed', async () => {
    const { client } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    const args = mockCreateNotification.mock.calls[0][1]
    expect(args).toMatchObject({ userId: 'user-initiator', type: 'split_sheet_executed' })
    expect(args.title).toContain('Test Song')
  })

  it('OFFERS the write-back in the notification rather than applying it', async () => {
    const { client } = makeService(pendingEnvelope())
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    const args = mockCreateNotification.mock.calls[0][1]
    // An offer flag, not a mutation — the diff is computed on demand by
    // GET /api/split-sheets/[id]/reconcile and applied only by an explicit
    // POST confirm (P17-07, ESIGN-12).
    expect(args.data).toMatchObject({ splitSheetId: SHEET_ID, reconcileOffered: true })
  })

  it('offers no reconciliation for a standalone sheet with no project attached', async () => {
    // A standalone sheet (P17-05) — no project, so no composers[] to
    // reconcile against.
    const envelope = pendingEnvelope()
    envelope.split_sheets.vault_project_id = null as unknown as string
    const { client } = makeService(envelope)
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    await POST(request(body, sign(body)))

    const args = mockCreateNotification.mock.calls[0][1]
    expect(args.data.reconcileOffered).toBe(false)
  })
})

// ─── Idempotency (T-17-21) ────────────────────────────────────────────

describe('POST /api/webhooks/docuseal — idempotency', () => {
  it('short-circuits a redelivered completion with 200 and repeats nothing', async () => {
    const already = { ...pendingEnvelope(), status: 'completed' }
    const { client, recorded } = makeService(already)
    mockCreateServiceClient.mockReturnValue(client)
    const body = JSON.stringify(completionPayload())

    const res = await POST(request(body, sign(body)))

    expect(res.status).toBe(200)
    // No download, no re-host, no certificate, no row writes, no notifications.
    expect(mockFetchCompletionArtifacts).not.toHaveBeenCalled()
    expect(mockRenderCompletionCertificate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(recorded.uploads).toHaveLength(0)
    expect(recorded.updates).toHaveLength(0)
    expect(recorded.inserts).toHaveLength(0)
  })
})
