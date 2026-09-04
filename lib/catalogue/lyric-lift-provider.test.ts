import { LYRIC_LIFT_NO_VOCALS_MESSAGE } from '@/lib/catalogue/lyric-lift'
import { transcribeLyricLiftAudio } from '@/lib/catalogue/lyric-lift-provider'

const originalFetch = global.fetch
const originalApiKey = process.env.OPENAI_API_KEY

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  global.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalApiKey
})

describe('transcribeLyricLiftAudio vocal detection', () => {
  it('maps corroborated no-speech evidence to the durable no-vocals outcome', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ text: 'Thank you' }))
      .mockResolvedValueOnce(jsonResponse({
        duration: 180,
        text: 'Thank you',
        segments: [{
          start: 0,
          end: 2,
          text: 'Thank you',
          avg_logprob: -2,
          no_speech_prob: 0.97,
        }],
      }))
    global.fetch = fetchMock as typeof fetch

    await expect(transcribeLyricLiftAudio({
      audio: new Blob(['instrumental']),
      extension: 'mp3',
      knownDurationSeconds: 180,
    })).rejects.toThrow(LYRIC_LIFT_NO_VOCALS_MESSAGE)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps a short supported vocal and strips private no-speech evidence from the result', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ text: 'Oh yeah', language: 'en' }))
      .mockResolvedValueOnce(jsonResponse({
        duration: 2,
        text: 'Oh yeah',
        segments: [{
          start: 0,
          end: 2,
          text: 'Oh yeah',
          avg_logprob: -0.1,
          no_speech_prob: 0.04,
        }],
      }))
    global.fetch = fetchMock as typeof fetch

    await expect(transcribeLyricLiftAudio({
      audio: new Blob(['vocal']),
      extension: 'mp3',
      knownDurationSeconds: 2,
    })).resolves.toEqual(expect.objectContaining({
      transcript: 'Oh yeah',
      language: 'en',
      timedSegments: [{
        startMs: 0,
        endMs: 2000,
        text: 'Oh yeah',
        confidence: expect.any(Number),
      }],
    }))
  })
})
