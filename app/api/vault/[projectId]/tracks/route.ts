import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { addDemoTrack } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/vault/[projectId]/tracks — add a track to a project.
// Metadata only for now (title, ISRC); audio file upload comes later.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = await request.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const isrc = typeof body.isrc === 'string' && body.isrc.trim() ? body.isrc.trim() : null

  if (!title) {
    return NextResponse.json({ error: 'Track title is required' }, { status: 400 })
  }

  if (DEMO) {
    const project = await addDemoTrack(projectId, { title, isrc })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the project belongs to this user (RLS also enforces this).
  const { data: project } = await supabase
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Next track number = current max + 1.
  const { data: existing } = await supabase
    .from('tracks')
    .select('track_number')
    .eq('project_id', projectId)
    .order('track_number', { ascending: false })
    .limit(1)
  const nextNumber = (existing?.[0]?.track_number ?? 0) + 1

  const { data, error } = await supabase
    .from('tracks')
    .insert({
      user_id: user.id,
      project_id: projectId,
      title,
      track_number: nextNumber,
      isrc,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
