import { createHash } from 'crypto'
import {
  BYTE_TIED_QUALITY_REVIEW_ENABLED,
  resolveReviewedObject,
  digestStorageObject,
  recordByteTiedReview,
} from '@/lib/sync-library/crate-byte-tied-review'
import { TRACK_AUDIO_BUCKET } from '@/lib/vault/track-audio'

// Phase 50.5B. There is no Postgres and no jsdom here, so these exercise the
// pure resolution logic, the digest against real bytes, and the RPC call shape.
// What they cannot prove is that the row lands or that the append-only trigger
// rejects an update; those need a database and are named in the plan as such.

describe('resolveReviewedObject', () => {
  it('reads the stored value as a PATH in the track-audio bucket, not a URL', () => {
    const o = resolveReviewedObject('user-1/project-1/track-1.master.abc.wav')
    expect(o).toEqual({
      bucket: TRACK_AUDIO_BUCKET,
      path: 'user-1/project-1/track-1.master.abc.wav',
      mimeType: 'audio/wav',
    })
  })

  it('derives the type from the uploader’s own map rather than a restated list', () => {
    expect(resolveReviewedObject('a/b/c.flac')?.mimeType).toBe('audio/flac')
    expect(resolveReviewedObject('a/b/c.webm')?.mimeType).toBe('audio/webm')
  })

  it('refuses an extension the uploader never accepts, rather than guessing', () => {
    expect(resolveReviewedObject('a/b/c.aiff')).toBeNull()
    expect(resolveReviewedObject('a/b/c.exe')).toBeNull()
  })

  it('treats missing audio as a refusal, not an error: there is nothing to review', () => {
    expect(resolveReviewedObject(null)).toBeNull()
    expect(resolveReviewedObject(undefined)).toBeNull()
    expect(resolveReviewedObject('   ')).toBeNull()
    expect(resolveReviewedObject('no-extension')).toBeNull()
  })
})

describe('digestStorageObject', () => {
  const object = { bucket: TRACK_AUDIO_BUCKET, path: 'a/b/c.wav', mimeType: 'audio/wav' }
  const client = (download: unknown) =>
    ({ storage: { from: () => ({ download: async () => download }) } }) as never

  it('hashes the bytes READ BACK, so the digest describes the object as it exists', async () => {
    const bytes = Buffer.from('the exact reviewed audio')
    const blob = { arrayBuffer: async () => bytes }
    const out = await digestStorageObject(client({ data: blob, error: null }), object)
    expect(out).not.toBeNull()
    expect(out!.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(out!.sizeBytes).toBe(bytes.byteLength)
  })

  it('a different byte produces a different digest, which is the whole point', async () => {
    const one = await digestStorageObject(
      client({ data: { arrayBuffer: async () => Buffer.from('mix A') }, error: null }), object)
    const two = await digestStorageObject(
      client({ data: { arrayBuffer: async () => Buffer.from('mix B') }, error: null }), object)
    expect(one!.sha256).not.toBe(two!.sha256)
  })

  it('returns null on a download error rather than hashing nothing', async () => {
    expect(await digestStorageObject(client({ data: null, error: { message: 'gone' } }), object)).toBeNull()
  })

  it('refuses an empty object: a zero-byte file is not a reviewed recording', async () => {
    const blob = { arrayBuffer: async () => Buffer.alloc(0) }
    expect(await digestStorageObject(client({ data: blob, error: null }), object)).toBeNull()
  })
})

describe('recordByteTiedReview', () => {
  const review = {
    sha256: 'a'.repeat(64), sizeBytes: 123, mimeType: 'audio/wav',
    bucket: TRACK_AUDIO_BUCKET, path: 'a/b/c.wav',
  }

  it('writes through the narrow definer function, never a direct insert', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'review-1', error: null })
    const from = jest.fn()
    const out = await recordByteTiedReview({ rpc, from } as never, {
      listingId: 'listing-1', reviewerId: 'staff-1', verdict: 'passed', notes: null, review,
    })
    expect(out).toEqual({ ok: true, reviewId: 'review-1' })
    // 248 revokes direct write from service_role, so a .from().insert() here
    // would fail in production even though it passes a mocked test.
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('crate_record_quality_review', expect.objectContaining({
      p_listing_id: 'listing-1',
      p_reviewer_id: 'staff-1',
      p_sha256: review.sha256,
      p_size_bytes: 123,
      p_verdict: 'passed',
    }))
  })

  it('reports failure rather than pretending a review was recorded', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'denied' } })
    expect(await recordByteTiedReview({ rpc, from: jest.fn() } as never, {
      listingId: 'l', reviewerId: 'r', verdict: 'failed', notes: null, review,
    })).toEqual({ ok: false })
  })
})

describe('the slice ships dark', () => {
  it('is disabled until migrations 248 and 251 are applied', () => {
    expect(BYTE_TIED_QUALITY_REVIEW_ENABLED).toBe(false)
  })
})
