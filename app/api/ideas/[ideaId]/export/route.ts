import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { resolveIdeaAccess } from '@/lib/ideas/access'
import { safeIdeaDownloadName } from '@/lib/ideas/schema'

type RouteCtx = { params: Promise<{ ideaId: string }> }

export async function GET(_request: Request, { params }: RouteCtx) {
  const { ideaId } = await params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await resolveIdeaAccess(supabase, ideaId, user.id)
  if (!access.granted) return NextResponse.json({ error: 'Idea not found.' }, { status: 404 })
  const service = createServiceClient()
  const [{ data: idea }, { data: recordings }, { data: markers }, { data: comments }, { data: references }, { data: members }] = await Promise.all([
    service.from('ideas').select('*').eq('id', ideaId).single(),
    service.from('idea_recordings').select('*').eq('idea_id', ideaId).order('captured_at'),
    service.from('idea_markers').select('*').eq('idea_id', ideaId).order('timestamp_ms'),
    service.from('idea_comments').select('*').eq('idea_id', ideaId).order('created_at'),
    service.from('idea_references').select('*').eq('idea_id', ideaId).order('created_at'),
    service.from('idea_members').select('user_id, permission, created_at').eq('idea_id', ideaId),
  ])
  const manifest = {
    format: 'funun-idea-manifest', version: 1, exportedAt: new Date().toISOString(),
    rightsNotice: 'This archive records provenance only. It does not assign authorship, ownership, splits, publishing, approvals, or other rights.',
    idea, recordings, markers, comments, references, members,
  }
  const fileName = safeIdeaDownloadName(idea?.title ?? 'idea', { label: 'manifest', audioExt: 'json' }).replace(/\.json\.json$/, '.json')
  return new NextResponse(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName}"` },
  })
}
