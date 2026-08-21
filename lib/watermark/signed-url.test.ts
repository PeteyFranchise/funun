import { getPreviewSignedUrl } from '@/lib/watermark/signed-url'
import { createServiceClient } from '@/lib/supabase/server'
import * as streamPreview from '@/lib/watermark/stream-preview'
import * as previewQueue from '@/lib/watermark/preview-queue'

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/watermark/stream-preview', () => ({
  PREVIEWS_BUCKET: 'selects-stream-previews',
  findExistingPreview: jest.fn(),
}))

jest.mock('@/lib/watermark/preview-queue', () => ({
  queuePreviewRender: jest.fn(),
}))

// The master bucket name this accessor must NEVER resolve or sign against
// (T-31-27, R12). Kept as a literal here (not imported from stream-preview,
// which is mocked out above) so the assertion is independent of that
// module's internals — it is checking signed-url.ts's own output/behavior.
const MASTER_BUCKET = 'track-audio'

function buildStorageClient(signedUrl: string | null) {
  const bucketCalls: string[] = []
  const from = jest.fn((bucket: string) => {
    bucketCalls.push(bucket)
    return {
      createSignedUrl: jest.fn(async () => ({
        data: signedUrl ? { signedUrl } : null,
        error: signedUrl ? null : new Error('not found'),
      })),
    }
  })
  return { client: { storage: { from } }, bucketCalls }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getPreviewSignedUrl — never-master guarantee (T-31-27)', () => {
  it('returns a signed URL resolved against the PREVIEWS bucket, never the master bucket', async () => {
    ;(streamPreview.findExistingPreview as jest.Mock).mockResolvedValue({
      status: 'ready',
      path: 'track-1/preview.wav',
      contentType: 'audio/wav',
      renderedAt: '2026-08-16T00:00:00Z',
    })
    const { client, bucketCalls } = buildStorageClient('https://signed.example/track-1/preview.wav')
    ;(createServiceClient as jest.Mock).mockReturnValue(client)

    const result = await getPreviewSignedUrl('track-1')

    expect(result).toEqual({ status: 'ready', url: 'https://signed.example/track-1/preview.wav' })
    expect(bucketCalls).toEqual([streamPreview.PREVIEWS_BUCKET])
    expect(bucketCalls).not.toContain(MASTER_BUCKET)
  })

  it('never resolves a master-bucket path in its output, even when the preview is ready', async () => {
    ;(streamPreview.findExistingPreview as jest.Mock).mockResolvedValue({
      status: 'ready',
      path: 'track-1/preview.wav',
      contentType: 'audio/wav',
      renderedAt: null,
    })
    const { client } = buildStorageClient('https://signed.example/track-1/preview.wav')
    ;(createServiceClient as jest.Mock).mockReturnValue(client)

    const result = await getPreviewSignedUrl('track-1')
    expect(JSON.stringify(result)).not.toContain(MASTER_BUCKET)
  })

  it('a missing preview yields "processing", never a master-bucket fallback, and does not block on the render', async () => {
    ;(streamPreview.findExistingPreview as jest.Mock).mockResolvedValue(null)
    const { client, bucketCalls } = buildStorageClient(null)
    ;(createServiceClient as jest.Mock).mockReturnValue(client)

    const result = await getPreviewSignedUrl('track-2')

    expect(result).toEqual({ status: 'processing' })
    // the render is queued (idempotent per track), never awaited here
    expect(previewQueue.queuePreviewRender).toHaveBeenCalledWith('track-2')
    // no signed-URL call was ever made, and no bucket (master or otherwise)
    // was touched while resolving 'processing'.
    expect(bucketCalls).toHaveLength(0)
  })

  it('accepts a trackId, not a storage path — no caller can inject a master path through this accessor', async () => {
    ;(streamPreview.findExistingPreview as jest.Mock).mockResolvedValue(null)
    const { client } = buildStorageClient(null)
    ;(createServiceClient as jest.Mock).mockReturnValue(client)

    // getPreviewSignedUrl's signature is (trackId: string) — there is no
    // parameter shape (e.g. a WatermarkRenderInput) through which a master
    // storage path could be threaded into this function at all.
    await getPreviewSignedUrl('some-opaque-track-id')
    expect(streamPreview.findExistingPreview).toHaveBeenCalledWith('some-opaque-track-id')
  })
})
