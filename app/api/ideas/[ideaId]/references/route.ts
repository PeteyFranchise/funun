import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { ideaPermissionAllows } from '@/lib/ideas/schema'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const ReferenceSchema = z.object({
  kind: z.enum(['link', 'text', 'image']), value: z.string().trim().min(1).max(2000),
  label: z.string().max(200).nullable().optional(),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || !ideaPermissionAllows(access.permission, 'contribute')) return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = ReferenceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 })
  if ((parsed.data.kind === 'link' || parsed.data.kind === 'image')) {
    try {
      const url = new URL(parsed.data.value)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol')
    } catch {
      return NextResponse.json({ error: 'Use a valid http or https link.' }, { status: 400 })
    }
  }
  const { data, error } = await createServiceClient().from('idea_references').insert({
    idea_id: ideaId, created_by: user.id, kind: parsed.data.kind,
    value: parsed.data.value, label: parsed.data.label?.trim() || null,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not add the reference.' }, { status: 409 })
  return NextResponse.json({ data }, { status: 201 })
}
