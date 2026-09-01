import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES, buildVersionPath, resolveAudioType } from '@/lib/catalogue/audio'
import { checkRateLimit } from '@/lib/security/rate-limit'
import type { WorkVersionSource } from '@/types/catalogue'

type RouteCtx = { params: Promise<{ workId: string }> }

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

  if (await checkRateLimit(`work-version-intent:${user.id}`, { maxAttempts: 40, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many uploads. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const body = (await request.json().catch(() => null)) as {
    fileName?: unknown
    mimeType?: unknown
    size?: unknown
    source?: unknown
  } | null
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim().slice(0, 255) : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : ''
  const size = typeof body?.size === 'number' ? body.size : Number.NaN
  const source = sourceOf(body?.source)

  if (!source) {
    return NextResponse.json({ error: 'source must be "hum" or "upload"' }, { status: 400 })
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    return NextResponse.json({ error: 'The audio file is empty.' }, { status: 400 })
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Audio exceeds the ${MAX_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 }
    )
  }

  const audioType = resolveAudioType(mimeType, fileName)
  if (!audioType) {
    return NextResponse.json(
      { error: 'Unsupported audio format — use WebM, MP4/AAC, MP3, WAV, FLAC or OGG' },
      { status: 400 }
    )
  }

  const versionId = randomUUID()
  const path = buildVersionPath(workId, versionId, audioType.ext)
  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not prepare upload' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      versionId,
      path,
      token: data.token,
      contentType: audioType.contentType,
    },
  })
}
