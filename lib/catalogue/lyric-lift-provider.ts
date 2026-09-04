import {
  normalizeStructuredLyricSections,
  type LyricLiftTimedSegment,
  type StructuredLyricSection,
} from '@/lib/catalogue/lyric-lift'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe'
const ALIGNMENT_MODEL = process.env.OPENAI_LYRIC_ALIGNMENT_MODEL || 'whisper-1'
const STRUCTURE_MODEL = process.env.OPENAI_LYRIC_STRUCTURE_MODEL || 'gpt-5.6-sol'
const TRANSCRIPTION_TIMEOUT_MS = 3 * 60 * 1000
const STRUCTURE_TIMEOUT_MS = 60 * 1000

type OpenAiErrorBody = { error?: { message?: unknown } }

type TranscriptionResult = {
  transcript: string
  language: string | null
  timedSegments: LyricLiftTimedSegment[]
  durationMs: number
  transcriptionModel: string
  alignmentModel: string
}

export type LyricLiftProviderResult = TranscriptionResult & {
  sections: StructuredLyricSection[]
  structureModel: string
  usedStructureFallback: boolean
}

function requestSignal(timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { signal: controller.signal, dispose: () => clearTimeout(timer) }
}

async function providerError(response: Response, operation: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as OpenAiErrorBody | null
  const detail = typeof body?.error?.message === 'string' ? body.error.message.trim() : ''
  const requestId = response.headers.get('x-request-id')
  const suffix = requestId ? ` (request ${requestId})` : ''
  if (response.status === 413) {
    return new Error('This recording is too large for lyric transcription. Try an MP3 or M4A under 25 MB.')
  }
  if (response.status === 401 || response.status === 403) {
    return new Error('Lyric transcription is not configured yet. Add a valid OPENAI_API_KEY.')
  }
  if (response.status === 429) {
    return new Error(`Lyric transcription is busy right now. Funūn will retry automatically.${suffix}`)
  }
  return new Error(`${operation} failed${detail ? `: ${detail}` : ''}${suffix}`)
}

async function postForm(path: string, form: FormData): Promise<Record<string, unknown>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Lyric transcription is not configured yet. Add OPENAI_API_KEY.')
  const timeout = requestSignal(TRANSCRIPTION_TIMEOUT_MS)
  try {
    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: timeout.signal,
    })
    if (!response.ok) throw await providerError(response, 'Lyric transcription')
    const value = await response.json().catch(() => null)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Lyric transcription returned an unreadable response.')
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Lyric transcription took too long. Funūn will retry automatically.')
    }
    throw error
  } finally {
    timeout.dispose()
  }
}

function audioForm(input: {
  audio: Blob
  extension: string
  model: string
  responseFormat: 'json' | 'verbose_json'
  withSegmentTimestamps?: boolean
}): FormData {
  const form = new FormData()
  form.append('file', input.audio, `writer-room-source.${input.extension}`)
  form.append('model', input.model)
  form.append('response_format', input.responseFormat)
  form.append(
    'prompt',
    'This is a song recording. Transcribe only audible sung, rapped, or spoken lyrics. Preserve every repetition and the original language. Do not invent missing words or add section labels.'
  )
  if (input.withSegmentTimestamps) form.append('timestamp_granularities[]', 'segment')
  return form
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function languageFrom(value: Record<string, unknown>): string | null {
  if (typeof value.language === 'string' && value.language.trim()) return value.language.trim()
  if (!Array.isArray(value.languages)) return null
  for (const candidate of value.languages) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const code = (candidate as Record<string, unknown>).code
      if (typeof code === 'string' && code.trim()) return code.trim()
    }
  }
  return null
}

function timedSegmentsFrom(value: Record<string, unknown>): LyricLiftTimedSegment[] {
  if (!Array.isArray(value.segments)) return []
  return value.segments.slice(0, 1000).flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const row = raw as Record<string, unknown>
    const start = typeof row.start === 'number' && Number.isFinite(row.start) ? row.start : null
    const end = typeof row.end === 'number' && Number.isFinite(row.end) ? row.end : null
    const text = stringValue(row.text)
    if (start === null || end === null || start < 0 || end < start || !text) return []
    const avgLogprob = typeof row.avg_logprob === 'number' && Number.isFinite(row.avg_logprob)
      ? row.avg_logprob
      : null
    return [{
      startMs: Math.round(start * 1000),
      endMs: Math.round(end * 1000),
      text,
      confidence: avgLogprob === null ? null : Math.max(0, Math.min(1, Math.exp(avgLogprob))),
    }]
  })
}

export async function transcribeLyricLiftAudio(input: {
  audio: Blob
  extension: string
  knownDurationSeconds: number | null
}): Promise<TranscriptionResult> {
  // The high-accuracy transcript and timestamp alignment are independent, so
  // upload them concurrently. Whisper supplies segment times; GPT Transcribe
  // supplies the words the artist reviews. The classifier reconciles them.
  const [transcriptResponse, alignmentResponse] = await Promise.all([
    postForm('/audio/transcriptions', audioForm({
      audio: input.audio,
      extension: input.extension,
      model: TRANSCRIPTION_MODEL,
      responseFormat: 'json',
    })),
    postForm('/audio/transcriptions', audioForm({
      audio: input.audio,
      extension: input.extension,
      model: ALIGNMENT_MODEL,
      responseFormat: 'verbose_json',
      withSegmentTimestamps: true,
    })),
  ])

  const transcript = stringValue(transcriptResponse.text)
  if (!transcript) {
    throw new Error('I could not find clear vocals in this recording. Try a louder vocal mix or add the lyrics by hand.')
  }
  const timedSegments = timedSegmentsFrom(alignmentResponse)
  const responseDuration = typeof alignmentResponse.duration === 'number' && Number.isFinite(alignmentResponse.duration)
    ? Math.round(alignmentResponse.duration * 1000)
    : 0
  const knownDuration = Math.max(0, Math.round((input.knownDurationSeconds ?? 0) * 1000))
  const segmentDuration = timedSegments.length > 0 ? timedSegments[timedSegments.length - 1]!.endMs : 0

  return {
    transcript,
    language: languageFrom(transcriptResponse) ?? languageFrom(alignmentResponse),
    timedSegments,
    durationMs: Math.max(responseDuration, knownDuration, segmentDuration),
    transcriptionModel: TRANSCRIPTION_MODEL,
    alignmentModel: ALIGNMENT_MODEL,
  }
}

function structureSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sections'],
    properties: {
      sections: {
        type: 'array',
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'block_type',
            'custom_label',
            'text',
            'start_ms',
            'end_ms',
            'confidence',
            'needs_review',
            'repeat_of_index',
          ],
          properties: {
            block_type: {
              type: 'string',
              enum: ['verse', 'pre_chorus', 'chorus', 'bridge', 'intro', 'outro', 'hook', 'custom'],
            },
            custom_label: { type: ['string', 'null'] },
            text: { type: 'string' },
            start_ms: { type: 'integer', minimum: 0 },
            end_ms: { type: 'integer', minimum: 0 },
            confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
            needs_review: { type: 'boolean' },
            repeat_of_index: { type: ['integer', 'null'], minimum: 0 },
          },
        },
      },
    },
  }
}

function outputText(value: Record<string, unknown>): string {
  if (typeof value.output_text === 'string') return value.output_text
  if (!Array.isArray(value.output)) return ''
  const parts: string[] = []
  for (const item of value.output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('')
}

async function structureTranscript(input: TranscriptionResult): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const timeout = requestSignal(STRUCTURE_TIMEOUT_MS)
  try {
    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: timeout.signal,
      body: JSON.stringify({
        model: STRUCTURE_MODEL,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 12000,
        instructions: [
          'Organize a transcript of an existing human-performed song into chronological lyric sections for artist review.',
          'Copy the transcript words; do not rewrite, polish, censor, translate, or invent lyrics.',
          'Use the rough timed segments only to estimate each section start and end.',
          'Use custom only when the form is genuinely unclear. Mark uncertain sections needs_review.',
          'For an exact repeated section, set repeat_of_index to the earlier section array index. Otherwise use null.',
        ].join(' '),
        input: JSON.stringify({
          accurate_transcript: input.transcript,
          rough_timed_segments: input.timedSegments.map(segment => ({
            start_ms: segment.startMs,
            end_ms: segment.endMs,
            text: segment.text,
          })),
          recording_duration_ms: input.durationMs,
        }),
        text: {
          verbosity: 'low',
          format: {
            type: 'json_schema',
            name: 'lyric_lift_sections',
            strict: true,
            schema: structureSchema(),
          },
        },
      }),
    })
    if (!response.ok) return null
    const result = (await response.json().catch(() => null)) as Record<string, unknown> | null
    if (!result) return null
    const text = outputText(result)
    return text ? JSON.parse(text) : null
  } catch {
    // Section detection is an enhancement over the faithful transcript. If
    // it is unavailable, the artist still gets one editable full-transcript
    // block instead of losing the completed transcription job.
    return null
  } finally {
    timeout.dispose()
  }
}

export async function createLyricLiftDraft(input: {
  audio: Blob
  extension: string
  knownDurationSeconds: number | null
}): Promise<LyricLiftProviderResult> {
  const transcription = await transcribeLyricLiftAudio(input)
  const structureValue = await structureTranscript(transcription)
  const structured = normalizeStructuredLyricSections({
    value: structureValue,
    transcript: transcription.transcript,
    timedSegments: transcription.timedSegments,
    durationMs: transcription.durationMs,
  })
  return {
    ...transcription,
    sections: structured.sections,
    structureModel: STRUCTURE_MODEL,
    usedStructureFallback: structured.usedFallback,
  }
}
