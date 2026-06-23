import { createApiClient } from '@/lib/supabase/server'

type RouteCtx = { params: Promise<{ projectId: string }> }

// GET — download every track's lyrics for a project as one plain-text file,
// for sharing with collaborators, press, and promo. Owner-only.
export async function GET(_request: Request, { params }: RouteCtx) {
  const { projectId } = await params
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select('title')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return new Response('Not found', { status: 404 })

  const { data: tracks } = await supabase
    .from('tracks')
    .select('title, track_number, lyrics')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('track_number', { ascending: true })

  const blocks = (tracks ?? []).map((t, i) => {
    const n = t.track_number ?? i + 1
    const title = t.title || `Track ${n}`
    const heading = `${n}. ${title}`
    const body = (t.lyrics ?? '').trim() || '(no lyrics yet)'
    return `${heading}\n${'─'.repeat(Math.max(heading.length, 8))}\n${body}`
  })

  const text = `${project.title} — Lyrics\n\n${blocks.join('\n\n\n')}\n`
  const safe =
    project.title.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'lyrics'

  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}-lyrics.txt"`,
    },
  })
}
