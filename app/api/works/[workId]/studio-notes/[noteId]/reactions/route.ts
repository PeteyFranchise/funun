import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'

type RouteContext = { params: Promise<{ workId: string; noteId: string }> }

const ReactionSchema = z.object({
  source: z.enum(['song', 'audio', 'lyrics']),
  reaction: z.enum(['like', 'love', 'fire', 'heard', 'done', 'idea', 'laugh']),
}).strict()

export async function POST(request: Request, { params }: RouteContext) {
  const { workId, noteId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (await checkRateLimit(`studio-note-reaction:${user.id}`, { maxAttempts: 240, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many reactions. Please slow down.' }, { status: 429 })
  }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = ReactionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Studio Note reaction.' }, { status: 400 })

  const { data, error } = await supabase.rpc('toggle_work_note_reaction', {
    p_work_id: workId,
    p_source: parsed.data.source,
    p_note_id: noteId,
    p_reaction: parsed.data.reaction,
  })
  if (error || !data) {
    const message = error?.message ?? 'Could not update reaction'
    return NextResponse.json({ error: message }, { status: message.includes('not_found') ? 404 : 500 })
  }
  return NextResponse.json({ data })
}
