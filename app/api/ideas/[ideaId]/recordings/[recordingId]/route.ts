import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { ideaPermissionAllows } from '@/lib/ideas/schema'

type RouteCtx = { params: Promise<{ ideaId: string; recordingId: string }> }

const PatchSchema = z.object({
  label: z.string().max(200).nullable().optional(),
  kind: z.enum(['voice', 'melody', 'lyric', 'rhythm', 'harmony', 'reference', 'import']).optional(),
  rating: z.enum(['keep', 'maybe']).nullable().optional(),
  archived: z.boolean().optional(),
}).strict()

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { ideaId, recordingId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || !ideaPermissionAllows(access.permission, 'contribute')) {
    return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  }
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid recording update.' }, { status: 400 })
  const service = createServiceClient()
  const { data: recording } = await service.from('idea_recordings')
    .select('id, created_by').eq('id', recordingId).eq('idea_id', ideaId).maybeSingle()
  if (!recording || (access.permission !== 'owner' && recording.created_by !== user.id)) {
    return NextResponse.json({ error: 'Recording not found.' }, { status: 404 })
  }
  const update: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) update.label = parsed.data.label?.trim() || null
  if (parsed.data.kind !== undefined) update.kind = parsed.data.kind
  if (parsed.data.rating !== undefined) update.rating = parsed.data.rating
  if (parsed.data.archived !== undefined) update.archived_at = parsed.data.archived ? new Date().toISOString() : null
  const { data, error } = await service.from('idea_recordings').update(update)
    .eq('id', recordingId).eq('idea_id', ideaId).select().single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update the recording.' }, { status: 409 })
  return NextResponse.json({ data })
}
