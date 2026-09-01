let mockUser: { id: string } | null
let apiRows: Record<string, unknown>
let ledgerRow: { manifest: unknown; receipt: unknown } | null

const mockDownload = jest.fn()
const mockUpload = jest.fn()
const mockSignedUrl = jest.fn()
const mockRemove = jest.fn()
const mockInsert = jest.fn()
const mockNodeId3Write = jest.fn()

function queryFor(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  }
  return query
}

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => queryFor(apiRows[table] ?? null),
  }),
  createServiceClient: () => ({
    storage: {
      from: () => ({
        download: (...args: unknown[]) => mockDownload(...args),
        upload: (...args: unknown[]) => mockUpload(...args),
        createSignedUrl: (...args: unknown[]) => mockSignedUrl(...args),
        remove: (...args: unknown[]) => mockRemove(...args),
      }),
    },
    from: () => ({
      insert: (...args: unknown[]) => mockInsert(...args),
      ...queryFor(ledgerRow),
    }),
  }),
}))

jest.mock('@/lib/metadata/bundle', () => ({
  buildBundle: () => ({ tracks: [{ title: 'Safe Song' }] }),
}))

const id3Fields = {
  title: 'Safe Song',
  artist: 'Artist',
  albumArtist: 'Artist',
  album: 'Release',
  composer: '',
  trackNumber: '1',
  year: '2026',
  genre: 'Pop',
  copyright: '',
  publisher: '',
  language: 'en',
  bpm: '120',
  isrc: '',
  iswc: '',
  upc: '',
  comment: '',
  lyrics: '',
  lyricsLanguage: 'eng',
}

jest.mock('@/lib/metadata/export', () => ({
  buildId3Fields: () => id3Fields,
  buildSidecar: () => 'sidecar',
}))

jest.mock('node-id3', () => ({
  __esModule: true,
  default: { write: (...args: unknown[]) => mockNodeId3Write(...args) },
}))

import { POST as embed } from '@/app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route'
import { POST as sidecar } from '@/app/api/vault/[projectId]/tracks/[trackId]/metadata/sidecar/route'
import { GET as evidence } from '@/app/api/vault/[projectId]/tracks/[trackId]/metadata/deliveries/[deliveryId]/[document]/route'

const context = {
  params: Promise.resolve({ projectId: 'project-1', trackId: 'track-1' }),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'user-1' }
  apiRows = {
    vault_projects: { title: 'Release' },
    tracks: { id: 'track-1', audio_file_url: 'user/project/source.mp3' },
    user_profiles: { artist_name: 'Artist' },
  }
  ledgerRow = { manifest: { delivery_id: 'delivery-1' }, receipt: { receipt_id: 'delivery-1' } }
  mockDownload.mockResolvedValue({ data: new Blob(['source-audio']), error: null })
  mockNodeId3Write.mockReturnValue(Buffer.from('tagged-audio'))
  mockUpload.mockResolvedValue({ error: null })
  mockSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/artifact' }, error: null })
  mockRemove.mockResolvedValue({ error: null })
  mockInsert.mockResolvedValue({ error: null })
})

describe('tagged MP3 delivery generation', () => {
  it('requires authentication before reading or writing files', async () => {
    mockUser = null
    expect((await embed(new Request('https://funun.test'), context)).status).toBe(401)
    expect(mockDownload).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('writes a unique non-upserting artifact and freezes its evidence', async () => {
    const response = await embed(new Request('https://funun.test'), context)
    expect(response.status).toBe(200)
    const body = await response.json()

    const [artifactPath, artifactBytes, uploadOptions] = mockUpload.mock.calls[0]
    expect(artifactPath).toMatch(
      /^user\/project\/deliveries\/source\/[0-9a-f-]+\.tagged\.mp3$/
    )
    expect(artifactPath).not.toBe('user/project/source.mp3')
    expect(Buffer.from(artifactBytes).toString()).toBe('tagged-audio')
    expect(uploadOptions).toEqual(expect.objectContaining({ upsert: false }))

    const ledger = mockInsert.mock.calls[0][0]
    expect(ledger.source_path).toBe('user/project/source.mp3')
    expect(ledger.source_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(ledger.artifact_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(ledger.manifest.source.unchanged).toBe(true)
    expect(ledger.receipt.statement).toContain('not confirmation that a recipient received')
    expect(body.data.manifestUrl).toContain('/manifest')
    expect(body.data.receiptUrl).toContain('/receipt')
  })

  it('removes only the generated artifact when evidence persistence fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'ledger unavailable' } })
    const response = await embed(new Request('https://funun.test'), context)
    expect(response.status).toBe(502)
    const generatedPath = mockUpload.mock.calls[0][0]
    expect(mockRemove).toHaveBeenCalledWith([generatedPath])
    expect(generatedPath).not.toBe('user/project/source.mp3')
  })
})

describe('delivery evidence downloads', () => {
  const evidenceContext = (document: string) => ({
    params: Promise.resolve({
      projectId: 'project-1',
      trackId: 'track-1',
      deliveryId: 'delivery-1',
      document,
    }),
  })

  it('rejects unknown document types', async () => {
    expect(
      (await evidence(new Request('https://funun.test'), evidenceContext('source'))).status
    ).toBe(404)
  })

  it('returns owner-scoped evidence as a private attachment', async () => {
    const response = await evidence(
      new Request('https://funun.test'),
      evidenceContext('manifest')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('delivery-1.manifest.json')
    await expect(response.json()).resolves.toEqual({ delivery_id: 'delivery-1' })
  })
})

describe('sidecar delivery generation', () => {
  it('stores a separately hashed sidecar without writing to the source path', async () => {
    const response = await sidecar(new Request('https://funun.test'), context)
    expect(response.status).toBe(200)

    const [artifactPath, artifactBytes, uploadOptions] = mockUpload.mock.calls[0]
    expect(artifactPath).toMatch(
      /^user\/project\/deliveries\/source\/[0-9a-f-]+\.metadata\.txt$/
    )
    expect(artifactPath).not.toBe('user/project/source.mp3')
    expect(Buffer.from(artifactBytes).toString()).toBe('sidecar')
    expect(uploadOptions).toEqual(expect.objectContaining({ upsert: false }))

    const ledger = mockInsert.mock.calls[0][0]
    expect(ledger.kind).toBe('metadata_sidecar')
    expect(ledger.source_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(ledger.artifact_sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(ledger.manifest.kind).toBe('metadata_sidecar')
  })
})
