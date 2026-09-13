import type { SupabaseClient } from '@supabase/supabase-js'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import {
  resolveAuthorityStatus,
  type AgreementEvidenceFacts,
  type WorkspaceAuthorityStatus,
} from '@/lib/workspaces/evidence'
import {
  ROSTER_RELATIONSHIP_STATE_VALUES,
  type RosterRelationshipState,
  type WorkspaceAuthorityTier,
} from '@/lib/workspaces/types'

// Shared read model for the workspace operating rooms. Both readers call the
// authenticated SECURITY DEFINER RPCs from migration 197; the service client
// is used only after those readers have returned authorized identifiers, and
// only to enrich them with display labels and current agreement evidence.

// PostgreSQL's UUID type accepts the complete canonical 8-4-4-4-12 form;
// it does not restrict stored identifiers to a particular RFC version.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ROSTER_STATES = new Set<string>(ROSTER_RELATIONSHIP_STATE_VALUES)

export const WORKSPACE_ROOM_PAGE_MAX = 200
export const WORKSPACE_ROOM_PAGE_DEFAULT = 50

export function clampWorkspaceRoomLimit(raw: string | number | null | undefined): number {
  const value = raw === null || raw === undefined ? NaN : Number(raw)
  if (!Number.isFinite(value)) return WORKSPACE_ROOM_PAGE_DEFAULT
  return Math.min(Math.max(Math.trunc(value), 1), WORKSPACE_ROOM_PAGE_MAX)
}

export function clampWorkspaceRoomOffset(raw: string | number | null | undefined): number {
  const value = raw === null || raw === undefined ? NaN : Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(Math.trunc(value), 0)
}

type ProfileRow = { id: string; artist_name: string | null; handle: string | null }

export type WorkspaceRosterRecord = {
  id: string
  workspace_id: string
  member_user_id: string
  professional_role: string | null
  state: Exclude<RosterRelationshipState, 'blocked'>
  effective_from: string | null
  terminates_on: string | null
  proposed_by: string | null
  accepted_at: string | null
  refused_at: string | null
  ended_at: string | null
  ended_by: string | null
  end_reason: string | null
  created_at: string | null
  updated_at: string | null
  memberDisplayName: string
  memberHandle: string | null
  authorityTier: WorkspaceAuthorityTier
  authorityStatus: WorkspaceAuthorityStatus
}

export type WorkspaceActivityRecord = {
  id: string
  actorUserId: string
  actorDisplayName: string
  subjectMemberId: string | null
  subjectDisplayName: string | null
  action: string
  actionLabel: string
  permissionReliedOn: string | null
  targetType: string
  targetId: string | null
  changesRedacted: boolean
  createdAt: string
}

export type WorkspaceRoomResult<T> =
  | { ok: true; data: T[] }
  | { ok: false; status: 500; error: string }

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function profileMap(rows: unknown): Map<string, ProfileRow> {
  const mapped = new Map<string, ProfileRow>()
  if (!Array.isArray(rows)) return mapped

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.id)) continue
    mapped.set(row.id, {
      id: row.id,
      artist_name: nullableString(row.artist_name),
      handle: nullableString(row.handle),
    })
  }
  return mapped
}

function profileLabel(profiles: ReadonlyMap<string, ProfileRow>, userId: string): string {
  const profile = profiles.get(userId)
  if (!profile) return 'Member'
  return profileDisplayTitle({ artistName: profile.artist_name, handle: profile.handle }) || 'Member'
}

export function normalizeWorkspaceRosterRows(
  rawRows: unknown,
  workspaceId: string
): WorkspaceRosterRecord[] {
  if (!Array.isArray(rawRows) || !isUuid(workspaceId)) return []
  const rows: WorkspaceRosterRecord[] = []

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.id) || row.workspace_id !== workspaceId || !isUuid(row.member_user_id)) continue
    if (typeof row.state !== 'string' || !ROSTER_STATES.has(row.state)) continue

    const state = row.state === 'blocked' ? 'refused' : row.state
    rows.push({
      id: row.id,
      workspace_id: workspaceId,
      member_user_id: row.member_user_id,
      professional_role: nullableString(row.professional_role),
      state: state as Exclude<RosterRelationshipState, 'blocked'>,
      effective_from: nullableString(row.effective_from),
      terminates_on: nullableString(row.terminates_on),
      proposed_by: isUuid(row.proposed_by) ? row.proposed_by : null,
      accepted_at: nullableString(row.accepted_at),
      refused_at: nullableString(row.refused_at),
      ended_at: nullableString(row.ended_at),
      ended_by: isUuid(row.ended_by) ? row.ended_by : null,
      end_reason: nullableString(row.end_reason),
      created_at: nullableString(row.created_at),
      updated_at: nullableString(row.updated_at),
      memberDisplayName: 'Member',
      memberHandle: null,
      authorityTier: 'none',
      authorityStatus: { tier: 'none', reason: 'relationship_inactive', changesAt: null },
    })
  }

  return rows
}

const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  'workspace.created': 'Created the workspace',
  'workspace.invitation.issued': 'Invited a workspace member',
  'workspace.invitation.accepted': 'Accepted a workspace invitation',
  'workspace.invitation.revoked': 'Revoked a workspace invitation',
  'workspace.member.activated': 'Activated a workspace member',
  'workspace.member.removed': 'Removed a workspace member',
  'workspace.member.role_changed': 'Changed a workspace role',
  'workspace.member.status_changed': 'Changed a workspace member status',
  'workspace.ownership.nominated': 'Nominated a new workspace owner',
  'workspace.roster.proposed': 'Proposed a roster relationship',
  'workspace.roster.updated': 'Updated a roster relationship',
  'workspace.roster.ended': 'Ended a roster relationship',
  'workspace.roster.evidence_recorded': 'Recorded relationship evidence',
  'workspace.roster.evidence_superseded': 'Superseded relationship evidence',
  'workspace.evidence.confirmed': 'Confirmed relationship evidence',
  'workspace.evidence.confirmation_withdrawn': 'Withdrew evidence confirmation',
  'workspace.project.attached': 'Attached a project to the workspace',
  'workspace.project.detached': 'Detached a project from the workspace',
  'workspace.project.created_for_member': 'Created a project for a roster member',
  'workspace.grant.issued': 'Issued a project permission',
  'workspace.grant.revoked': 'Revoked a project permission',
  'workspace.permission_request.created': 'Requested a project permission',
  'workspace.permission_request.approved': 'Approved a permission request',
  'workspace.permission_request.declined': 'Declined a permission request',
  'workspace.permission_request.withdrawn': 'Withdrew a permission request',
  'workspace.rights_proposal.created': 'Proposed rights information',
  'workspace.rights_proposal.confirmed': 'Confirmed proposed rights information',
  'workspace.rights_proposal.declined': 'Declined proposed rights information',
}

export function workspaceActivityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? 'Updated the workspace'
}

export function normalizeWorkspaceActivityRows(rawRows: unknown): WorkspaceActivityRecord[] {
  if (!Array.isArray(rawRows)) return []
  const rows: WorkspaceActivityRecord[] = []

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (
      !isUuid(row.id) ||
      !isUuid(row.actor_user_id) ||
      typeof row.action !== 'string' ||
      !row.action.startsWith('workspace.') ||
      typeof row.target_type !== 'string' ||
      !row.target_type.trim() ||
      typeof row.created_at !== 'string' ||
      !Number.isFinite(new Date(row.created_at).getTime())
    ) {
      continue
    }

    rows.push({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorDisplayName: 'Member',
      subjectMemberId: isUuid(row.subject_member_id) ? row.subject_member_id : null,
      subjectDisplayName: null,
      action: row.action,
      actionLabel: workspaceActivityLabel(row.action),
      permissionReliedOn: nullableString(row.permission_relied_on),
      targetType: row.target_type.trim(),
      targetId: isUuid(row.target_id) ? row.target_id : null,
      changesRedacted: row.changes_redacted === true,
      createdAt: row.created_at,
    })
  }

  return rows
}

function normalizeEvidenceRows(rawRows: unknown): Map<string, AgreementEvidenceFacts[]> {
  const grouped = new Map<string, AgreementEvidenceFacts[]>()
  if (!Array.isArray(rawRows)) return grouped

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.relationship_id)) continue
    const existing = grouped.get(row.relationship_id) ?? []
    existing.push({
      declaredScope: nullableString(row.declared_scope),
      effectiveFrom: nullableString(row.effective_from),
      expiresAt: nullableString(row.expires_at),
      supersededAt: nullableString(row.superseded_at),
      uploadedBy: isUuid(row.declared_by) ? row.declared_by : '',
      uploadedAt: nullableString(row.uploaded_at) ?? '',
      witnessedBySignature: row.witnessed_by_signature === true,
      documentId: isUuid(row.document_id) ? row.document_id : null,
      confirmedBySubjectAt: nullableString(row.confirmed_by_subject_at),
    })
    grouped.set(row.relationship_id, existing)
  }
  return grouped
}

async function loadProfiles(service: SupabaseClient, userIds: readonly string[]) {
  if (userIds.length === 0) return new Map<string, ProfileRow>()
  const { data, error } = await service
    .from('user_profiles')
    .select('id, artist_name, handle')
    .in('id', [...new Set(userIds)])
    .order('id')
  return error ? new Map<string, ProfileRow>() : profileMap(data)
}

export async function loadWorkspaceRosterPage(
  session: SupabaseClient,
  service: SupabaseClient,
  args: { workspaceId: string; userId: string; limit?: string | number | null; offset?: string | number | null; now?: number }
): Promise<WorkspaceRoomResult<WorkspaceRosterRecord>> {
  const { data, error } = await session.rpc('workspace_roster_page', {
    p_workspace_id: args.workspaceId,
    p_uid: args.userId,
    p_limit: clampWorkspaceRoomLimit(args.limit),
    p_offset: clampWorkspaceRoomOffset(args.offset),
  })
  if (error) return { ok: false, status: 500, error: 'Request could not be completed.' }

  const rows = normalizeWorkspaceRosterRows(data, args.workspaceId)
  const acceptedIds = rows.filter(row => row.state === 'accepted').map(row => row.id)
  let evidenceByRelationship = new Map<string, AgreementEvidenceFacts[]>()

  if (acceptedIds.length > 0) {
    const evidenceResult = await service
      .from('workspace_agreement_evidence')
      .select('relationship_id, declared_scope, effective_from, expires_at, superseded_at, declared_by, uploaded_at, witnessed_by_signature, document_id, confirmed_by_subject_at')
      .in('relationship_id', acceptedIds)
      .order('relationship_id')
    if (evidenceResult.error) {
      return { ok: false, status: 500, error: 'Could not load roster authority evidence.' }
    }
    evidenceByRelationship = normalizeEvidenceRows(evidenceResult.data)
  }

  const profiles = await loadProfiles(service, rows.map(row => row.member_user_id))
  return {
    ok: true,
    data: rows.map(row => {
      const profile = profiles.get(row.member_user_id)
      const authorityStatus = resolveAuthorityStatus({
        relationshipState: row.state,
        evidence: evidenceByRelationship.get(row.id) ?? [],
        now: args.now,
      })
      return {
        ...row,
        memberDisplayName: profileLabel(profiles, row.member_user_id),
        memberHandle: profile?.handle ?? null,
        authorityTier: authorityStatus.tier,
        authorityStatus,
      }
    }),
  }
}

export async function loadWorkspaceActivityPage(
  session: SupabaseClient,
  service: SupabaseClient,
  args: { workspaceId: string; userId: string; limit?: string | number | null; offset?: string | number | null }
): Promise<WorkspaceRoomResult<WorkspaceActivityRecord>> {
  const { data, error } = await session.rpc('workspace_audit_page', {
    p_workspace_id: args.workspaceId,
    p_uid: args.userId,
    p_limit: clampWorkspaceRoomLimit(args.limit),
    p_offset: clampWorkspaceRoomOffset(args.offset),
  })
  if (error) return { ok: false, status: 500, error: 'Request could not be completed.' }

  const rows = normalizeWorkspaceActivityRows(data)
  const profiles = await loadProfiles(
    service,
    rows.flatMap(row => [row.actorUserId, ...(row.subjectMemberId ? [row.subjectMemberId] : [])])
  )
  return {
    ok: true,
    data: rows.map(row => ({
      ...row,
      actorDisplayName: profileLabel(profiles, row.actorUserId),
      subjectDisplayName: row.subjectMemberId ? profileLabel(profiles, row.subjectMemberId) : null,
    })),
  }
}
