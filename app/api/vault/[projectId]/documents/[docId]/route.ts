import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { updateDemoDocument, deleteDemoDocument } from '@/lib/vault/demo-store'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const PATCHABLE_DOC_STATUSES = ['pending'] as const
type PatchableDocStatus = (typeof PATCHABLE_DOC_STATUSES)[number]

// PATCH /api/vault/[projectId]/documents/[docId] — reset signing status.
// Signed/verified states are earned only through upload, e-sign webhook, or
// verification routes that attach evidence.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; docId: string }> }
) {
  const { projectId, docId } = await params
  const body = (await request.json()) as Record<string, unknown>
  const status = body.status as PatchableDocStatus
  if (!PATCHABLE_DOC_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'Signed or verified documents must come from an uploaded PDF or verification flow' },
      { status: 400 }
    )
  }

  if (DEMO) {
    const project = await updateDemoDocument(projectId, docId, { status })
    if (!project) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_documents')
    .update({
      status,
      signed_at: status === 'pending' ? null : new Date().toISOString(),
    })
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/vault/[projectId]/documents/[docId]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; docId: string }> }
) {
  const { projectId, docId } = await params

  if (DEMO) {
    const project = await deleteDemoDocument(projectId, docId)
    if (!project) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    return NextResponse.json({ data: project })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('vault_documents')
    .delete()
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ data })
}
