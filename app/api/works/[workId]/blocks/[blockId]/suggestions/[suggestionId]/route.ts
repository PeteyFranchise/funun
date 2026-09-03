import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { lyricSuggestionErrorStatus } from '@/lib/catalogue/lyric-suggestions'

type RouteContext = {
  params: Promise<{ workId: string; blockId: string; suggestionId: string }>
}

const DecisionSchema = z.object({ action: z.enum(['accept', 'decline']) }).strict()

export async function PATCH(request: Request, { params }: RouteContext) {
  const { workId, blockId, suggestionId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = DecisionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose accept or decline.' }, { status: 400 })

  const { data, error } = await supabase.rpc('decide_work_lyric_block_suggestion', {
    p_work_id: workId,
    p_block_id: blockId,
    p_suggestion_id: suggestionId,
    p_action: parsed.data.action,
  })
  if (error || !data) {
    const message = error?.message ?? 'Could not update lyric suggestion.'
    return NextResponse.json({ error: message }, { status: lyricSuggestionErrorStatus(message) })
  }

  return NextResponse.json({ data })
}
