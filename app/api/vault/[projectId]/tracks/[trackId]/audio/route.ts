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

type Role = 'master' | 'share'
const roleOf = (v: unknown): Role => (v === 'master' ? 'master' : 'share')

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

  const form = await request.formData()
  const file = form.get('file')
  const role = roleOf(form.get('role'))
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
    .select('id, audio_file_url, metadata')
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const service = createServiceClient()
  const metadata = (track.metadata as Record<string, unknown> | null) ?? {}
  const existingMaster = (metadata.master as { path?: string } | undefined)?.path ?? null

  // Stable, role-specific path so re-uploads overwrite rather than orphan.
  const path =
    role === 'master'
      ? `${user.id}/${projectId}/${trackId}.master.${ext}`
      : `${user.id}/${projectId}/${trackId}.${ext}`

  // If the extension changed, drop the previous object so it doesn't linger.
  const prev = role === 'master' ? existingMaster : track.audio_file_url
  if (prev && prev !== path) {
    await service.storage.from(BUCKET).remove([prev])
  }

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  let update: Record<string, unknown>
  if (role === 'master') {
    update = { metadata: { ...metadata, master: { path, size: file.size, ext } } }
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

  return NextResponse.json({ data: updated })
}

// DELETE — remove a track's audio. `?role=master` removes the master WAV;
// default removes the share/MP3.
export async function DELETE(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json({ error: 'Audio upload is not available in demo mode' }, { status: 400 })
  }

  const role: Role = new URL(request.url).searchParams.get('role') === 'master' ? 'master' : 'share'

  const supabase = createApiClient()
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
    if (masterPath) await service.storage.from(BUCKET).remove([masterPath])
    const nextMeta: Record<string, unknown> = { ...metadata }
    delete nextMeta.master
    const { error } = await supabase
      .from('tracks')
      .update({ metadata: nextMeta })
      .eq('id', trackId)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (track.audio_file_url) await service.storage.from(BUCKET).remove([track.audio_file_url])
    const { error } = await supabase
      .from('tracks')
      .update({ audio_file_url: null, audio_file_size: null })
      .eq('id', trackId)
      .eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ok: true } })
}
