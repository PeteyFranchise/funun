import { z } from 'zod'

export const MASTER_CLAIM_STATES = [
  'claimed',
  'contributor_confirmed',
  'document_supported',
  'disputed',
] as const

export type MasterClaimState = (typeof MASTER_CLAIM_STATES)[number]

export const EVIDENCE_DERIVED_MASTER_CAPABILITIES = [
  'view_catalogue',
  'view_metadata',
  'view_readiness',
  'manage_registrations',
  'deliver_assets',
] as const

export type EvidenceDerivedMasterCapability =
  (typeof EVIDENCE_DERIVED_MASTER_CAPABILITIES)[number]

export const MasterOwnershipClaimSchema = z.object({
  workVersionId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
}).strict()

export const MasterOwnershipDecisionSchema = z.discriminatedUnion('action', [
  z.object({ claimId: z.string().uuid(), action: z.literal('confirm') }),
  z.object({
    claimId: z.string().uuid(),
    action: z.literal('dispute'),
    note: z.string().trim().min(1).max(1000),
  }),
  z.object({
    claimId: z.string().uuid(),
    action: z.literal('support'),
    documentId: z.string().uuid(),
  }),
])

export type PresentedMasterOwnershipClaim = {
  id: string
  workspaceId: string
  workspaceName: string | null
  workVersionId: string
  workTitle: string | null
  versionLabel: string | null
  holderUserId: string
  state: MasterClaimState
  note: string | null
  disputeNote: string | null
  evidenceDocumentId: string | null
  createdAt: string
  updatedAt: string
  access: {
    enabled: boolean
    capabilities: readonly EvidenceDerivedMasterCapability[]
    cleanMasterDownload: false
  }
}

const CLAIM_STATES = new Set<string>(MASTER_CLAIM_STATES)

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isClaimState(value: unknown): value is MasterClaimState {
  return typeof value === 'string' && CLAIM_STATES.has(value)
}

/**
 * Maps a service-only claim row to the deliberately narrow response shape.
 * Audio/storage references and evidence document contents are unrepresentable.
 */
export function presentMasterOwnershipClaim(
  row: Record<string, unknown>,
  context?: { workspaceName?: string | null; workTitle?: string | null; versionLabel?: string | null }
): PresentedMasterOwnershipClaim | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.workspace_id !== 'string' ||
    typeof row.work_version_id !== 'string' ||
    typeof row.holder_user_id !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string' ||
    !isClaimState(row.state)
  ) {
    return null
  }

  const supported = row.state === 'document_supported'
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: textOrNull(context?.workspaceName),
    workVersionId: row.work_version_id,
    workTitle: textOrNull(context?.workTitle),
    versionLabel: textOrNull(context?.versionLabel),
    holderUserId: row.holder_user_id,
    state: row.state,
    note: textOrNull(row.note),
    disputeNote: textOrNull(row.dispute_note),
    evidenceDocumentId: textOrNull(row.evidence_document_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    access: {
      enabled: supported,
      capabilities: supported ? EVIDENCE_DERIVED_MASTER_CAPABILITIES : [],
      cleanMasterDownload: false,
    },
  }
}
