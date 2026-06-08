import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'
const MAX_BYTES = 50 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
}

type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

// POST — upload (or replace) the audio file for a track. multipart/form-data:
//   file: the audio file
//   duration: optional number of seconds (read client-side from the file)
export async function POST(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Audio upload is not available in demo mode' },
      { status: 400 }
    )
  }

  const form = await request.formData()
  const file = form.get('file')
  const durationRaw = form.get('duration')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio exceeds 50MB limit' }, { status: 400 })
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the track belongs to this user (and project).
  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_file_url')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const duration =
    durationRaw != null && !Number.isNaN(Number(durationRaw))
      ? Math.round(Number(durationRaw))
      : null

  // Stable path so re-uploads overwrite rather than orphan. Private bucket,
  // so we use the service client (RLS-bypassing) after the ownership check.
  const path = `${user.id}/${projectId}/${trackId}.${ext}`
  const service = createServiceClient()

  // If the extension changed, drop the previous object so it doesn't linger.
  if (track.audio_file_url && track.audio_file_url !== path) {
    await service.storage.from(BUCKET).remove([track.audio_file_url])
  }

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('tracks')
    .update({
      audio_file_url: path, // store the storage PATH; URLs are signed on read
      audio_file_size: file.size,
      ...(duration != null ? { duration_seconds: duration } : {}),
    })
    .eq('id', trackId)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

// DELETE — remove the audio file from a track.
export async function DELETE(_request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Audio upload is not available in demo mode' },
      { status: 400 }
    )
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: track } = await supabase
    .from('tracks')
    .select('id, audio_file_url')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  if (track.audio_file_url) {
    const service = createServiceClient()
    await service.storage.from(BUCKET).remove([track.audio_file_url])
  }

  const { error } = await supabase
    .from('tracks')
    .update({ audio_file_url: null, audio_file_size: null })
    .eq('id', trackId)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { ok: true } })
}
