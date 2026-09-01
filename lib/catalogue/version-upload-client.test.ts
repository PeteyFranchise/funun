import { uploadWorkVersion } from './version-upload-client'

const uploadToSignedUrl = jest.fn()

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl }),
    },
  }),
}))

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
})
