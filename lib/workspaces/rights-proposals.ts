import { z } from 'zod'

// D-41: this is the complete workspace-proposable rights field set. It is
// intentionally narrower than the Member's own profile edit surface.
export const WORKSPACE_RIGHTS_FIELD_VALUES = [
  'pro',
  'ipi',
  'publisher',
  'soundexchange_id',
] as const

export type WorkspaceRightsField = (typeof WORKSPACE_RIGHTS_FIELD_VALUES)[number]

export const WORKSPACE_RIGHTS_FIELD_LABELS: Record<WorkspaceRightsField, string> = {
  pro: 'Performing rights organization (PRO)',
  ipi: 'Interested Party Information (IPI) number',
  publisher: 'Publisher',
  soundexchange_id: 'SoundExchange account ID',
}

export const WorkspaceRightsProposalSchema = z.object({
  relationshipId: z.string().uuid(),
  field: z.enum(WORKSPACE_RIGHTS_FIELD_VALUES),
  proposedValue: z.string().trim().min(1).max(300),
  note: z.string().trim().max(1000).nullable().optional(),
}).strict()

export const MemberRightsDecisionSchema = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(['confirmed', 'declined']),
}).strict()

export type WorkspaceRightsProposal = {
  id: string
  workspaceId: string
  workspaceName: string | null
  relationshipId: string
  memberUserId: string
  field: WorkspaceRightsField
  fieldLabel: string
  proposedValue: string
  note: string | null
  status: 'pending' | 'confirmed' | 'declined' | 'superseded'
  proposedBy: string
  proposedAt: string
  decidedAt: string | null
}

export function presentRightsProposal(
  row: Record<string, unknown>,
  workspaceName: string | null = null
): WorkspaceRightsProposal | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.workspace_id !== 'string' ||
    typeof row.relationship_id !== 'string' ||
    typeof row.member_user_id !== 'string' ||
    typeof row.field !== 'string' ||
    !WORKSPACE_RIGHTS_FIELD_VALUES.includes(row.field as WorkspaceRightsField) ||
    typeof row.proposed_value !== 'string' ||
    typeof row.proposed_by !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.status !== 'string' ||
    !['pending', 'confirmed', 'declined', 'superseded'].includes(row.status)
  ) return null

  const field = row.field as WorkspaceRightsField
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName,
    relationshipId: row.relationship_id,
    memberUserId: row.member_user_id,
    field,
    fieldLabel: WORKSPACE_RIGHTS_FIELD_LABELS[field],
    proposedValue: row.proposed_value,
    note: typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null,
    status: row.status as WorkspaceRightsProposal['status'],
    proposedBy: row.proposed_by,
    proposedAt: row.created_at,
    decidedAt: typeof row.decided_at === 'string' ? row.decided_at : null,
  }
}
