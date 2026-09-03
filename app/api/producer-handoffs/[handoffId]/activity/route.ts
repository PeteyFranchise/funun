import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ handoffId: string }> }

const ActivitySchema = z.object({
  kind: z.enum(['listened', 'compared']),
  versionId: z.string().uuid().nullable().default(null),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { handoffId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`producer-handoff-activity:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many activity updates. Please slow down.' }, { status: 429 })
  }
  const parsed = ActivitySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid handoff activity.' }, { status: 400 })

  const { data: handoff } = await supabase
    .from('work_recording_handoffs')
    .select('id, work_id')
    .eq('id', handoffId)
    .maybeSingle()
  if (!handoff) return NextResponse.json({ error: 'Producer handoff not found.' }, { status: 404 })
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), handoff.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data, error } = await service.rpc('record_producer_handoff_activity', {
    p_handoff_id: handoffId,
    p_actor: user.id,
    p_kind: parsed.data.kind,
    p_version_id: parsed.data.versionId,
  })
  const activity = Array.isArray(data) ? data[0] : data
  if (error || !activity) return NextResponse.json({ error: error?.message ?? 'Could not save that room activity.' }, { status: 409 })
  return NextResponse.json({ data: activity })
}
