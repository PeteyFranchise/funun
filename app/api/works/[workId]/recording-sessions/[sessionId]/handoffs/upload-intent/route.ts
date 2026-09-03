import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { BUCKET, MAX_BYTES } from '@/lib/catalogue/audio-mime'
import { buildProducerVocalPath } from '@/lib/catalogue/producer-handoff'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ workId: string; sessionId: string }> }

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId, sessionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })
  if (await checkRateLimit(`producer-handoff-intent:${user.id}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many producer handoffs. Please slow down.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as { size?: unknown } | null
  const size = typeof body?.size === 'number' ? body.size : Number.NaN
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: `The dry vocal must be between 1 byte and ${MAX_BYTES / (1024 * 1024)} MB.` }, { status: 400 })
  }
  const { data: session } = await supabase
    .from('work_recording_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('work_id', workId)
    .eq('created_by', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Recording session not found.' }, { status: 404 })

  const handoffId = randomUUID()
  let path: string
  try {
    path = buildProducerVocalPath(workId, sessionId, handoffId)
  } catch {
    return NextResponse.json({ error: 'Invalid producer handoff reference.' }, { status: 400 })
  }
  const service = createServiceClient()
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false })
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not prepare the dry vocal upload.' }, { status: 500 })
  return NextResponse.json({ data: { handoffId, path, token: data.token, contentType: 'audio/wav' } })
}
