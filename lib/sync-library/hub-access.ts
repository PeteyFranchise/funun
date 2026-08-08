import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncListingStatus } from '@/types'
import { DOC_BUCKET } from '@/lib/storage'
import { readEsignState } from '@/lib/esign/provider'

// ─── Sync Library hub access + data (Phase 26, 26-CONTEXT.md) ────────────
// hasAdmittedSyncListing is the server-side gate for BOTH the nav item's
// visibility (app/(artist)/layout.tsx -> ArtistNav) and the hub page's own
// redirect guard (T-26-31 — nav-hiding is never the authority; the hub
// page re-checks independently, mirroring the layout-vs-page double-check
// convention already used elsewhere in this codebase).
export async function hasAdmittedSyncListing(
  service: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await service
    .from('sync_listings')
    .select('id', { count: 'exact', head: true })
    .eq('artist_user_id', userId)
    .eq('status', 'admitted')
  return (count ?? 0) > 0
}

// ─── loadSyncLibraryHub (Task 2) ──────────────────────────────────────────
// The hub page's own scoped read. T-26-32 (Information Disclosure): every
// query below is filtered to artist_user_id = userId (also backed by
// sync_listings' select_own RLS) — this must never leak another artist's
// listings.

export type SyncLibraryHubListing = {
  id: string
  trackId: string
  trackTitle: string
  projectId: string
  projectTitle: string
  status: SyncListingStatus
  rejectionReason: string | null
  appliedAt: string
  admittedAt: string | null
}

export type SyncLibraryHubAgreement = {
  version: string
  signedAt: string
  fileUrl: string | null
}

export type SyncLibraryHub = {
  inProgress: SyncLibraryHubListing[]
  admitted: SyncLibraryHubListing[]
  agreement: SyncLibraryHubAgreement | null
}

type SyncListingHubRow = {
  id: string
  track_id: string
  vault_project_id: string
  status: SyncListingStatus
  rejection_reason: string | null
  applied_at: string
  admitted_at: string | null
  tracks: { title: string } | null
  vault_projects: { title: string } | null
}

type BlanketAgreementDocRow = {
  id: string
  signed_at: string | null
  document_data: Record<string, unknown> | null
}

/** Resolves a temporary signed URL for a stored blanket-agreement PDF path. Never throws — null on any failure. */
async function resolveAgreementFileUrl(
  service: SupabaseClient,
  path: string | undefined
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await service.storage.from(DOC_BUCKET).createSignedUrl(path, 60 * 60 * 2)
  if (error || !data) return null
  return data.signedUrl
}

export async function loadSyncLibraryHub(
  service: SupabaseClient,
  userId: string
): Promise<SyncLibraryHub> {
  const { data: listingsRaw } = await service
    .from('sync_listings')
    .select(
      'id, track_id, vault_project_id, status, rejection_reason, applied_at, admitted_at, ' +
        'tracks(title), vault_projects(title)'
    )
    .eq('artist_user_id', userId)
    .order('applied_at', { ascending: false })

  const rows = (listingsRaw ?? []) as unknown as SyncListingHubRow[]
  const listings: SyncLibraryHubListing[] = rows.map(row => ({
    id: row.id,
    trackId: row.track_id,
    trackTitle: row.tracks?.title ?? 'Untitled track',
    projectId: row.vault_project_id,
    projectTitle: row.vault_projects?.title ?? 'Untitled project',
    status: row.status,
    rejectionReason: row.rejection_reason,
    appliedAt: row.applied_at,
    admittedAt: row.admitted_at,
  }))

  const admitted = listings.filter(l => l.status === 'admitted')
  const inProgress = listings.filter(l => l.status !== 'admitted')

  const { data: agreementRaw } = await service
    .from('vault_documents')
    .select('id, signed_at, document_data')
    .eq('type', 'blanket_agreement')
    .eq('user_id', userId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const agreementDoc = agreementRaw as BlanketAgreementDocRow | null
  let agreement: SyncLibraryHubAgreement | null = null
  if (agreementDoc && agreementDoc.signed_at) {
    const esign = readEsignState(agreementDoc.document_data)
    const esignRaw = (agreementDoc.document_data?.esign ?? null) as Record<string, unknown> | null
    const version = typeof esignRaw?.agreementVersion === 'string' ? esignRaw.agreementVersion : 'draft-0.1'
    agreement = {
      version,
      signedAt: agreementDoc.signed_at,
      fileUrl: await resolveAgreementFileUrl(service, esign?.signedFileUrl),
    }
  }

  return { inProgress, admitted, agreement }
}
