import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { parseAdmittedFormData } from '@/lib/security/upload-admission'
import {
  TRACK_AUDIO_BUCKET as BUCKET,
  TRACK_AUDIO_MAX_BYTES as MAX_BYTES,
  buildTrackAudioPath,
  resolveTrackAudioType,
  trackAudioRole,
} from '@/lib/vault/track-audio'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

// POST — upload (or replace) a track's audio. multipart/form-data:
//   file: the audio file
//   role: 'share' (default) — the MP3 used for playback + sharing to industry,
//         stored on tracks.audio_file_url; or 'master' — the distribution WAV,
//         kept in tracks.metadata.master (no migration needed).
//   duration: optional seconds (read client-side) — only applied to the share file
export async function POST(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json({ error: 'Audio upload is not available in demo mode' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsedUpload = await parseAdmittedFormData(supabase, request, {
    operation: 'vault:track-audio',
    maxBodyBytes: MAX_BYTES + 1024 * 1024,
    dailyCountLimit: 20,
    dailyByteLimit: 1024 * 1024 * 1024,
  })
  if (!parsedUpload.ok) {
    return NextResponse.json({ error: parsedUpload.error }, { status: parsedUpload.status })
  }
  const form = parsedUpload.form
  const file = form.get('file')
  const role = trackAudioRole(form.get('role'))
  const durationRaw = form.get('duration')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio exceeds 50MB limit' }, { status: 400 })
  }
  const audioType = resolveTrackAudioType(file.type, file.name)
  if (!audioType) {
    return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 })
  }

  // Confirm the track belongs to this user (and project).
  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_file_url, metadata')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const service = createServiceClient()
  const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
  const existingMaster = (metadata.master as { path?: string } | undefined)?.path ?? null

  // Upload to a new immutable path. The database pointer moves first; only
  // then is the previous object eligible for cleanup.
  const objectId = randomUUID()
  const path = buildTrackAudioPath(
    user.id,
    projectId,
    trackId,
    role,
    objectId,
    audioType.ext
  )

  const prev = role === 'master' ? existingMaster : track.audio_file_url

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  let update: Record<string, unknown>
  if (role === 'master') {
    update = { metadata: { ...metadata, master: { path, size: file.size, ext: audioType.ext } } }
  } else {
    const duration =
      durationRaw != null && !Number.isNaN(Number(durationRaw))
        ? Math.round(Number(durationRaw))
        : null
    update = {
      audio_file_url: path, // store the storage PATH; URLs are signed on read
      audio_file_size: file.size,
      ...(duration != null ? { duration_seconds: duration } : {}),
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('tracks')
    .update(update)
    .eq('id', trackId)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (prev && prev !== path) {
    await service.storage.from(BUCKET).remove([prev])
  }

  return NextResponse.json({ data: updated })
}

// DELETE — remove a track's audio. `?role=master` removes the master WAV;
// default removes the share/MP3.
export async function DELETE(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json({ error: 'Audio upload is not available in demo mode' }, { status: 400 })
  }

  const role = trackAudioRole(new URL(request.url).searchParams.get('role'))

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_file_url, metadata')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const service = createServiceClient()
  const metadata = (track.metadata as Record<string, unknown> | null) ?? {}

  if (role === 'master') {
    const masterPath = (metadata.master as { path?: string } | undefined)?.path ?? null
    const nextMeta: Record<string, unknown> = { ...metadata }
    delete nextMeta.master
    const { data: updated, error } = await supabase
      .from('tracks')
      .update({ metadata: nextMeta })
      .eq('id', trackId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()
    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Track no longer exists' }, { status: 500 })
    }
    if (masterPath) await service.storage.from(BUCKET).remove([masterPath])
  } else {
    const { data: updated, error } = await supabase
      .from('tracks')
      .update({ audio_file_url: null, audio_file_size: null })
      .eq('id', trackId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle()
    if (error || !updated) {
      return NextResponse.json({ error: error?.message ?? 'Track no longer exists' }, { status: 500 })
    }
    if (track.audio_file_url) await service.storage.from(BUCKET).remove([track.audio_file_url])
  }

  return NextResponse.json({ data: { ok: true } })
}
