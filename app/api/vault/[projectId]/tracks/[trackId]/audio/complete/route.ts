import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  TRACK_AUDIO_BUCKET,
  TRACK_AUDIO_MAX_BYTES,
  resolveTrackAudioType,
  validateTrackAudioPath,
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
    path?: unknown
    role?: unknown
    duration?: unknown
  } | null
  const path = typeof body?.path === 'string' ? body.path : ''
  if (body?.role !== 'share' && body?.role !== 'master') {
    return NextResponse.json({ error: 'Audio role must be share or master' }, { status: 400 })
  }
  const role = body.role
  const pathType = validateTrackAudioPath(path, user.id, projectId, trackId, role)
  if (!pathType) return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 })

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, audio_file_url, metadata')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (trackError) return NextResponse.json({ error: 'Could not load this track' }, { status: 500 })
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
  const existingMaster = (metadata.master as { path?: string } | undefined)?.path ?? null
  const previousPath = role === 'master' ? existingMaster : track.audio_file_url
  if (previousPath === path) return NextResponse.json({ data: track })

  const service = createServiceClient()
  const { data: stored, error: infoError } = await service.storage.from(TRACK_AUDIO_BUCKET).info(path)
  const storedSize = stored?.size ?? 0
  // The signed upload path already fixes the extension. Validate the bytes' reported
  // media type independently so an executable renamed to .mp3 cannot be attached.
  const storedType = resolveTrackAudioType(stored?.contentType ?? '', '')
  if (
    infoError ||
    !stored ||
    storedSize <= 0 ||
    storedSize > TRACK_AUDIO_MAX_BYTES ||
    !storedType ||
    storedType.ext !== pathType.ext
  ) {
    if (stored) await service.storage.from(TRACK_AUDIO_BUCKET).remove([path])
    return NextResponse.json({ error: 'The stored audio file is invalid.' }, { status: 400 })
  }

  const durationValue = typeof body?.duration === 'number' ? body.duration : Number.NaN
  const duration =
    Number.isFinite(durationValue) && durationValue >= 0 && durationValue <= 86400
      ? Math.round(durationValue)
      : null
  const update =
    role === 'master'
      ? { metadata: { ...metadata, master: { path, size: storedSize, ext: pathType.ext } } }
      : {
          audio_file_url: path,
          audio_file_size: storedSize,
          ...(duration !== null ? { duration_seconds: duration } : {}),
        }

  const { data: updated, error: updateError } = await supabase
    .from('tracks')
    .update(update)
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError || !updated) {
    await service.storage.from(TRACK_AUDIO_BUCKET).remove([path])
    return NextResponse.json({ error: 'Could not attach this audio to the track' }, { status: 500 })
  }

  if (previousPath && previousPath !== path) {
    await service.storage.from(TRACK_AUDIO_BUCKET).remove([previousPath])
  }
  return NextResponse.json({ data: updated })
}
