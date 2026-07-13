import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { addDemoDocument } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const DOC_TYPES = [
  'split_sheet',
  'copyright_registration',
  'hire_right',
  'sample_clearance',
  'distribution_agreement',
] as const

// GET /api/vault/[projectId]/documents — list documents for a project.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (DEMO) {
    return NextResponse.json({ data: [] })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_documents')
    .select('id, type, status, track_id, document_data, signed_at, created_at')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/vault/[projectId]/documents — add a document record.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = (await request.json()) as Record<string, unknown>
  const type = String(body.type ?? '')
  const requestedStatus = typeof body.status === 'string' ? body.status : 'pending'

  if (!DOC_TYPES.includes(type as (typeof DOC_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
  }
  if (requestedStatus !== 'pending') {
    return NextResponse.json(
      { error: 'Signed or verified documents must come from an uploaded PDF or verification flow' },
      { status: 400 }
    )
  }

  if (DEMO) {
    const project = await addDemoDocument(projectId, { type, status: 'pending' })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('vault_documents')
    .insert({
      user_id: user.id,
      project_id: projectId,
      type,
      status: 'pending',
      signed_at: null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
