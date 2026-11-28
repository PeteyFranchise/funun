import { createHash } from 'crypto'
import {
  CRATE_CAPTURE_ENABLED,
  CRATE_AUDIO_BUCKET,
  captureObjectPath,
  captureAdmittedSong,
} from '@/lib/sync-library/crate-capture'

// Phase 50.5B capture. No Postgres here, so the RPC is a mock and its internal
// re-check cannot be exercised; what these prove is the saga's own ordering and
// refusals. The authority on digest mismatch is the function in migration 252,
// which checks it again — this layer failing early is a convenience, not the
// guarantee.

const SOURCE = Buffer.from('the reviewed master')
const SOURCE_SHA = createHash('sha256').update(SOURCE).digest('hex')

function client(opts: {
  review?: { id: string; sha256: string; verdict: string } | null
  copyBytes?: Buffer
  uploadError?: boolean
  readbackError?: boolean
  rpc?: jest.Mock
}) {
  const uploaded: Buffer[] = []
  const rpc = opts.rpc ?? jest.fn().mockResolvedValue({
    data: { outcome: 'created', crate_song_id: 'song-1', artifact_path: 'captured/listing-1/x.review_playback.wav' },
    error: null,
  })
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: opts.review ?? null }) }),
          }),
        }),
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        download: async (_p: string) => {
          if (bucket === CRATE_AUDIO_BUCKET) {
            if (opts.readbackError) return { data: null, error: { message: 'gone' } }
            return { data: { arrayBuffer: async () => (opts.copyBytes ?? SOURCE) }, error: null }
          }
          return { data: { arrayBuffer: async () => SOURCE }, error: null }
        },
        upload: async (_p: string, body: Buffer) => {
          if (opts.uploadError) return { error: { message: 'no' } }
          uploaded.push(body)
          return { error: null }
        },
      }),
    },
    rpc,
  }
  return { service: service as never, rpc, uploaded }
}

const input = {
  listingId: 'listing-1',
  sourceAudioPath: 'u/p/t.wav',
  title: 'Midnight Run',
  primaryArtistName: 'Someone',
  payeeUserId: 'artist-1',
  capturedBy: 'staff-1',
  sourceTrackId: 'track-1',
  sourceProjectId: 'project-1',
}

describe('captureAdmittedSong', () => {
  it('captures a clean admission and names the review_playback object', async () => {
    const { service, rpc } = client({ review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' } })
    const out = await captureAdmittedSong(service, input)
    expect(out.ok).toBe(true)
    expect((out as { outcome: string }).outcome).toBe('created')
    // The path is per ATTEMPT, so assert its shape rather than a fixed string.
    // The authoritative path now comes from the database, not from the caller.
    expect((out as { artifactPath: string }).artifactPath).toBe('captured/listing-1/x.review_playback.wav')
    expect(rpc).toHaveBeenCalledWith('crate_capture_admitted_song', expect.objectContaining({
      p_listing_id: 'listing-1',
      p_bucket: CRATE_AUDIO_BUCKET,
      p_sha256: SOURCE_SHA,
      p_captured_by: 'staff-1',
    }))
    // M4: identity is derived in the database, never sent by the caller.
    const sent = rpc.mock.calls[0][1] as Record<string, unknown>
    for (const forbidden of ['p_source_track_id', 'p_source_project_id', 'p_payee_user_id',
                             'p_title', 'p_primary_artist_name', 'p_quality_review_id']) {
      expect(sent).not.toHaveProperty(forbidden)
    }
  })

  it('REFUSES when the audio changed between review and admission', async () => {
    // The artist swapped the file: the review holds a digest of other bytes.
    const { service, rpc } = client({ review: { id: 'rev-1', sha256: 'b'.repeat(64), verdict: 'passed' } })
    const out = await captureAdmittedSong(service, input)
    expect(out).toMatchObject({ ok: false, reason: 'digest_mismatch' })
    expect((out as { orphanPath: string }).orphanPath).toMatch(/^captured\/listing-1\//)
    // nothing is committed
    expect(rpc).not.toHaveBeenCalled()
  })

  it('hashes the COPY, not the source, so a partial copy cannot pass', async () => {
    const { service, rpc } = client({
      review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' },
      copyBytes: Buffer.from('the reviewed mast'), // truncated in transit
    })
    const out = await captureAdmittedSong(service, input)
    expect(out.ok).toBe(false)
    expect((out as { reason: string }).reason).toBe('digest_mismatch')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses without a passing review rather than capturing on a failed one', async () => {
    const { service, rpc } = client({ review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'failed' } })
    expect(await captureAdmittedSong(service, input)).toEqual({ ok: false, reason: 'no_passing_review' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses when there is no review at all', async () => {
    const { service } = client({ review: null })
    expect(await captureAdmittedSong(service, input)).toEqual({ ok: false, reason: 'no_passing_review' })
  })

  it('refuses a song with no reviewable audio', async () => {
    const { service } = client({ review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' } })
    expect(await captureAdmittedSong(service, { ...input, sourceAudioPath: null }))
      .toEqual({ ok: false, reason: 'no_reviewable_audio' })
  })

  it('reports the orphan path when the copy lands but the readback fails', async () => {
    const { service } = client({
      review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' }, readbackError: true,
    })
    expect(await captureAdmittedSong(service, input)).toMatchObject({
      ok: false, reason: 'readback_failed',
    })
  })

  it('reports no orphan when the copy itself never landed', async () => {
    const { service } = client({
      review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' }, uploadError: true,
    })
    expect(await captureAdmittedSong(service, input)).toEqual({ ok: false, reason: 'copy_failed' })
  })

  it('reports commit_failed with an orphan when the writer refuses', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'refused', code: '23514' } })
    const { service } = client({ review: { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' }, rpc })
    expect(await captureAdmittedSong(service, input)).toMatchObject({
      ok: false, reason: 'commit_failed',
    })
  })
})

describe('captureObjectPath', () => {
  it('is per ATTEMPT, so a concurrent loser can never clean up the winner’s object', () => {
    expect(captureObjectPath('l-1', 'flac', 'attempt-a')).toBe('captured/l-1/attempt-a.review_playback.flac')
    expect(captureObjectPath('l-1', 'flac', 'attempt-a'))
      .not.toBe(captureObjectPath('l-1', 'flac', 'attempt-b'))
  })

  it('stays inside the listing prefix the database enforces', () => {
    expect(captureObjectPath('l-1', 'wav', 'x')).toMatch(/^captured\/l-1\//)
  })
})

describe('the slice ships dark', () => {
  it('capture is disabled until 248, 251 and 252 are applied', () => {
    expect(CRATE_CAPTURE_ENABLED).toBe(false)
  })
})

describe('M3 — ambiguity is never treated as failure', () => {
  const review = { id: 'rev-1', sha256: SOURCE_SHA, verdict: 'passed' }

  it('a lost response does NOT mark the object an orphan', async () => {
    // The transaction may have committed. Queuing this path would hand a live
    // object to the sweeper, which is what the first version did.
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'socket hang up' } })
    const { service } = client({ review, rpc })
    const out = await captureAdmittedSong(service, input)
    expect(out).toEqual({ ok: false, reason: 'commit_ambiguous' })
    expect(out).not.toHaveProperty('orphanPath')
  })

  it('a connection-class SQLSTATE is also ambiguous', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'gone', code: '08006' } })
    const { service } = client({ review, rpc })
    expect(await captureAdmittedSong(service, input)).toEqual({ ok: false, reason: 'commit_ambiguous' })
  })

  it('a definitive duplicate is a conflict a retry cannot cure', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'dupe', code: '23505' } })
    const { service } = client({ review, rpc })
    expect(await captureAdmittedSong(service, input)).toMatchObject({
      ok: false, reason: 'already_captured_different_bytes',
    })
  })

  it('an unrecognised response shape is ambiguous, not success', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'song-1', error: null })
    const { service } = client({ review, rpc })
    expect(await captureAdmittedSong(service, input)).toEqual({ ok: false, reason: 'commit_ambiguous' })
  })

  it('a replay reports the EXISTING path and flags our upload as stray', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: { outcome: 'replayed', crate_song_id: 'song-A', artifact_path: 'captured/listing-1/A.review_playback.wav' },
      error: null,
    })
    const { service } = client({ review, rpc })
    const out = await captureAdmittedSong(service, input)
    expect(out).toMatchObject({ ok: true, outcome: 'replayed', artifactPath: 'captured/listing-1/A.review_playback.wav' })
    // our own upload is unreferenced and must be cleaned up, not leaked
    expect((out as { strayPath?: string }).strayPath).toMatch(/^captured\/listing-1\//)
  })
})
