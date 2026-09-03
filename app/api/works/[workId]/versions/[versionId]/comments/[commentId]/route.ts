import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteContext = {
  params: Promise<{ workId: string; versionId: string; commentId: string }>
}

const ResolutionSchema = z.object({ resolved: z.boolean() }).strict()

export async function PATCH(request: Request, { params }: RouteContext) {
  const { workId, versionId, commentId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`work-version-comment-resolution:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = ResolutionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid resolution request.' }, { status: 400 })

  const { data: comment, error: commentError } = await supabase
    .from('work_version_comments')
    .select('id')
    .eq('id', commentId)
    .eq('work_id', workId)
    .eq('version_id', versionId)
    .maybeSingle()
  if (commentError) return NextResponse.json({ error: commentError.message }, { status: 500 })
  if (!comment) return NextResponse.json({ error: 'Timed comment not found.' }, { status: 404 })

  const { data, error } = await supabase.rpc('set_work_version_comment_resolution', {
    p_work_id: workId,
    p_version_id: versionId,
    p_comment_id: commentId,
    p_resolved: parsed.data.resolved,
  })
  if (error || !data) {
    const message = error?.message ?? 'Could not update timed comment'
    const status = message.includes('comment_resolution_not_allowed')
      ? 403
      : message.includes('comment_reply_not_resolvable')
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json({ data })
}
