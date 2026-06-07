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
const DOC_STATUSES = ['pending', 'signed', 'verified'] as const
type DocStatus = (typeof DOC_STATUSES)[number]

// POST /api/vault/[projectId]/documents — add a document record.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = (await request.json()) as Record<string, unknown>
  const type = String(body.type ?? '')
  const status = (DOC_STATUSES.includes(body.status as DocStatus)
    ? body.status
    : 'pending') as DocStatus

  if (!DOC_TYPES.includes(type as (typeof DOC_TYPES)[number])) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
  }

  if (DEMO) {
    const project = await addDemoDocument(projectId, { type, status })
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
      status,
      signed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
