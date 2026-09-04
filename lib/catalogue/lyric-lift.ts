import type { LyricBlockType } from '@/types/catalogue'

export const LYRIC_LIFT_MAX_BYTES = 25 * 1024 * 1024
export const LYRIC_LIFT_SUPPORTED_EXTENSIONS = new Set([
  'flac',
  'mp3',
  'm4a',
  'ogg',
  'wav',
  'webm',
])

export const LYRIC_LIFT_BLOCK_TYPES = [
  'verse',
  'pre_chorus',
  'chorus',
  'bridge',
  'intro',
  'outro',
  'hook',
  'custom',
] as const satisfies readonly LyricBlockType[]

export type LyricLiftStatus = 'queued' | 'processing' | 'review' | 'failed' | 'applied' | 'discarded'

export type LyricLiftTimedSegment = {
  startMs: number
  endMs: number
  text: string
  confidence: number | null
}

export type LyricLiftSection = {
  id: string
  position: number
  blockType: LyricBlockType
  customLabel: string | null
  text: string
  startMs: number
  endMs: number
  confidence: number | null
  needsReview: boolean
  included: boolean
  repeatOfSectionId: string | null
}

export type LyricLiftView = {
  id: string
  workId: string
  versionId: string
  status: LyricLiftStatus
  language: string | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
  appliedAt: string | null
  sections: LyricLiftSection[]
}

export type StructuredLyricSection = {
  blockType: LyricBlockType
  customLabel: string | null
  text: string
  startMs: number
  endMs: number
  confidence: number | null
  needsReview: boolean
  repeatOfIndex: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tokens(value: string): string[] {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter(Boolean)
}

function transcriptCoverage(transcript: string, sections: StructuredLyricSection[]): {
  coverage: number
  extraShare: number
} {
  const expected = tokens(transcript)
  const actual = tokens(sections.map(section => section.text).join(' '))
  if (expected.length === 0 || actual.length === 0) return { coverage: 0, extraShare: 1 }

  const expectedCounts = new Map<string, number>()
  for (const token of expected) expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1)
  let matched = 0
  for (const token of actual) {
    const remaining = expectedCounts.get(token) ?? 0
    if (remaining > 0) {
      matched += 1
      expectedCounts.set(token, remaining - 1)
    }
  }

  return {
    coverage: matched / expected.length,
    extraShare: (actual.length - matched) / actual.length,
  }
}

function confidenceForRange(
  startMs: number,
  endMs: number,
  timedSegments: LyricLiftTimedSegment[]
): number | null {
  const overlapping = timedSegments.filter(segment =>
    segment.endMs >= startMs && segment.startMs <= endMs && segment.confidence !== null
  )
  if (overlapping.length === 0) return null
  return overlapping.reduce((sum, segment) => sum + (segment.confidence ?? 0), 0) / overlapping.length
}

function fallbackSection(
  transcript: string,
  timedSegments: LyricLiftTimedSegment[],
  durationMs: number
): StructuredLyricSection[] {
  const startMs = timedSegments[0]?.startMs ?? 0
  const endMs = timedSegments.at(-1)?.endMs ?? durationMs
  const confidence = confidenceForRange(startMs, endMs, timedSegments)
  return [{
    blockType: 'custom',
    customLabel: 'Full transcription',
    text: transcript.trim(),
    startMs,
    endMs: Math.max(startMs, endMs),
    confidence,
    needsReview: confidence !== null && confidence < 0.6,
    repeatOfIndex: null,
  }]
}

/**
 * Treat model output as an untrusted suggestion. Invalid shapes, suspicious
 * additions, or a draft that drops too much of the transcript collapse to one
 * editable block containing the provider transcript. Lyric Lift would rather
 * ask the artist to split a faithful draft than invent a polished song form.
 */
export function normalizeStructuredLyricSections(input: {
  value: unknown
  transcript: string
  timedSegments: LyricLiftTimedSegment[]
  durationMs: number
}): { sections: StructuredLyricSection[]; usedFallback: boolean } {
  const transcript = input.transcript.trim()
  if (!transcript) return { sections: [], usedFallback: false }

  const root = asRecord(input.value)
  const rawSections = Array.isArray(root?.sections) ? root.sections.slice(0, 100) : []
  const parsed: StructuredLyricSection[] = []
  let previousStart = 0

  for (let index = 0; index < rawSections.length; index += 1) {
    const raw = asRecord(rawSections[index])
    if (!raw) continue
    const blockType = typeof raw.block_type === 'string' && LYRIC_LIFT_BLOCK_TYPES.includes(raw.block_type as LyricBlockType)
      ? raw.block_type as LyricBlockType
      : null
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 20000) : ''
    if (!blockType || !text) continue

    const rawStart = typeof raw.start_ms === 'number' && Number.isFinite(raw.start_ms)
      ? Math.round(raw.start_ms)
      : previousStart
    const startMs = clamp(rawStart, previousStart, Math.max(0, input.durationMs))
    const rawEnd = typeof raw.end_ms === 'number' && Number.isFinite(raw.end_ms)
      ? Math.round(raw.end_ms)
      : startMs
    const endMs = clamp(rawEnd, startMs, Math.max(startMs, input.durationMs))
    previousStart = startMs

    const customLabel = blockType === 'custom'
      ? (typeof raw.custom_label === 'string' && raw.custom_label.trim()
          ? raw.custom_label.trim().slice(0, 80)
          : 'Section')
      : null
    const modelConfidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? clamp(raw.confidence, 0, 1)
      : null
    const alignedConfidence = confidenceForRange(startMs, endMs, input.timedSegments)
    const confidence = modelConfidence === null
      ? alignedConfidence
      : alignedConfidence === null
        ? modelConfidence
        : Math.min(modelConfidence, alignedConfidence)
    const repeatIndex = typeof raw.repeat_of_index === 'number' && Number.isInteger(raw.repeat_of_index)
      && raw.repeat_of_index >= 0 && raw.repeat_of_index < index
      ? raw.repeat_of_index
      : null

    parsed.push({
      blockType,
      customLabel,
      text,
      startMs,
      endMs,
      confidence,
      needsReview: raw.needs_review === true || (confidence !== null && confidence < 0.6),
      repeatOfIndex: repeatIndex,
    })
  }

  const { coverage, extraShare } = transcriptCoverage(transcript, parsed)
  if (parsed.length === 0 || coverage < 0.68 || extraShare > 0.2) {
    return {
      sections: fallbackSection(transcript, input.timedSegments, input.durationMs),
      usedFallback: true,
    }
  }

  // A repeat remains linked only when the words actually repeat. If the
  // classifier points at a differently worded chorus, keep it as an ordinary
  // editable section so approval cannot hide unique lyrics behind a link.
  for (const section of parsed) {
    if (section.repeatOfIndex === null) continue
    const source = parsed[section.repeatOfIndex]
    if (!source || tokens(source.text).join(' ') !== tokens(section.text).join(' ')) {
      section.repeatOfIndex = null
    }
  }

  return { sections: parsed, usedFallback: false }
}

export function formatLyricLiftTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function lyricLiftSectionLabel(section: Pick<LyricLiftSection, 'blockType' | 'customLabel'>): string {
  if (section.blockType === 'custom') return section.customLabel?.trim() || 'Section'
  if (section.blockType === 'pre_chorus') return 'Pre-chorus'
  return section.blockType[0]!.toUpperCase() + section.blockType.slice(1)
}
