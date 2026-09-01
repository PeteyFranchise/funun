'use client'

import { createClient } from '@/lib/supabase/client'
import { BUCKET, MAX_BYTES, resolveAudioType } from '@/lib/catalogue/audio-mime'
import type { WorkVersion, WorkVersionSource } from '@/types/catalogue'

type UploadPhase = 'preparing' | 'uploading' | 'finalizing'

export type UploadWorkVersionInput = {
  workId: string
  file: Blob
  fileName: string
  source: WorkVersionSource
  durationSeconds?: number | null
  label?: string | null
  onPhase?: (phase: UploadPhase) => void
}

type UploadIntent = {
  versionId: string
  path: string
  token: string
  contentType: string
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
}

/**
 * Sends only small JSON control messages through Next.js. The audio bytes go
 * browser → private Supabase Storage through a one-off signed upload token,
 * avoiding the hosting function's request-body ceiling. The completion route
 * verifies the stored object before it creates the durable version record.
 */
export async function uploadWorkVersion(input: UploadWorkVersionInput): Promise<WorkVersion> {
  if (input.file.size <= 0) {
    throw new Error('No audio was captured. Check your microphone or choose an audio file and try again.')
  }
  if (input.file.size > MAX_BYTES) {
    throw new Error(`Audio must be under ${MAX_BYTES / (1024 * 1024)} MB.`)
  }

  const audioType = resolveAudioType(input.file.type, input.fileName)
  if (!audioType) {
    throw new Error('Use an MP3, WAV, M4A, AAC, FLAC, OGG, or WebM audio file.')
  }

  input.onPhase?.('preparing')
  const intentResponse = await fetch(`/api/works/${input.workId}/versions/upload-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: input.fileName,
      mimeType: input.file.type,
      size: input.file.size,
      source: input.source,
    }),
  })
  if (!intentResponse.ok) {
    throw new Error(await responseError(intentResponse, 'Could not prepare the audio upload.'))
  }

  const intentBody = (await intentResponse.json()) as { data?: UploadIntent }
  const intent = intentBody.data
  if (!intent?.versionId || !intent.path || !intent.token || !intent.contentType) {
    throw new Error('Could not prepare the audio upload.')
  }

  input.onPhase?.('uploading')
  const supabase = createClient()
  const canonicalBlob =
    input.file.type === intent.contentType
      ? input.file
      : new Blob([input.file], { type: intent.contentType })
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(intent.path, intent.token, canonicalBlob, {
      contentType: intent.contentType,
      upsert: false,
    })
  if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`)

  input.onPhase?.('finalizing')
  const completeResponse = await fetch(`/api/works/${input.workId}/versions/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      versionId: intent.versionId,
      path: intent.path,
      source: input.source,
      duration: input.durationSeconds ?? null,
      label: input.label ?? null,
    }),
  })
  if (!completeResponse.ok) {
    throw new Error(await responseError(completeResponse, 'Audio uploaded, but the take could not be saved.'))
  }

  const completeBody = (await completeResponse.json()) as { data?: WorkVersion }
  if (!completeBody.data) throw new Error('Audio uploaded, but the take could not be saved.')
  return completeBody.data
}
