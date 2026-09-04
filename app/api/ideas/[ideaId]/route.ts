import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { IDEA_NOTE_MAX, IDEA_TRANSCRIPT_MAX, normalizeIdeaMoods, normalizeIdeaTitle } from '@/lib/ideas/schema'

type RouteCtx = { params: Promise<{ ideaId: string }> }

const PatchIdeaSchema = z.object({
  title: z.string().max(200).optional(),
  note: z.string().max(IDEA_NOTE_MAX).nullable().optional(),
  transcript: z.string().max(IDEA_TRANSCRIPT_MAX).nullable().optional(),
  moods: z.array(z.string().max(80)).max(20).optional(),
  pinned: z.boolean().optional(),
  state: z.enum(['active', 'snoozed', 'archived']).optional(),
  snoozedUntil: z.string().datetime().nullable().optional(),
}).strict()

export async function PATCH(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = PatchIdeaSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid idea update.' }, { status: 400 })
  const input = parsed.data
  const update: Record<string, unknown> = {}
  if (input.title !== undefined) update.title = normalizeIdeaTitle(input.title, 'Untitled idea')
  if (input.note !== undefined) update.note = input.note?.trim() || null
  if (input.transcript !== undefined) update.transcript = input.transcript?.trim() || null
  if (input.moods !== undefined) update.moods = normalizeIdeaMoods(input.moods)
  if (input.pinned !== undefined) update.pinned = input.pinned
  if (input.state !== undefined) update.state = input.state
  if (input.snoozedUntil !== undefined) update.snoozed_until = input.snoozedUntil
  if (input.state === 'active' || input.state === 'archived') update.snoozed_until = null
  if (input.state === 'snoozed' && !input.snoozedUntil) {
    update.snoozed_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
  const { data, error } = await createServiceClient().from('ideas').update(update).eq('id', ideaId).eq('user_id', user.id).select().single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update the idea.' }, { status: 409 })
  return NextResponse.json({ data })
}
