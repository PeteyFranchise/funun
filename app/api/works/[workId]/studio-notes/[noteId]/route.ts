import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteContext = { params: Promise<{ workId: string; noteId: string }> }

const ResolutionSchema = z
  .object({
    source: z.enum(['song', 'audio', 'lyrics']),
    resolved: z.boolean(),
    versionId: z.string().uuid().nullable().optional(),
    blockId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === 'audio' && !value.versionId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Audio notes require a version.' })
    }
    if (value.source === 'lyrics' && !value.blockId) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Lyric notes require a section.' })
    }
  })

export async function PATCH(request: Request, { params }: RouteContext) {
  const { workId, noteId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`studio-note-resolution:${user.id}`, { maxAttempts: 120, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = ResolutionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid resolution request.' }, { status: 400 })
  }

  let result: { data: unknown; error: { message: string } | null }
  if (parsed.data.source === 'song') {
    result = await supabase.rpc('set_work_studio_note_resolution', {
      p_work_id: workId,
      p_note_id: noteId,
      p_resolved: parsed.data.resolved,
    })
  } else if (parsed.data.source === 'audio') {
    result = await supabase.rpc('set_work_version_comment_resolution', {
      p_work_id: workId,
      p_version_id: parsed.data.versionId!,
      p_comment_id: noteId,
      p_resolved: parsed.data.resolved,
    })
  } else {
    result = await supabase.rpc('set_work_lyric_block_comment_resolution', {
      p_work_id: workId,
      p_block_id: parsed.data.blockId!,
      p_comment_id: noteId,
      p_resolved: parsed.data.resolved,
    })
  }

  if (result.error || !result.data) {
    const message = result.error?.message ?? 'Could not update Studio Note'
    const status = message.includes('not_allowed') ? 403 : message.includes('not_found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
  return NextResponse.json({ data: result.data })
}
