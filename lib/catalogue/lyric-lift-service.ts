import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BUCKET } from '@/lib/catalogue/audio'
import {
  LYRIC_LIFT_MAX_BYTES,
  LYRIC_LIFT_NO_VOCALS_MESSAGE,
  LYRIC_LIFT_SUPPORTED_EXTENSIONS,
  isNoVocalsDetectedError,
  type LyricLiftSection,
  type LyricLiftStatus,
  type LyricLiftView,
} from '@/lib/catalogue/lyric-lift'
import { createLyricLiftDraft } from '@/lib/catalogue/lyric-lift-provider'
import { createServiceClient } from '@/lib/supabase/server'

type LiftRow = {
  id: string
  work_id: string
  version_id: string
  status: LyricLiftStatus
  language: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
  applied_at: string | null
}

type SectionRow = {
  id: string
  position: number
  block_type: LyricLiftSection['blockType']
  custom_label: string | null
  text: string
  start_ms: number
  end_ms: number
  confidence: number | string | null
  needs_review: boolean
  included: boolean
  repeat_of_section_id: string | null
}

function sectionView(row: SectionRow): LyricLiftSection {
  const parsedConfidence = row.confidence === null ? null : Number(row.confidence)
  return {
    id: row.id,
    position: row.position,
    blockType: row.block_type,
    customLabel: row.custom_label,
    text: row.text,
    startMs: row.start_ms,
    endMs: row.end_ms,
    confidence: Number.isFinite(parsedConfidence) ? parsedConfidence : null,
    needsReview: row.needs_review,
    included: row.included,
    repeatOfSectionId: row.repeat_of_section_id,
  }
}

async function liftView(service: SupabaseClient, row: LiftRow): Promise<LyricLiftView> {
  const { data, error } = await service
    .from('work_lyric_lift_sections')
    .select('id, position, block_type, custom_label, text, start_ms, end_ms, confidence, needs_review, included, repeat_of_section_id')
    .eq('lift_id', row.id)
    .order('position', { ascending: true })
  if (error) throw new Error(`Could not load Lyric Lift sections: ${error.message}`)

  return {
    id: row.id,
    workId: row.work_id,
    versionId: row.version_id,
    status: row.status,
    language: row.language,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    appliedAt: row.applied_at,
    sections: ((data ?? []) as SectionRow[]).map(sectionView),
  }
}

export async function loadLyricLiftView(
  service: SupabaseClient,
  input: { workId: string; liftId: string }
): Promise<LyricLiftView | null> {
  const { data, error } = await service
    .from('work_lyric_lifts')
    .select('id, work_id, version_id, status, language, error_message, created_at, completed_at, applied_at')
    .eq('id', input.liftId)
    .eq('work_id', input.workId)
    .maybeSingle()
  if (error) throw new Error(`Could not load Lyric Lift: ${error.message}`)
  return data ? liftView(service, data as LiftRow) : null
}

export async function loadOpenLyricLiftView(
  service: SupabaseClient,
  workId: string
): Promise<LyricLiftView | null> {
  const { data, error } = await service
    .from('work_lyric_lifts')
    .select('id, work_id, version_id, status, language, error_message, created_at, completed_at, applied_at')
    .eq('work_id', workId)
    .in('status', ['queued', 'processing', 'review', 'failed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Could not load Lyric Lift: ${error.message}`)
  return data ? liftView(service, data as LiftRow) : null
}

function safeFailure(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Lyric transcription failed. Please try again.'
  return message.slice(0, 500)
}

/** Durable job body. Re-running it replaces only this lift's draft sections. */
export async function processLyricLift(liftId: string): Promise<Record<string, unknown>> {
  const service = createServiceClient()
  const { data: lift, error: liftError } = await service
    .from('work_lyric_lifts')
    .select('id, work_id, version_id, status')
    .eq('id', liftId)
    .maybeSingle()
  if (liftError || !lift) throw new Error(liftError?.message ?? 'Lyric Lift job not found')
  if (lift.status === 'applied' || lift.status === 'discarded') return { liftId, status: lift.status }

  const { data: claimed, error: claimError } = await service
    .from('work_lyric_lifts')
    .update({ status: 'processing', started_at: new Date().toISOString(), error_message: null })
    .eq('id', liftId)
    .in('status', ['queued', 'processing', 'failed'])
    .select('id')
    .maybeSingle()
  if (claimError) throw new Error(`Could not start Lyric Lift: ${claimError.message}`)
  if (!claimed) return { liftId, status: 'discarded' }

  try {
    const { data: version, error: versionError } = await service
      .from('work_versions')
      .select('id, work_id, audio_path, audio_ext, audio_size, duration_seconds')
      .eq('id', lift.version_id)
      .eq('work_id', lift.work_id)
      .maybeSingle()
    if (versionError || !version) throw new Error(versionError?.message ?? 'Source recording not found')
    const size = Number(version.audio_size ?? 0)
    if (size <= 0 || size > LYRIC_LIFT_MAX_BYTES) {
      throw new Error('This recording is too large for lyric transcription. Try an MP3 or M4A under 25 MB.')
    }
    if (!LYRIC_LIFT_SUPPORTED_EXTENSIONS.has(version.audio_ext)) {
      throw new Error('Lyric Lift supports MP3, M4A, WAV, FLAC, OGG, and WebM recordings.')
    }

    const { data: audio, error: downloadError } = await service.storage.from(BUCKET).download(version.audio_path)
    if (downloadError || !audio) throw new Error(downloadError?.message ?? 'Could not read the source recording')
    if (audio.size <= 0 || audio.size > LYRIC_LIFT_MAX_BYTES) {
      throw new Error('This recording is too large for lyric transcription. Try an MP3 or M4A under 25 MB.')
    }

    const draft = await createLyricLiftDraft({
      audio,
      extension: version.audio_ext,
      knownDurationSeconds: version.duration_seconds,
    })
    if (draft.sections.length === 0) {
      throw new Error('I could not find clear vocals in this recording. Try a louder vocal mix or add the lyrics by hand.')
    }

    // A member can cancel while the provider is listening. Re-check before
    // writing any draft content so cancellation always wins.
    const { data: currentLift, error: currentError } = await service
      .from('work_lyric_lifts')
      .select('status')
      .eq('id', liftId)
      .maybeSingle()
    if (currentError) throw new Error(`Could not check Lyric Lift status: ${currentError.message}`)
    if (!currentLift || currentLift.status === 'discarded') return { liftId, status: 'discarded' }

    const sectionIds = draft.sections.map(() => randomUUID())
    const rows = draft.sections.map((section, index) => ({
      id: sectionIds[index],
      lift_id: liftId,
      position: index,
      block_type: section.blockType,
      custom_label: section.customLabel,
      text: section.text,
      start_ms: section.startMs,
      end_ms: section.endMs,
      confidence: section.confidence,
      needs_review: section.needsReview || draft.usedStructureFallback,
      included: true,
      repeat_of_section_id: section.repeatOfIndex === null ? null : sectionIds[section.repeatOfIndex] ?? null,
    }))

    const { error: clearError } = await service
      .from('work_lyric_lift_sections')
      .delete()
      .eq('lift_id', liftId)
    if (clearError) throw new Error(`Could not reset the lyric draft: ${clearError.message}`)
    const { error: sectionError } = await service.from('work_lyric_lift_sections').insert(rows)
    if (sectionError) throw new Error(`Could not save the lyric draft: ${sectionError.message}`)

    const { data: completed, error: completeError } = await service
      .from('work_lyric_lifts')
      .update({
        status: 'review',
        language: draft.language,
        raw_transcript: draft.transcript,
        timed_segments: draft.timedSegments.map(segment => ({
          start_ms: segment.startMs,
          end_ms: segment.endMs,
          text: segment.text,
          confidence: segment.confidence,
        })),
        transcription_model: draft.transcriptionModel,
        alignment_model: draft.alignmentModel,
        structure_model: draft.structureModel,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', liftId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle()
    if (completeError) throw new Error(`Could not finish the lyric draft: ${completeError.message}`)
    if (!completed) {
      await service.from('work_lyric_lift_sections').delete().eq('lift_id', liftId)
      return { liftId, status: 'discarded' }
    }

    return { liftId, status: 'review', sectionCount: rows.length }
  } catch (error) {
    const noVocals = isNoVocalsDetectedError(error)
    const { data: failed } = await service
      .from('work_lyric_lifts')
      .update({
        status: 'failed',
        error_message: noVocals ? LYRIC_LIFT_NO_VOCALS_MESSAGE : safeFailure(error),
        completed_at: noVocals ? new Date().toISOString() : null,
      })
      .eq('id', liftId)
      .neq('status', 'discarded')
      .select('id')
      .maybeSingle()
    if (!failed) return { liftId, status: 'discarded' }
    // Instrumental audio is a valid completed analysis, not a transient job
    // failure. Returning prevents the paid queue from retrying the same audio.
    if (noVocals) return { liftId, status: 'failed', reason: 'no_vocals' }
    throw error
  }
}
