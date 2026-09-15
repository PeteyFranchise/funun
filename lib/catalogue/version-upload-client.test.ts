import { uploadWorkVersion } from './version-upload-client'
import { PEAKS_BAR_COUNT } from './waveform'

const uploadToSignedUrl = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl }),
    },
  }),
}))

function mockIntentThenCompleteFetch(version: unknown) {
  return jest
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            versionId: 'version-1',
            path: 'work-1/version-1.mp3',
            token: 'signed-token',
            contentType: 'audio/mpeg',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: version }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    )
}

describe('uploadWorkVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects an empty capture before requesting an upload token', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch

    await expect(
      uploadWorkVersion({
        workId: 'work-1',
        file: new Blob([], { type: 'audio/webm' }),
        fileName: 'hum.webm',
        source: 'hum',
      })
    ).rejects.toThrow('No audio was captured')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('sends audio bytes directly to signed storage and only JSON control messages through the app', async () => {
    const version = {
      id: 'version-1',
      work_id: 'work-1',
      user_id: 'user-1',
      source: 'upload',
      audio_path: 'work-1/version-1.mp3',
      audio_ext: 'mp3',
      audio_size: 6,
      duration_seconds: null,
      label: null,
      performers: [],
      created_at: '2026-09-01T00:00:00Z',
    }
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              versionId: 'version-1',
              path: 'work-1/version-1.mp3',
              token: 'signed-token',
              contentType: 'audio/mpeg',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: version }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    global.fetch = fetchMock as typeof fetch
    uploadToSignedUrl.mockResolvedValue({ data: { path: version.audio_path }, error: null })

    const file = new Blob(['audio!'], { type: 'audio/mp3' })
    await expect(
      uploadWorkVersion({
        workId: 'work-1',
        file,
        fileName: 'take.mp3',
        source: 'upload',
      })
    ).resolves.toEqual(version)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/works/work-1/versions/upload-intent')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/works/work-1/versions/complete')
    expect(uploadToSignedUrl).toHaveBeenCalledWith(
      version.audio_path,
      'signed-token',
      expect.any(Blob),
      expect.objectContaining({ contentType: 'audio/mpeg' })
    )
    expect(String(fetchMock.mock.calls[0]![1]?.body)).not.toContain('audio!')
    expect(String(fetchMock.mock.calls[1]![1]?.body)).not.toContain('audio!')
  })

  it('forwards a caller-supplied, correctly shaped peaks array verbatim', async () => {
    const version = { id: 'version-1' }
    const fetchMock = mockIntentThenCompleteFetch(version)
    global.fetch = fetchMock as typeof fetch
    uploadToSignedUrl.mockResolvedValue({ data: { path: 'work-1/version-1.mp3' }, error: null })

    const peaks = Array.from({ length: PEAKS_BAR_COUNT }, () => 50)
    await expect(
      uploadWorkVersion({
        workId: 'work-1',
        file: new Blob(['audio!'], { type: 'audio/mp3' }),
        fileName: 'take.mp3',
        source: 'upload',
        peaks,
      })
    ).resolves.toEqual(version)

    const completeBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as { peaks: unknown }
    expect(completeBody.peaks).toEqual(peaks)
  })

  it('drops a caller-supplied peaks array of the wrong length and sends peaks: null', async () => {
    const version = { id: 'version-1' }
    const fetchMock = mockIntentThenCompleteFetch(version)
    global.fetch = fetchMock as typeof fetch
    uploadToSignedUrl.mockResolvedValue({ data: { path: 'work-1/version-1.mp3' }, error: null })

    const wrongLength = Array.from({ length: PEAKS_BAR_COUNT - 1 }, () => 50)
    await expect(
      uploadWorkVersion({
        workId: 'work-1',
        file: new Blob(['audio!'], { type: 'audio/mp3' }),
        fileName: 'take.mp3',
        source: 'upload',
        peaks: wrongLength,
      })
    ).resolves.toEqual(version)

    const completeBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as { peaks: unknown }
    expect(completeBody.peaks).toBeNull()
  })

  it('resolves (never rejects) and sends peaks: null when no array is supplied and decode throws', async () => {
    const version = { id: 'version-1' }
    const fetchMock = mockIntentThenCompleteFetch(version)
    global.fetch = fetchMock as typeof fetch
    uploadToSignedUrl.mockResolvedValue({ data: { path: 'work-1/version-1.mp3' }, error: null })

    // No AudioContext exists in this Jest (node) environment, so
    // extractPeaksFromBlob throws — this is the fallback path under test.
    await expect(
      uploadWorkVersion({
        workId: 'work-1',
        file: new Blob(['audio!'], { type: 'audio/mp3' }),
        fileName: 'take.mp3',
        source: 'upload',
      })
    ).resolves.toEqual(version)

    const completeBody = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)) as { peaks: unknown }
    expect(completeBody.peaks).toBeNull()
  })
})
