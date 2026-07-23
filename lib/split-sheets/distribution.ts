// ─── Cross-account executed-sheet distribution (P17-06) ──────────────
// buildFanoutRows is a pure builder: given the executed envelope's output
// and the sheet's parties, it produces one vault_documents INSERT shape per
// Funūn-account party (split_sheet_parties.user_id IS NOT NULL) — parties
// without an account get nothing here (they retrieve the executed PDF from
// their token link instead, per P17-06). All rows point at the SAME
// storage path (no file duplication — only DB rows are duplicated), and
// every row satisfies vault_documents_status_requires_evidence_chk
// (migration 045/049: status='signed' requires signed_at IS NOT NULL AND
// (file_url IS NOT NULL OR document_data.esign.completedAt IS NOT NULL)).
//
// This is a pure builder — 17-07's webhook applies these rows via the
// service client after the DocuSeal submission.completed event lands.

import type { EsignState } from '@/lib/esign/provider'

export type FanoutParty = {
  /** null when the party has no Funūn account — excluded from the fan-out. */
  user_id: string | null
  name: string
  email: string
}

export type FanoutSheet = {
  id: string
  /** null for a standalone sheet (P17-05) — every fanned-out row inherits this. */
  vault_project_id: string | null
}

export type BuildFanoutRowsInput = {
  parties: FanoutParty[]
  sheet: FanoutSheet
  /** Storage URL of the DocuSeal-executed, combined PDF. Shared by every row. */
  executedFileUrl: string
  /** Storage URL of the Certificate of Signature / audit log. Shared by every row. */
  auditTrailUrl: string
  completedAt: string
  /** DocuSeal's submission id — maps to EsignState.requestId. */
  requestId: string
}

export type FanoutVaultDocumentRow = {
  user_id: string
  project_id: string | null
  type: 'split_sheet'
  status: 'signed'
  signed_at: string
  file_url: string
  document_data: {
    /** Lets Contract Locker's standalone query (Task 1) resolve the sheet
     * this document row came from, for the attach affordance. */
    split_sheet_id: string
    esign: EsignState
  }
}

/**
 * One vault_documents insert shape per account-holding party. Zero rows
 * when no party has a Funūn account. All rows share the same
 * executedFileUrl/auditTrailUrl (no file duplication) and the same
 * project_id (the sheet's vault_project_id, NULL for standalone sheets).
 */
export function buildFanoutRows(input: BuildFanoutRowsInput): FanoutVaultDocumentRow[] {
  const signers = input.parties.map(p => ({ name: p.name, email: p.email, status: 'signed' as const }))

  const accountHolders = input.parties.filter(
    (p): p is FanoutParty & { user_id: string } => typeof p.user_id === 'string' && p.user_id.length > 0
  )

  return accountHolders.map(party => ({
    user_id: party.user_id,
    project_id: input.sheet.vault_project_id,
    type: 'split_sheet',
    status: 'signed',
    signed_at: input.completedAt,
    file_url: input.executedFileUrl,
    document_data: {
      split_sheet_id: input.sheet.id,
      esign: {
        provider: 'docuseal',
        requestId: input.requestId,
        signers,
        signedFileUrl: input.executedFileUrl,
        auditTrailUrl: input.auditTrailUrl,
        completedAt: input.completedAt,
      },
    },
  }))
}
