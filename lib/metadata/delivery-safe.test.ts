import {
  buildDeliveryArtifactPath,
  buildDeliveryDocuments,
  canonicalJson,
  sha256Blob,
  sha256Bytes,
  sha256Text,
} from '@/lib/metadata/delivery-safe'

describe('delivery-safe metadata artifacts', () => {
  it('canonicalizes nested objects before hashing', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, omitted: undefined })).toBe(
      '{"a":{"x":3,"y":2},"z":1}'
    )
    expect(sha256Text(canonicalJson({ b: 2, a: 1 }))).toBe(
      sha256Text(canonicalJson({ a: 1, b: 2 }))
    )
  })

  it('hashes byte arrays and streamed blobs identically', async () => {
    const bytes = new TextEncoder().encode('source audio bytes')
    await expect(sha256Blob(new Blob([bytes]))).resolves.toBe(sha256Bytes(bytes))
  })

  it('uses a unique delivery path outside the source object', () => {
    expect(buildDeliveryArtifactPath('owner/project/My Song.mp3', 'delivery-1', 'tagged_mp3')).toBe(
      'owner/project/deliveries/My-Song/delivery-1.tagged.mp3'
    )
    expect(buildDeliveryArtifactPath('owner/project/My Song.wav', 'delivery-2', 'metadata_sidecar')).toBe(
      'owner/project/deliveries/My-Song/delivery-2.metadata.txt'
    )
  })

  it('freezes source, artifact and metadata evidence without claiming recipient delivery', () => {
    const { manifest, receipt } = buildDeliveryDocuments({
      deliveryId: 'delivery-1',
      createdAt: '2026-09-01T12:00:00.000Z',
      kind: 'tagged_mp3',
      projectId: 'project-1',
      trackId: 'track-1',
      actorUserId: 'user-1',
      source: { bucket: 'track-audio', path: 'source.mp3', sha256: 'source-hash' },
      artifact: {
        bucket: 'track-audio',
        path: 'delivery.mp3',
        filename: 'song.tagged.mp3',
        mime_type: 'audio/mpeg',
        size_bytes: 100,
        sha256: 'artifact-hash',
      },
      metadataSnapshot: { title: 'Song', artist: 'Artist' },
    })

    expect(manifest.source.unchanged).toBe(true)
    expect(manifest.metadata_sha256).toBe(
      sha256Text(canonicalJson({ title: 'Song', artist: 'Artist' }))
    )
    expect(receipt.artifact_sha256).toBe('artifact-hash')
    expect(receipt.statement).toContain('not confirmation that a recipient received')
  })
})
