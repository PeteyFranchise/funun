import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { automaticIdeaTitle, normalizeIdeaMoods, normalizeIdeaTitle, IDEA_NOTE_MAX } from '@/lib/ideas/schema'
import { checkRateLimit } from '@/lib/security/rate-limit'

const CreateIdeaSchema = z.object({
  title: z.string().max(200).optional(),
  note: z.string().max(IDEA_NOTE_MAX).nullable().optional(),
  moods: z.array(z.string().max(80)).max(20).optional(),
  parentIdeaId: z.string().uuid().nullable().optional(),
}).strict()

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await checkRateLimit(`idea-create:${user.id}`, { maxAttempts: 60, windowMs: 15 * 60 * 1000 })) {
    return NextResponse.json({ error: 'Too many new ideas. Please slow down.' }, { status: 429 })
  }
  const parsed = CreateIdeaSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid idea.' }, { status: 400 })
  const fallback = automaticIdeaTitle(new Date())
  const service = createServiceClient()
  const { data: profile } = await service.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Ideas are available to User Accounts only.' }, { status: 403 })
  if (parsed.data.parentIdeaId) {
    const { data: parent } = await service.from('ideas').select('id, user_id').eq('id', parsed.data.parentIdeaId).maybeSingle()
    if (!parent || parent.user_id !== user.id) return NextResponse.json({ error: 'Source idea not found.' }, { status: 404 })
  }
  const { data, error } = await service.from('ideas').insert({
    user_id: user.id,
    title: normalizeIdeaTitle(parsed.data.title ?? '', fallback),
    note: parsed.data.note?.trim() || null,
    moods: normalizeIdeaMoods(parsed.data.moods),
    parent_idea_id: parsed.data.parentIdeaId ?? null,
  }).select('id, title').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create the idea.' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
