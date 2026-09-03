import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteCtx = { params: Promise<{ returnId: string }> }

const ReviewSchema = z.object({
  outcome: z.enum(['made_working', 'kept_current']),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { returnId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`producer-return-review:${user.id}`, { maxAttempts: 40, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many review attempts. Please slow down.' }, { status: 429 })
  }

  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid review outcome.' }, { status: 400 })

  // The caller's client deliberately resolves the return first: migration
  // 166's RLS hides it unless they still belong to this Writer's Room.
  const { data: returned } = await supabase
    .from('work_recording_handoff_returns')
    .select('id, work_id, version_id')
    .eq('id', returnId)
    .maybeSingle()
  if (!returned) return NextResponse.json({ error: 'Producer return not found.' }, { status: 404 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), returned.work_id, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data, error } = await service.rpc('review_producer_mix_return', {
    p_return_id: returnId,
    p_reviewer: user.id,
    p_outcome: parsed.data.outcome,
  })
  const review = Array.isArray(data) ? data[0] : data
  if (error || !review) {
    return NextResponse.json({ error: error?.message ?? 'Could not save the returned-mix review.' }, { status: 409 })
  }

  return NextResponse.json({ data: review })
}
