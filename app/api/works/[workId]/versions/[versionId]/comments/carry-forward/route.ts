import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteContext = { params: Promise<{ workId: string; versionId: string }> }

const CarrySchema = z.object({
  sourceCommentIds: z.array(z.string().uuid()).max(100),
}).strict()

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, versionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-version-comment-carry:${user.id}`, { maxAttempts: 30, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = CarrySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose valid unresolved comments to carry.' }, { status: 400 })

  const { data, error } = await supabase.rpc('review_work_version_comment_carry', {
    p_work_id: workId,
    p_target_version_id: versionId,
    p_source_comment_ids: parsed.data.sourceCommentIds,
  })
  if (error || !data) {
    const message = error?.message ?? 'Could not save the carry-forward choice'
    const status = message.includes('duplicate key') ? 409 : message.includes('invalid_comments') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json({ data })
}
