// ─── Vault Documents — types, constants, and upload helper ───────────────────
// Handles PDF upload for upload-backed signing flow.
// The upload route (POST /api/vault/[projectId]/documents/[docId]/upload)
// calls uploadSignedPdf() after auth/ownership checks are confirmed.

import { createServiceClient } from '@/lib/supabase/server'
import { DOC_BUCKET as _DOC_BUCKET } from '@/lib/storage'

// ─── Constants ───────────────────────────────────────────────────────────────

export const DOC_BUCKET = _DOC_BUCKET

// Private bucket for Contract Locker files (migration 011).
export const CONTRACT_BUCKET = 'vault-contracts'

// Lifetime of the signed links issued by GET /api/vault/[projectId]/documents/[docId]/file.
export const DOC_LINK_TTL_SECONDS = 600

export const MAX_DOC_SIZE = 5 * 1024 * 1024 // 5MB

export const ALLOWED_DOC_TYPES = ['application/pdf'] as const

// "%PDF-" - every PDF starts with these five bytes.
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]

// ─── Types ───────────────────────────────────────────────────────────────────

export type VaultDocument = {
  id: string
  project_id: string
  track_id: string | null
  user_id: string
  type: string
  status: 'pending' | 'signed' | 'verified'
  source: 'generated' | 'uploaded'
  document_data: Record<string, unknown> | null
  signed_at: string | null
  // Storage object path, not a URL (see migration 245). Bucket: vaultDocumentBucket(source).
  file_url: string | null
  signed_by: string | null
  created_at: string
}

// ─── Bucket choice ───────────────────────────────────────────────────────────

/**
 * Returns the private bucket that holds a vault document's file, chosen by the
 * row's source. Invariant: every writer of vault_documents.file_url stores a
 * path in the bucket this function returns for that row's source. The writers
 * are app/api/contracts/verify (source 'uploaded', vault-contracts),
 * lib/split-sheets/distribution.ts (source 'generated', release-documents) and
 * the signed PDF upload route (either, chosen here).
 */
export function vaultDocumentBucket(source: string | null | undefined): string {
  return source === 'uploaded' ? CONTRACT_BUCKET : DOC_BUCKET
}

// ─── Path checks ─────────────────────────────────────────────────────────────

/**
 * True when a stored value is a plain, relative object path: non-empty, no
 * leading or trailing slash, no empty segment, no '.' or '..' segment and no
 * backslash. The /file route signs whatever file_url holds, so it refuses
 * anything else even though migration 245 stops clients writing the column.
 */
export function isSafeObjectPath(value: string): boolean {
  if (!value || value.includes('\\')) return false
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * True when a storage error means the object does not exist. storage-js
 * reports a missing object as status/statusCode 404 and an "Object not found"
 * message; accept any of the three.
 */
export function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown }
  return (
    String(e.status) === '404' ||
    String(e.statusCode) === '404' ||
    (typeof e.message === 'string' && /not found/i.test(e.message))
  )
}

// ─── Upload helper ────────────────────────────────────────────────────────────

/**
 * Validates and uploads a signed PDF to the given private bucket (use
 * vaultDocumentBucket(row.source)). Validates MIME type, size and the leading
 * "%PDF-" bytes before any storage write; the MIME type is client-declared, so
 * the magic check is what confirms the content looks like a PDF. Returns the
 * storage path; there is no public URL.
 *
 * Auth is the caller's responsibility and must be checked BEFORE calling:
 * this uses the service client, which bypasses storage policies, so nothing
 * here stops an unowned docId.
 */
export async function uploadSignedPdf(params: {
  file: File
  userId: string
  projectId: string
  docId: string
  bucket: string
}): Promise<{ path: string }> {
  if (params.file.type !== 'application/pdf') {
    throw new Error('Document must be a PDF file')
  }
  if (params.file.size > MAX_DOC_SIZE) {
    throw new Error('Document must be under 5MB')
  }
  const head = new Uint8Array(await params.file.slice(0, PDF_MAGIC.length).arrayBuffer())
  if (head.length !== PDF_MAGIC.length || !PDF_MAGIC.every((byte, i) => head[i] === byte)) {
    throw new Error('Document must be a PDF file')
  }

  const path = `${params.userId}/${params.projectId}/${params.docId}-${Date.now()}.pdf`
  const supabase = createServiceClient()

  // upsert: false - the path carries Date.now(), so a collision is a bug to surface.
  const { error } = await supabase.storage
    .from(params.bucket)
    .upload(path, params.file, { upsert: false, contentType: 'application/pdf' })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  return { path }
}
