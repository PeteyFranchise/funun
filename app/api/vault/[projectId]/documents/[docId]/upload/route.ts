import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { uploadSignedPdf } from '@/lib/vault/documents'

// POST /api/vault/[projectId]/documents/[docId]/upload
// Accepts a multipart PDF, stores it in the release-documents bucket,
// and atomically transitions the document to status='signed'.
// Uploading a PDF IS the signing action — no manual status override accepted.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; docId: string }> }
) {
  const { projectId, docId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Verify ownership before touching storage
  const { data: existing } = await supabase
    .from('vault_documents')
    .select('id, status')
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  let url: string
  try {
    const result = await uploadSignedPdf({ file, userId: user.id, projectId, docId })
    url = result.url
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    const isValidation = message.startsWith('Document must')
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }

  const { data: doc, error: updateError } = await supabase
    .from('vault_documents')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      file_url: url,
      signed_by: user.email ?? user.id,
    })
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: doc })
}
