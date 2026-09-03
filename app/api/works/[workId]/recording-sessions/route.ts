import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ workId: string }> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`recording-session:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many recording sessions. Please slow down.' }, { status: 429 })
  }

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const body = (await request.json().catch(() => null)) as { baseVersionId?: unknown } | null
  const baseVersionId = typeof body?.baseVersionId === 'string' ? body.baseVersionId : ''
  if (!UUID.test(baseVersionId)) return NextResponse.json({ error: 'Choose a valid backing take.' }, { status: 400 })

  const { data: version } = await supabase
    .from('work_versions')
    .select('id')
    .eq('id', baseVersionId)
    .eq('work_id', workId)
    .maybeSingle()
  if (!version) return NextResponse.json({ error: 'Backing take not found.' }, { status: 404 })

  const { data, error } = await supabase
    .from('work_recording_sessions')
    .insert({ work_id: workId, base_version_id: baseVersionId, created_by: user.id })
    .select('id')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not start the recording session.' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
