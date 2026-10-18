import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  DOC_LINK_TTL_SECONDS,
  isMissingObjectError,
  isSafeObjectPath,
  vaultDocumentBucket,
} from '@/lib/vault/documents'

// GET /api/vault/[projectId]/documents/[docId]/file
// Redirects to a short-lived signed URL for a vault document's PDF.
//
// Reads are authorized by vault_documents RLS: the row is fetched with the
// SESSION client, so only a caller the policies let see the row gets a link.
// The rule is not re-derived here (no extra user_id filter) because a second
// copy of the owner/co-owner rule is how the route and the policy drift apart.
// The service client is used only to sign. Links live 10 minutes because the
// card opens them on click.
//
// file_url holds a storage path (see migration 245), and only the service role
// can write it. As defense in depth the route still refuses a legacy http(s)
// value (it would turn a stored string into an open redirect) and any path that
// is empty, absolute, or has a '..', empty or backslash segment.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; docId: string }> }
) {
  const { projectId, docId } = await params
  const uuid = z.string().uuid()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(docId).success) {
    return NextResponse.json({ error: 'Invalid document' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row, error } = await supabase
    .from('vault_documents')
    .select('id, source, file_url')
    .eq('id', docId)
    .eq('project_id', projectId)
    .maybeSingle()

  const path = row?.file_url
  if (error || !row || !path || /^https?:\/\//i.test(path) || !isSafeObjectPath(path)) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const signed = await createServiceClient()
    .storage.from(vaultDocumentBucket(row.source))
    .createSignedUrl(path, DOC_LINK_TTL_SECONDS)
  if (signed.error && isMissingObjectError(signed.error)) {
    // The row points at an object that is gone (deleted, never finished).
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  if (signed.error || !signed.data) {
    return NextResponse.json({ error: 'Document unavailable' }, { status: 500 })
  }

  const res = NextResponse.redirect(signed.data.signedUrl, 302)
  res.headers.set('Cache-Control', 'no-store')
  return res
}
