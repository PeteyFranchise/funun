import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import {
  LYRIC_LIFT_MAX_BYTES,
  LYRIC_LIFT_SUPPORTED_EXTENSIONS,
} from '@/lib/catalogue/lyric-lift'
import { loadLyricLiftView } from '@/lib/catalogue/lyric-lift-service'
import { queueLyricLift } from '@/lib/catalogue/lyric-lift-queue'
import { checkRateLimit } from '@/lib/security/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 300

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Lyric Lift is not configured yet. Add OPENAI_API_KEY to the server environment.' },
      { status: 503 }
    )
  }
  if (await checkRateLimit(`lyric-lift:${user.id}`, { maxAttempts: 12, windowMs: 24 * 60 * 60 * 1000 })) {
    return NextResponse.json({ error: 'You have started several lyric transcriptions today. Try again tomorrow.' }, { status: 429 })
  }

  const { data: version, error: versionError } = await supabase
    .from('work_versions')
    .select('id, audio_size, audio_ext')
    .eq('id', versionId)
    .eq('work_id', workId)
    .is('archived_at', null)
    .maybeSingle()
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 })
  if (!version) return NextResponse.json({ error: 'Recording not found in this Writer’s Room.' }, { status: 404 })

  const size = Number(version.audio_size ?? 0)
  if (size <= 0 || size > LYRIC_LIFT_MAX_BYTES) {
    return NextResponse.json(
      { error: 'For now, Lyric Lift accepts recordings under 25 MB. Export this mix as an MP3 or M4A and try again.' },
      { status: 400 }
    )
  }
  if (!LYRIC_LIFT_SUPPORTED_EXTENSIONS.has(version.audio_ext)) {
    return NextResponse.json(
      { error: 'Lyric Lift supports MP3, M4A, WAV, FLAC, OGG, and WebM recordings.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data: existing, error: existingError } = await service
    .from('work_lyric_lifts')
    .select('id, version_id')
    .eq('work_id', workId)
    .in('status', ['queued', 'processing', 'review'])
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing) {
    if (existing.version_id !== versionId) {
      return NextResponse.json(
        { error: 'Finish, apply, or discard the current lyric draft before pulling lyrics from another take.' },
        { status: 409 }
      )
    }
    const view = await loadLyricLiftView(service, { workId, liftId: existing.id })
    return NextResponse.json({ data: view })
  }

  const { data: lift, error: insertError } = await service
    .from('work_lyric_lifts')
    .insert({ work_id: workId, version_id: versionId, requested_by: user.id, status: 'queued' })
    .select('id')
    .single()
  if (insertError || !lift) {
    if (insertError?.code === '23505') {
      const { data: raced } = await service
        .from('work_lyric_lifts')
        .select('id, version_id')
        .eq('work_id', workId)
        .in('status', ['queued', 'processing', 'review'])
        .maybeSingle()
      if (raced) {
        if (raced.version_id !== versionId) {
          return NextResponse.json(
            { error: 'Finish, apply, or discard the current lyric draft before pulling lyrics from another take.' },
            { status: 409 }
          )
        }
        const view = await loadLyricLiftView(service, { workId, liftId: raced.id })
        return NextResponse.json({ data: view })
      }
    }
    return NextResponse.json({ error: insertError?.message ?? 'Could not start Lyric Lift.' }, { status: 500 })
  }

  const job = await queueLyricLift(lift.id)
  if (!job) {
    await service
      .from('work_lyric_lifts')
      .update({ status: 'failed', error_message: 'The transcription queue is unavailable. Try again.' })
      .eq('id', lift.id)
    return NextResponse.json({ error: 'The transcription queue is unavailable. Try again.' }, { status: 503 })
  }
  await service.from('work_lyric_lifts').update({ job_id: job.id }).eq('id', lift.id)
  const view = await loadLyricLiftView(service, { workId, liftId: lift.id })
  return NextResponse.json({ data: view }, { status: 202 })
}
