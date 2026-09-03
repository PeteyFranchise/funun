'use client'

import { createClient } from '@/lib/supabase/client'
import { BUCKET, MAX_BYTES } from '@/lib/catalogue/audio-mime'
import {
  normalizeHandoffNote,
  normalizeHandoffRoundLabel,
  normalizeMusicalKey,
  normalizeProducerBpm,
  normalizeReferenceUrl,
} from '@/lib/catalogue/producer-handoff'

type HandoffIntent = {
  handoffId: string
  path: string
  token: string
  contentType: string
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback
}

export async function uploadProducerHandoff(input: {
  workId: string
  sessionId: string
  roughVersionId: string
  recipientUserId: string
  note: string
  roundLabel: string
  bpm: string
  musicalKey: string
  referenceUrl: string
  feedbackIds: string[]
  vocalStem: Blob
}): Promise<{ id: string }> {
  if (input.vocalStem.size <= 0) throw new Error('The dry vocal stem is empty.')
  if (input.vocalStem.size > MAX_BYTES) throw new Error(`The dry vocal stem must be under ${MAX_BYTES / (1024 * 1024)} MB.`)
  const roundLabel = normalizeHandoffRoundLabel(input.roundLabel)
  const bpm = normalizeProducerBpm(input.bpm)
  const musicalKey = normalizeMusicalKey(input.musicalKey)
  const referenceUrl = normalizeReferenceUrl(input.referenceUrl)

  const base = `/api/works/${input.workId}/recording-sessions/${input.sessionId}/handoffs`
  const intentResponse = await fetch(`${base}/upload-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size: input.vocalStem.size }),
  })
  if (!intentResponse.ok) throw new Error(await responseError(intentResponse, 'Could not prepare the producer handoff.'))
  const intent = ((await intentResponse.json()) as { data?: HandoffIntent }).data
  if (!intent?.handoffId || !intent.path || !intent.token || !intent.contentType) {
    throw new Error('Could not prepare the producer handoff.')
  }

  const vocalStem = input.vocalStem.type === intent.contentType
    ? input.vocalStem
    : new Blob([input.vocalStem], { type: intent.contentType })
  const { error: uploadError } = await createClient().storage
    .from(BUCKET)
    .uploadToSignedUrl(intent.path, intent.token, vocalStem, { contentType: intent.contentType, upsert: false })
  if (uploadError) throw new Error(`Dry vocal upload failed: ${uploadError.message}`)

  const completeResponse = await fetch(`${base}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handoffId: intent.handoffId,
      path: intent.path,
      roughVersionId: input.roughVersionId,
      recipientUserId: input.recipientUserId,
      note: normalizeHandoffNote(input.note),
      roundLabel,
      bpm,
      musicalKey,
      referenceUrl,
      feedbackIds: Array.from(new Set(input.feedbackIds)).slice(0, 25),
    }),
  })
  if (!completeResponse.ok) throw new Error(await responseError(completeResponse, 'The stem uploaded, but the handoff could not be saved.'))
  const result = (await completeResponse.json()) as { data?: { id?: string } }
  if (!result.data?.id) throw new Error('The stem uploaded, but the handoff could not be saved.')
  return { id: result.data.id }
}
