import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  claimDeclaredUploadAdmission,
  finishUploadAdmission,
} from '@/lib/security/upload-admission'
import {
  TRACK_AUDIO_BUCKET,
  TRACK_AUDIO_MAX_BYTES,
  buildTrackAudioPath,
  resolveTrackAudioType,
} from '@/lib/vault/track-audio'

type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

export async function POST(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    fileName?: unknown
    mimeType?: unknown
    size?: unknown
    role?: unknown
  } | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim().slice(0, 255) : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''
  const size = typeof body?.size === 'number' ? body.size : Number.NaN
  if (body?.role !== 'share' && body?.role !== 'master') {
    return NextResponse.json({ error: 'Audio role must be share or master' }, { status: 400 })
  }
  const role = body.role
  const audioType = resolveTrackAudioType(mimeType, fileName)

  if (!Number.isSafeInteger(size) || size <= 0 || size > TRACK_AUDIO_MAX_BYTES) {
    return NextResponse.json({ error: 'Audio exceeds the 50MB limit' }, { status: 400 })
  }
  if (!audioType) {
    return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 })
  }

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (trackError) return NextResponse.json({ error: 'Could not verify this track' }, { status: 500 })
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const admission = await claimDeclaredUploadAdmission(supabase, request, {
    operation: 'vault:track-audio-intent',
    declaredBytes: size,
    maxBytes: TRACK_AUDIO_MAX_BYTES,
    dailyCountLimit: 20,
    dailyByteLimit: 1024 * 1024 * 1024,
  })
  if (!admission.allowed) {
    return NextResponse.json({ error: admission.error }, { status: admission.status })
  }

  const path = buildTrackAudioPath(
    user.id,
    projectId,
    trackId,
    role,
    randomUUID(),
    audioType.ext
  )
  try {
    const { data, error } = await createServiceClient().storage
      .from(TRACK_AUDIO_BUCKET)
      .createSignedUploadUrl(path, { upsert: false })
    if (error || !data) {
      return NextResponse.json({ error: 'Could not prepare audio upload' }, { status: 500 })
    }
    return NextResponse.json({
      data: { path, token: data.token, contentType: audioType.contentType, role },
    })
  } finally {
    await finishUploadAdmission(supabase, admission.claimId)
  }
}
