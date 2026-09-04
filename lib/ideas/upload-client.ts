'use client'

import { createClient } from '@/lib/supabase/client'
import { MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio-mime'
import type { IdeaRecordingKind } from '@/lib/ideas/schema'

type UploadIntent = { recordingId: string; path: string; token: string; contentType: string }

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
}

export async function uploadIdeaRecording(input: {
  ideaId: string
  file: Blob
  fileName: string
  durationSeconds?: number | null
  label?: string | null
  kind?: IdeaRecordingKind
  parentRecordingId?: string | null
  markers?: { timestampMs: number; label?: string | null }[]
  onPhase?: (phase: 'preparing' | 'uploading' | 'finalizing') => void
}): Promise<{ id: string }> {
  if (input.file.size <= 0) throw new Error('No audio was captured.')
  if (input.file.size > MAX_BYTES) throw new Error(`Audio must be under ${MAX_BYTES / (1024 * 1024)} MB.`)
  if (!resolveAudioType(input.file.type, input.fileName)) throw new Error('Use an MP3, WAV, M4A, AAC, FLAC, OGG, or WebM audio file.')

  const base = `/api/ideas/${input.ideaId}/recordings`
  input.onPhase?.('preparing')
  const intentResponse = await fetch(`${base}/upload-intent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: input.fileName, mimeType: input.file.type, size: input.file.size }),
  })
  if (!intentResponse.ok) throw new Error(await responseError(intentResponse, 'Could not prepare the idea recording.'))
  const intent = ((await intentResponse.json()) as { data?: UploadIntent }).data
  if (!intent) throw new Error('Could not prepare the idea recording.')

  input.onPhase?.('uploading')
  const canonical = input.file.type === intent.contentType ? input.file : new Blob([input.file], { type: intent.contentType })
  const { error } = await createClient().storage.from('track-audio').uploadToSignedUrl(intent.path, intent.token, canonical, {
    contentType: intent.contentType, upsert: false,
  })
  if (error) throw new Error(`Idea upload failed: ${error.message}`)

  input.onPhase?.('finalizing')
  const complete = await fetch(`${base}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recordingId: intent.recordingId,
      path: intent.path,
      durationSeconds: input.durationSeconds ?? null,
      label: input.label ?? null,
      kind: input.kind ?? 'voice',
      parentRecordingId: input.parentRecordingId ?? null,
      markers: input.markers ?? [],
    }),
  })
  if (!complete.ok) throw new Error(await responseError(complete, 'Audio uploaded, but the idea could not be saved.'))
  const result = (await complete.json()) as { data?: { id?: string } }
  if (!result.data?.id) throw new Error('Audio uploaded, but the idea could not be saved.')
  return { id: result.data.id }
}
