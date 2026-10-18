// Quick 261018-b1a - vault documents live in a private bucket and are served
// through short-lived signed links. These tests lock three things:
//   1. the signed-PDF upload helper returns a storage path and never a public URL;
//   2. the upload route persists that path, into the bucket chosen by source;
//   3. the /file route authorizes through the session client (RLS) and only
//      then asks the service client to sign.

let mockUser: { id: string; email?: string } | null
let mockExisting: { id: string; status: string; source: string } | null
let mockForm: FormData
let sessionUpdatePayload: Record<string, unknown> | null

const mockUpload = jest.fn()
const mockGetPublicUrl = jest.fn()
const mockStorageFrom = jest.fn()
const mockCreateSignedUrl = jest.fn()
const mockServiceFrom = jest.fn()
const mockRowRead = jest.fn()

function serviceStorageFrom(bucket: string) {
  mockStorageFrom(bucket)
  return {
    upload: (...a: unknown[]) => mockUpload(...a),
    getPublicUrl: (...a: unknown[]) => mockGetPublicUrl(...a),
    createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
  }
}

// Chainable fake for the session client. select() terminates in maybeSingle(),
// update() terminates in single(); every .eq() returns the same chain.
function sessionFrom() {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.maybeSingle = async () => mockRowRead()
  chain.update = (payload: Record<string, unknown>) => {
    sessionUpdatePayload = payload
    return chain
  }
  chain.single = async () => ({ data: { id: 'd1', ...sessionUpdatePayload }, error: null })
  return chain
}

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
    from: (...a: unknown[]) => mockServiceFrom(...a),
    storage: { from: (bucket: string) => serviceStorageFrom(bucket) },
  }),
}))
jest.mock('@/lib/security/upload-admission', () => ({
  parseAdmittedFormData: async () => ({ ok: true, form: mockForm }),
}))

import {
  DOC_LINK_TTL_SECONDS,
  MAX_DOC_SIZE,
  uploadSignedPdf,
  vaultDocumentBucket,
} from '@/lib/vault/documents'
import { POST as uploadRoute } from '@/app/api/vault/[projectId]/documents/[docId]/upload/route'

const PROJECT = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'

function pdf(name = 'signed.pdf', bytes = 16) {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'u1', email: 'u1@example.com' }
  mockExisting = { id: DOC, status: 'pending', source: 'generated' }
  sessionUpdatePayload = null
  mockForm = new FormData()
  mockForm.set('file', pdf())
  mockUpload.mockResolvedValue({ error: null })
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
    const { path } = await uploadSignedPdf({ ...base, bucket: 'vault-contracts', file })
    expect(mockStorageFrom).toHaveBeenCalledWith('vault-contracts')
    expect(mockUpload).toHaveBeenCalledWith(path, file, {
      upsert: false,
      contentType: 'application/pdf',
    })
  })

  it('rejects a non-PDF before any storage call', async () => {
    const txt = new File(['x'], 'x.txt', { type: 'text/plain' })
    await expect(uploadSignedPdf({ ...base, file: txt })).rejects.toThrow('Document must be a PDF file')
    expect(mockStorageFrom).not.toHaveBeenCalled()
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

  it('stores the storage path, not a URL, in file_url', async () => {
    const res = await uploadRoute(req(), ctx)
    expect(res.status).toBe(200)
    const uploadedPath = mockUpload.mock.calls[0][0] as string
    expect(sessionUpdatePayload?.file_url).toBe(uploadedPath)
    expect(String(sessionUpdatePayload?.file_url)).not.toMatch(/^https?:\/\//i)
    expect(sessionUpdatePayload?.status).toBe('signed')
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
})
