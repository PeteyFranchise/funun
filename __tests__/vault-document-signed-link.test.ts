// Quick 261018-b1a - vault documents live in a private bucket and are served
// through short-lived signed links. These tests lock:
//   1. the signed-PDF upload helper returns a storage path, never a public URL,
//      and refuses bytes that do not start with the PDF magic;
//   2. the upload route writes through the service client (migration 245 bars
//      clients from writing file_url), into the bucket chosen by source, and
//      cleans up after itself on failure and on replacement;
//   3. the /file route authorizes through the session client (RLS), filters by
//      id AND project_id and never by user_id (co-owners keep access), refuses
//      malformed paths, and only then asks the service client to sign;
//   4. every writer and vaultDocumentBucket agree on which bucket a row uses.

import fs from 'fs'
import path from 'path'

let mockUser: { id: string; email?: string } | null
let mockExisting: { id: string; status: string; source: string; file_url?: string | null } | null
let mockForm: FormData
let serviceUpdatePayload: Record<string, unknown> | null
let serviceUpdateResult: { data: unknown; error: unknown } | null
let sessionEqs: Array<[string, unknown]>
let serviceEqs: Array<[string, unknown]>

const mockUpload = jest.fn()
const mockRemove = jest.fn()
const mockGetPublicUrl = jest.fn()
const mockStorageFrom = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockRowRead = jest.fn()
const mockCaptureException = jest.fn()

function serviceStorageFrom(bucket: string) {
  mockStorageFrom(bucket)
  return {
    upload: (...a: unknown[]) => mockUpload(...a),
    remove: (...a: unknown[]) => mockRemove(...a),
    getPublicUrl: (...a: unknown[]) => mockGetPublicUrl(...a),
    createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
  }
}

// Chainable fake for the session client. It can read (select ... maybeSingle)
// and nothing else: a client write to vault_documents would be rejected by the
// migration 245 trigger, so the fake has no update/insert to call.
function sessionFrom() {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = (col: string, val: unknown) => {
    sessionEqs.push([col, val])
    return chain
  }
  chain.maybeSingle = async () => mockRowRead()
  return chain
}

// Fake for the service client's vault_documents write.
function serviceFrom() {
  const chain: Record<string, unknown> = {}
  chain.update = (payload: Record<string, unknown>) => {
    serviceUpdatePayload = payload
    return chain
  }
  chain.eq = (col: string, val: unknown) => {
    serviceEqs.push([col, val])
    return chain
  }
  chain.select = () => chain
  chain.single = async () =>
    serviceUpdateResult ?? { data: { id: 'd1', ...serviceUpdatePayload }, error: null }
  return chain
}

jest.mock('@sentry/nextjs', () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}))
jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: () => sessionFrom(),
    // The session client must not be used for storage any more.
    storage: {
      from: () => {
        throw new Error('session client storage must not be used')
      },
    },
  }),
  createServiceClient: () => ({
    from: () => serviceFrom(),
    storage: { from: (bucket: string) => serviceStorageFrom(bucket) },
  }),
}))
jest.mock('@/lib/security/upload-admission', () => ({
  parseAdmittedFormData: async () => ({ ok: true, form: mockForm }),
}))

import {
  CONTRACT_BUCKET,
  DOC_BUCKET,
  DOC_LINK_TTL_SECONDS,
  MAX_DOC_SIZE,
  uploadSignedPdf,
  vaultDocumentBucket,
} from '@/lib/vault/documents'
import { POST as uploadRoute } from '@/app/api/vault/[projectId]/documents/[docId]/upload/route'
import { GET as fileRoute } from '@/app/api/vault/[projectId]/documents/[docId]/file/route'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'

function pdf(name = 'signed.pdf', bytes = 16) {
  const body = new Uint8Array(bytes)
  body.set(new TextEncoder().encode('%PDF-'))
  return new File([body], name, { type: 'application/pdf' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'u1', email: 'u1@example.com' }
  mockExisting = { id: DOC, status: 'pending', source: 'generated', file_url: null }
  serviceUpdatePayload = null
  serviceUpdateResult = null
  sessionEqs = []
  serviceEqs = []
  mockForm = new FormData()
  mockForm.set('file', pdf())
  mockUpload.mockResolvedValue({ error: null })
  mockRemove.mockResolvedValue({ error: null })
  mockRowRead.mockImplementation(async () => ({ data: mockExisting, error: null }))
})

describe('vaultDocumentBucket', () => {
  it("maps source 'uploaded' to vault-contracts", () => {
    expect(vaultDocumentBucket('uploaded')).toBe('vault-contracts')
  })

  it.each(['generated', null, undefined, 'anything-else'])(
    'maps %p to release-documents',
    (source) => {
      expect(vaultDocumentBucket(source as string | null | undefined)).toBe('release-documents')
    }
  )

  it('keeps the link lifetime at 10 minutes', () => {
    expect(DOC_LINK_TTL_SECONDS).toBe(600)
  })
})

describe('writers and vaultDocumentBucket agree on the bucket', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

  it('the contract verifier writes source uploaded into the bucket vaultDocumentBucket returns for it', () => {
    const src = read('app/api/contracts/verify/route.ts')
    expect(src).toContain("source: 'uploaded'")
    expect(src).toContain('CONTRACT_BUCKET')
    // No second copy of the bucket name to drift from lib/vault/documents.ts.
    expect(src).not.toContain("'vault-contracts'")
    expect(vaultDocumentBucket('uploaded')).toBe(CONTRACT_BUCKET)
  })

  it('the contract verifier writes the row through the service client', () => {
    // Migration 245 bars session clients from setting file_url on INSERT.
    const src = read('app/api/contracts/verify/route.ts')
    expect(src).toMatch(/createServiceClient\(\)[\s\S]{0,200}\.from\('vault_documents'\)/)
  })

  it('the DocuSeal webhook and split-sheet fan-out write generated rows into DOC_BUCKET', () => {
    const webhook = read('app/api/webhooks/docuseal/route.ts')
    expect(webhook).toContain('.from(DOC_BUCKET)')
    expect(read('lib/split-sheets/distribution.ts')).not.toMatch(/source:\s*'uploaded'/)
    expect(vaultDocumentBucket('generated')).toBe(DOC_BUCKET)
  })

  it('the upload route uploads into vaultDocumentBucket(source), not a literal', () => {
    const src = read('app/api/vault/[projectId]/documents/[docId]/upload/route.ts')
    expect(src).toContain('vaultDocumentBucket(existing.source)')
    expect(src).not.toContain("'vault-contracts'")
    expect(src).not.toContain("'release-documents'")
  })
})

describe('uploadSignedPdf', () => {
  const base = { userId: 'u1', projectId: PROJECT, docId: DOC, bucket: 'release-documents' }

  it('resolves to a path only and never asks for a public URL', async () => {
    const result = await uploadSignedPdf({ ...base, file: pdf() })
    expect(Object.keys(result)).toEqual(['path'])
    expect(result.path.startsWith(`u1/${PROJECT}/${DOC}-`)).toBe(true)
    expect(result.path.endsWith('.pdf')).toBe(true)
    expect(mockGetPublicUrl).not.toHaveBeenCalled()
  })

  it('uploads through the service client into the requested bucket without upsert', async () => {
    const file = pdf()
    const { path: stored } = await uploadSignedPdf({ ...base, bucket: 'vault-contracts', file })
    expect(mockStorageFrom).toHaveBeenCalledWith('vault-contracts')
    expect(mockUpload).toHaveBeenCalledWith(stored, file, {
      upsert: false,
      contentType: 'application/pdf',
    })
  })

  it('rejects a non-PDF MIME type before any storage call', async () => {
    const txt = new File(['x'], 'x.txt', { type: 'text/plain' })
    await expect(uploadSignedPdf({ ...base, file: txt })).rejects.toThrow('Document must be a PDF file')
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })

  it('rejects a file labelled application/pdf whose bytes do not start with %PDF-', async () => {
    const fake = new File(['<html>not a pdf</html>'], 'x.pdf', { type: 'application/pdf' })
    await expect(uploadSignedPdf({ ...base, file: fake })).rejects.toThrow('Document must be a PDF file')
    expect(mockStorageFrom).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects an empty file labelled application/pdf', async () => {
    const empty = new File([], 'x.pdf', { type: 'application/pdf' })
    await expect(uploadSignedPdf({ ...base, file: empty })).rejects.toThrow('Document must be a PDF file')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('rejects an oversized file before any storage call', async () => {
    const big = pdf('big.pdf', MAX_DOC_SIZE + 1)
    await expect(uploadSignedPdf({ ...base, file: big })).rejects.toThrow('Document must be under 5MB')
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })

  it('surfaces a storage error', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'boom' } })
    await expect(uploadSignedPdf({ ...base, file: pdf() })).rejects.toThrow('Upload failed: boom')
  })
})

describe('POST upload route', () => {
  const ctx = { params: Promise.resolve({ projectId: PROJECT, docId: DOC }) }
  const req = () => new Request('http://x/api/upload', { method: 'POST' })

  it('stores the storage path, not a URL, in file_url, written by the service client', async () => {
    const res = await uploadRoute(req(), ctx)
    expect(res.status).toBe(200)
    const uploadedPath = mockUpload.mock.calls[0][0] as string
    expect(serviceUpdatePayload?.file_url).toBe(uploadedPath)
    expect(String(serviceUpdatePayload?.file_url)).not.toMatch(/^https?:\/\//i)
    expect(serviceUpdatePayload?.status).toBe('signed')
  })

  it('scopes the service-client update by id, project_id and the caller user_id', async () => {
    await uploadRoute(req(), ctx)
    expect(serviceEqs).toEqual(
      expect.arrayContaining([
        ['id', DOC],
        ['project_id', PROJECT],
        ['user_id', 'u1'],
      ])
    )
  })

  it('uploads generated documents into release-documents', async () => {
    await uploadRoute(req(), ctx)
    expect(mockStorageFrom).toHaveBeenCalledWith('release-documents')
  })

  it('uploads Contract Locker (uploaded) documents into vault-contracts', async () => {
    mockExisting = { id: DOC, status: 'pending', source: 'uploaded' }
    await uploadRoute(req(), ctx)
    expect(mockStorageFrom).toHaveBeenCalledWith('vault-contracts')
    expect(mockStorageFrom).not.toHaveBeenCalledWith('release-documents')
  })

  it('404s without touching storage when the caller does not own the row', async () => {
    mockExisting = null
    const res = await uploadRoute(req(), ctx)
    expect(res.status).toBe(404)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('400s on a file labelled PDF whose bytes are not, and stores nothing', async () => {
    mockForm = new FormData()
    mockForm.set('file', new File(['GIF89a....'], 'x.pdf', { type: 'application/pdf' }))
    const res = await uploadRoute(req(), ctx)
    expect(res.status).toBe(400)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(serviceUpdatePayload).toBeNull()
  })

  describe('when the database update fails after the object was stored', () => {
    it('removes the new object from the same bucket and returns 500', async () => {
      serviceUpdateResult = { data: null, error: { message: 'db down' } }
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(500)
      const uploadedPath = mockUpload.mock.calls[0][0] as string
      expect(mockRemove).toHaveBeenCalledTimes(1)
      expect(mockRemove).toHaveBeenCalledWith([uploadedPath])
      expect(mockStorageFrom).toHaveBeenLastCalledWith('release-documents')
    })

    it('still returns 500 when the cleanup itself throws', async () => {
      serviceUpdateResult = { data: null, error: { message: 'db down' } }
      mockRemove.mockRejectedValue(new Error('storage down'))
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(500)
    })
  })

  describe('when the row already had a file from an earlier upload', () => {
    const OLD = `u1/${PROJECT}/${DOC}-1700000000000.pdf`

    it('removes the old object after a successful update', async () => {
      mockExisting = { id: DOC, status: 'signed', source: 'generated', file_url: OLD }
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(200)
      expect(mockRemove).toHaveBeenCalledTimes(1)
      expect(mockRemove).toHaveBeenCalledWith([OLD])
    })

    it('removes the old object from the bucket chosen by source', async () => {
      mockExisting = { id: DOC, status: 'signed', source: 'uploaded', file_url: OLD }
      await uploadRoute(req(), ctx)
      expect(mockStorageFrom).toHaveBeenCalledWith('vault-contracts')
      expect(mockStorageFrom).not.toHaveBeenCalledWith('release-documents')
    })

    it('does not remove anything when the update failed (the old file is still the live one)', async () => {
      mockExisting = { id: DOC, status: 'signed', source: 'generated', file_url: OLD }
      serviceUpdateResult = { data: null, error: { message: 'db down' } }
      await uploadRoute(req(), ctx)
      expect(mockRemove).not.toHaveBeenCalledWith([OLD])
    })

    it('still returns 200 and reports to Sentry, without the path, when the old removal returns an error', async () => {
      mockExisting = { id: DOC, status: 'signed', source: 'generated', file_url: OLD }
      mockRemove.mockResolvedValue({ error: { message: `cannot delete ${OLD}` } })
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(200)
      expect(mockCaptureException).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(mockCaptureException.mock.calls[0])).not.toContain(OLD)
    })

    it('still returns 200 and reports to Sentry when the old removal throws', async () => {
      mockExisting = { id: DOC, status: 'signed', source: 'generated', file_url: OLD }
      mockRemove.mockRejectedValue(new Error(`boom ${OLD}`))
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(200)
      expect(mockCaptureException).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(mockCaptureException.mock.calls[0])).not.toContain(OLD)
    })

    it('never removes an object this route did not write for this document', async () => {
      // Split-sheet fan-out rows share ONE executed PDF across every party's
      // row. Replacing one party's file must not delete the shared object.
      mockExisting = {
        id: DOC,
        status: 'signed',
        source: 'generated',
        file_url: 'initiator-1/split-sheets/sheet-1/executed-envelope-1.pdf',
      }
      const res = await uploadRoute(req(), ctx)
      expect(res.status).toBe(200)
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('never removes a legacy http(s) value', async () => {
      mockExisting = {
        id: DOC,
        status: 'signed',
        source: 'generated',
        file_url: `https://x.supabase.co/storage/v1/object/public/release-documents/${OLD}`,
      }
      await uploadRoute(req(), ctx)
      expect(mockRemove).not.toHaveBeenCalled()
    })
  })
})

describe('GET /file route', () => {
  const ctx = (projectId = PROJECT, docId = DOC) => ({ params: Promise.resolve({ projectId, docId }) })
  const req = () => new Request('http://x/api/file')

  beforeEach(() => {
    mockRowRead.mockImplementation(async () => ({
      data: { id: DOC, source: 'generated', file_url: 'u1/p/d-1.pdf' },
      error: null,
    }))
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/doc' }, error: null })
  })

  it('400s when a param is not a UUID', async () => {
    expect((await fileRoute(req(), ctx('nope', DOC))).status).toBe(400)
    expect((await fileRoute(req(), ctx(PROJECT, 'nope'))).status).toBe(400)
  })

  it('401s without a session', async () => {
    mockUser = null
    expect((await fileRoute(req(), ctx())).status).toBe(401)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('reads the row by id AND project_id, and never filters by user_id', async () => {
    await fileRoute(req(), ctx())
    expect(sessionEqs).toEqual(
      expect.arrayContaining([
        ['id', DOC],
        ['project_id', PROJECT],
      ])
    )
    // RLS decides who may see the row. A user_id filter would lock out
    // co-owners, who legitimately open documents another member created.
    expect(sessionEqs.map(([col]) => col)).not.toContain('user_id')
  })

  it('404s when RLS hides the row, and never signs', async () => {
    mockRowRead.mockImplementation(async () => ({ data: null, error: null }))
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('404s when the row query errors', async () => {
    mockRowRead.mockImplementation(async () => ({ data: null, error: { message: 'x' } }))
    expect((await fileRoute(req(), ctx())).status).toBe(404)
  })

  it.each([null, ''])('404s when file_url is %p', async (file_url) => {
    mockRowRead.mockImplementation(async () => ({ data: { id: DOC, source: 'generated', file_url }, error: null }))
    expect((await fileRoute(req(), ctx())).status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('404s on a legacy http(s) URL instead of redirecting to it', async () => {
    mockRowRead.mockImplementation(async () => ({
      data: { id: DOC, source: 'generated', file_url: 'https://evil.example/x.pdf' },
      error: null,
    }))
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it.each([
    ['a leading slash', '/u1/p/d.pdf'],
    ['a parent segment', 'u1/../u2/d.pdf'],
    ['a bare parent segment', '..'],
    ['a backslash', 'u1\\p\\d.pdf'],
    ['an empty segment', 'u1//d.pdf'],
    ['a trailing slash', 'u1/p/'],
  ])('404s on a path with %s, without signing', async (_label, file_url) => {
    mockRowRead.mockImplementation(async () => ({ data: { id: DOC, source: 'generated', file_url }, error: null }))
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('302s to a 600 second signed URL on release-documents for generated rows', async () => {
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://signed/doc')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mockStorageFrom).toHaveBeenCalledWith('release-documents')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/p/d-1.pdf', 600)
  })

  it('signs on vault-contracts for uploaded rows', async () => {
    mockRowRead.mockImplementation(async () => ({
      data: { id: DOC, source: 'uploaded', file_url: 'u1/contract.pdf' },
      error: null,
    }))
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(302)
    expect(mockStorageFrom).toHaveBeenCalledWith('vault-contracts')
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/contract.pdf', 600)
  })

  it.each([
    ['a 404 status', { message: 'The resource was not found', status: 404 }],
    ['a statusCode of "404"', { message: 'Object not found', statusCode: '404' }],
    ['an "Object not found" message', { message: 'Object not found' }],
  ])('404s, not 500, when the object is missing (%s)', async (_label, error) => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error })
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(404)
  })

  it('500s with a generic message when signing fails for another reason', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'secret detail', status: 500 } })
    const res = await fileRoute(req(), ctx())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })

  it('500s when signing returns no data', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: null })
    expect((await fileRoute(req(), ctx())).status).toBe(500)
  })
})
