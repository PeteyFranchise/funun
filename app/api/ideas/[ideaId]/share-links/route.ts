import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'

type RouteCtx = { params: Promise<{ ideaId: string }> }
const ShareSchema = z.object({
  permission: z.enum(['listen', 'comment', 'contribute']),
  expiresInDays: z.number().int().min(1).max(30).default(7),
}).strict()

export async function POST(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = ShareSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid private link.' }, { status: 400 })
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await createServiceClient().from('idea_share_links').insert({
    idea_id: ideaId, token_hash: tokenHash, permission: parsed.data.permission,
    created_by: user.id, expires_at: expiresAt,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create the private link.' }, { status: 409 })
  const origin = new URL(request.url).origin
  return NextResponse.json({ data: { id: data.id, url: `${origin}/ideas/join/${token}`, expiresAt } }, { status: 201 })
}

export async function DELETE(request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted || access.permission !== 'owner') return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const parsed = z.object({ id: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid private link.' }, { status: 400 })
  const { error } = await createServiceClient().from('idea_share_links')
    .update({ revoked_at: new Date().toISOString() }).eq('id', parsed.data.id).eq('idea_id', ideaId).eq('created_by', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  return NextResponse.json({ ok: true })
}
