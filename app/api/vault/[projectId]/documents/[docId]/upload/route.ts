import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { parseAdmittedFormData } from '@/lib/security/upload-admission'
import {
  MAX_DOC_SIZE,
  isSafeObjectPath,
  uploadSignedPdf,
  vaultDocumentBucket,
} from '@/lib/vault/documents'

// POST /api/vault/[projectId]/documents/[docId]/upload
// Accepts a multipart PDF, stores it in the private bucket that matches the
// document's source (vault-contracts for 'uploaded', release-documents
// otherwise), and atomically transitions the document to status='signed'.
// vault_documents.file_url receives the storage path, never a URL; readers go
// through GET .../documents/[docId]/file, which issues a signed link.
// Migration 245 lets only the service role write file_url, so the row update
// uses the service client; the session-client ownership check below runs first
// and the update repeats its id, project_id and user_id filters.
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

  // Verify ownership before touching storage
  const { data: existing } = await supabase
    .from('vault_documents')
    .select('id, status, source, file_url')
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const parsed = await parseAdmittedFormData(supabase, request, {
    operation: 'vault:signed-document',
    maxBodyBytes: MAX_DOC_SIZE + 512 * 1024,
    dailyCountLimit: 30,
    dailyByteLimit: 100 * 1024 * 1024,
  })
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const file = parsed.form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const bucket = vaultDocumentBucket(existing.source)
  const service = createServiceClient()

  let path: string
  try {
    const result = await uploadSignedPdf({
      file,
      userId: user.id,
      projectId,
      docId,
      bucket,
    })
    path = result.path
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    const isValidation = message.startsWith('Document must')
    return NextResponse.json(
      { error: isValidation ? message : 'Document upload failed.' },
      { status: isValidation ? 400 : 500 }
    )
  }

  const { data: doc, error: updateError } = await service
    .from('vault_documents')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      file_url: path,
      signed_by: user.email ?? user.id,
    })
    .eq('id', docId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (updateError || !doc) {
    // The row did not take the new path, so the object just stored is orphaned.
    await removeBestEffort(service, bucket, path)
    return NextResponse.json({ error: 'Document status could not be saved.' }, { status: 500 })
  }

  // A replaced upload leaves the previous object behind. Remove it only when
  // this route wrote it for this document: split-sheet fan-out rows share one
  // executed PDF across every party's row, and that object must survive.
  const previous = existing.file_url
  if (
    previous &&
    previous !== path &&
    previous.startsWith(`${user.id}/${projectId}/${docId}-`) &&
    isSafeObjectPath(previous)
  ) {
    await removeBestEffort(service, bucket, previous)
  }

  return NextResponse.json({ data: doc })
}

/**
 * Removes one object and never throws or fails the request. A failure is
 * reported to Sentry without the path: object paths carry user and project ids.
 */
async function removeBestEffort(
  service: ReturnType<typeof createServiceClient>,
  bucket: string,
  objectPath: string
) {
  let failed = false
  try {
    const { error } = await service.storage.from(bucket).remove([objectPath])
    failed = Boolean(error)
  } catch {
    failed = true
  }
  if (failed) {
    Sentry.captureException(new Error('vault document: could not remove an orphaned object'), {
      tags: { feature: 'vault-documents', operation: 'object-cleanup' },
    })
  }
}
