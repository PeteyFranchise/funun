import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

type RouteCtx = { params: Promise<{ token: string }> }

export async function POST(_request: Request, { params }: RouteCtx) {
  const { token } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to accept this private idea invitation.' }, { status: 401 })
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return NextResponse.json({ error: 'This invitation is invalid.' }, { status: 400 })
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const service = createServiceClient()
  const { data: viewerProfile } = await service.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!viewerProfile) return NextResponse.json({ error: 'Idea invitations are for User Accounts only.' }, { status: 403 })
  const { data, error } = await service.rpc('claim_idea_share_link', { p_token_hash: tokenHash, p_user: user.id })
  const claim = Array.isArray(data) ? data[0] : data
  if (error || !claim?.claimed_idea_id) {
    return NextResponse.json({ error: 'This invitation has expired or is no longer available.' }, { status: 410 })
  }
  if (claim.inviter_user_id === user.id) return NextResponse.json({ data: { ideaId: claim.claimed_idea_id } })
  const [{ data: idea }, { data: profile }] = await Promise.all([
    service.from('ideas').select('title').eq('id', claim.claimed_idea_id).single(),
    service.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
  ])
  const actorName = profile?.artist_name || profile?.handle || 'A collaborator'
  await createNotification(service, {
    userId: claim.inviter_user_id, type: 'idea_invite_accepted', title: `${actorName} joined your idea`,
    body: idea?.title ?? 'Private idea', link: `/ideas?idea=${claim.claimed_idea_id}`,
    data: { ideaId: claim.claimed_idea_id }, actorId: user.id, actorName, actorAvatarUrl: profile?.avatar_url ?? null,
  })
  return NextResponse.json({ data: { ideaId: claim.claimed_idea_id } })
}
