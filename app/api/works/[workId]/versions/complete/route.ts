import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, buildVersionPath, resolveAudioType } from '@/lib/catalogue/audio'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { PerformerRef, WorkVersionSource } from '@/types/catalogue'

type RouteCtx = { params: Promise<{ workId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function sourceOf(value: unknown): WorkVersionSource | null {
  return value === 'hum' || value === 'upload' ? value : null
}

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-version-complete:${user.id}`, { maxAttempts: 40, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many uploads. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const body = (await request.json().catch(() => null)) as {
    versionId?: unknown
    path?: unknown
    source?: unknown
    duration?: unknown
    label?: unknown
  } | null
  const versionId = typeof body?.versionId === 'string' ? body.versionId : ''
  const path = typeof body?.path === 'string' ? body.path : ''
  const source = sourceOf(body?.source)
  const pathType = resolveAudioType('', path)

  if (!UUID.test(versionId) || !source || !pathType || path !== buildVersionPath(workId, versionId, pathType.ext)) {
    return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 })
  }

  // A completion retry after a lost response should return the version it
  // already created, never delete its valid object or duplicate the diary.
  const { data: existing } = await supabase
    .from('work_versions')
    .select('*')
    .eq('id', versionId)
    .eq('work_id', workId)
    .maybeSingle()
  if (existing) return NextResponse.json({ data: existing })

  const service = createServiceClient()
  const { data: stored, error: infoError } = await service.storage.from(BUCKET).info(path)
  if (infoError || !stored) {
    return NextResponse.json({ error: 'Audio upload has not finished. Please try again.' }, { status: 409 })
  }

  const storedSize = stored.size ?? 0
  const storedType = resolveAudioType(stored.contentType ?? '', path)
  if (!storedType || storedType.ext !== pathType.ext || storedSize <= 0 || storedSize > MAX_BYTES) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json(
      { error: storedSize <= 0 ? 'No audio was captured.' : 'The stored audio file is invalid.' },
      { status: 400 }
    )
  }

  const { data: work } = await supabase
    .from('works')
    .select('vocal_state, primary_performer')
    .eq('id', workId)
    .maybeSingle()
  if (!work) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: 'Work not found' }, { status: 404 })
  }

  const performers: PerformerRef[] =
    work.vocal_state === 'primary' && work.primary_performer
      ? [work.primary_performer as PerformerRef]
      : []
  const durationRaw = body?.duration
  const durationNumber =
    typeof durationRaw === 'number'
      ? durationRaw
      : typeof durationRaw === 'string' && durationRaw.trim()
        ? Number(durationRaw)
        : Number.NaN
  const duration = Number.isFinite(durationNumber) && durationNumber >= 0 ? Math.round(durationNumber) : null
  const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 200) : null

  const { data: inserted, error: insertError } = await supabase
    .from('work_versions')
    .insert({
      id: versionId,
      work_id: workId,
      user_id: user.id,
      source,
      audio_path: path,
      audio_ext: pathType.ext,
      audio_size: storedSize,
      duration_seconds: duration,
      label,
      performers,
    })
    .select()
    .single()

  if (insertError || !inserted) {
    await service.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: insertError?.message ?? 'Could not save the version' }, { status: 500 })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}
