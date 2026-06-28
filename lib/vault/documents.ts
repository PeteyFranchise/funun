// ─── Vault Documents — types, constants, and upload helper ───────────────────
// Handles PDF upload for upload-backed signing flow.
// The upload route (POST /api/vault/[projectId]/documents/[docId]/upload)
// calls uploadSignedPdf() after auth/ownership checks are confirmed.

import { createApiClient } from '@/lib/supabase/server'
import { DOC_BUCKET as _DOC_BUCKET } from '@/lib/storage'

// ─── Constants ───────────────────────────────────────────────────────────────

export const DOC_BUCKET = _DOC_BUCKET

export const MAX_DOC_SIZE = 5 * 1024 * 1024 // 5MB

export const ALLOWED_DOC_TYPES = ['application/pdf'] as const

// ─── Types ───────────────────────────────────────────────────────────────────

export type VaultDocument = {
  id: string
  project_id: string
  track_id: string | null
  user_id: string
  type: string
  status: 'pending' | 'signed' | 'verified'
  document_data: Record<string, unknown> | null
  signed_at: string | null
  file_url: string | null
  signed_by: string | null
  created_at: string
}

// ─── Upload helper ────────────────────────────────────────────────────────────

/**
 * Validates and uploads a signed PDF to the release-documents storage bucket.
 * Validates MIME type and size before any storage write.
 * Returns the public URL and storage path on success.
 *
 * Auth is the caller's responsibility — this function handles storage only.
 */
export async function uploadSignedPdf(params: {
  file: File
  userId: string
  projectId: string
  docId: string
}): Promise<{ url: string; path: string }> {
  if (params.file.type !== 'application/pdf') {
    throw new Error('Document must be a PDF file')
  }
  if (params.file.size > MAX_DOC_SIZE) {
    throw new Error('Document must be under 5MB')
  }

  const path = `${params.userId}/${params.projectId}/${params.docId}-${Date.now()}.pdf`
  const supabase = createApiClient()

  const { error } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, params.file, { upsert: true, contentType: 'application/pdf' })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const {
    data: { publicUrl },
  } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path)

  return { url: publicUrl, path }
}
