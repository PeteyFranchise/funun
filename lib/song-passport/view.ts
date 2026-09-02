import {
  PASSPORT_FIELD_DEFINITIONS,
  type PassportLayer,
  type PassportValueState,
  type PassportVisibility,
} from '@/lib/song-passport/schema'
import type { PassportPermission } from '@/lib/song-passport/authorization'

export type PassportCurrentValueRow = {
  id: string
  layer: PassportLayer
  field_key: string
  target_key: string
  subject_user_id: string | null
  collaborator_id: string | null
  work_version_id: string | null
  vault_project_id: string | null
  track_id: string | null
  value_jsonb: unknown
  state: PassportValueState
  visibility: PassportVisibility
  source_kind: string
  source_record_id: string | null
  created_at: string
}

export type PassportIssueView = {
  id: string
  issue_type: string
  layer: PassportLayer
  field_key: string
  target_key: string
  status: string
  created_at: string
}

export type PassportTaskView = {
  id: string
  rule_key: string
  title: string
  status: string
  assigned_user_id: string | null
  due_at: string | null
}

export type PassportSnapshotView = {
  id: string
  purpose: string
  payload_sha256: string
  created_by: string
  created_at: string
}

export type SongPassportFieldView = {
  id: string
  fieldKey: string
  label: string
  layer: PassportLayer
  targetKey: string
  value: unknown
  state: PassportValueState
  visibility: PassportVisibility
  sourceKind: string
  sourceRecordId: string | null
  createdAt: string
  canConfirm: boolean
  canPropose: boolean
}

export type SongPassportView = {
  id: string
  workId: string
  lifecycleState: string
  fields: SongPassportFieldView[]
  missingByLayer: Record<PassportLayer, string[]>
  issues: PassportIssueView[]
  tasks: PassportTaskView[]
  snapshots: PassportSnapshotView[]
  permissions: PassportPermission[]
  trustedFacts: number
  visibleFacts: number
  hasHiddenLegalFacts: boolean
  currentMaster: {
    id: string
    workVersionId: string
    approvalSnapshotId: string
    designatedAt: string
  } | null
  releaseLink: {
    vaultProjectId: string
    trackId: string
    createdAt: string
  } | null
  releaseCandidates: Array<{
    projectId: string
    projectTitle: string
    trackId: string
    trackTitle: string
  }>
  artifacts: Array<{
    id: string
    kind: string
    purpose: string
    artifactSha256: string
    createdAt: string
  }>
  custodyEvents: Array<{
    id: string
    eventType: string
    controllerAfter: unknown
    occurredAt: string
  }>
}

export type BuildPassportViewInput = {
  passport: { id: string; work_id: string; lifecycle_state: string }
  values: readonly PassportCurrentValueRow[]
  issues: readonly PassportIssueView[]
  tasks: readonly PassportTaskView[]
  snapshots: readonly PassportSnapshotView[]
  viewerUserId: string
  viewerIsMember: boolean
  permissions: readonly PassportPermission[]
  collaboratorClaims: Readonly<Record<string, string | null>>
  currentMaster?: {
    id: string
    work_version_id: string
    approval_snapshot_id: string
    designated_at: string
  } | null
  releaseLink?: {
    vault_project_id: string
    track_id: string
    created_at: string
  } | null
  releaseCandidates?: Array<{
    projectId: string
    projectTitle: string
    trackId: string
    trackTitle: string
  }>
  artifacts?: Array<{ id: string; kind: string; purpose: string; artifact_sha256: string; created_at: string }>
  custodyEvents?: Array<{ id: string; event_type: string; controller_after: unknown; occurred_at: string }>
}

export function buildSongPassportView(input: BuildPassportViewInput): SongPassportView {
  const canViewPrivate = input.permissions.includes('view_private_identity')
  const canViewLegal = input.permissions.includes('view_legal')
  const fields = input.values
    .filter(value => {
      if (value.visibility === 'legal_restricted') return canViewLegal
      if (value.visibility !== 'private_identity') return input.viewerIsMember
      return canViewPrivate || value.subject_user_id === input.viewerUserId || (
        value.collaborator_id !== null && input.collaboratorClaims[value.collaborator_id] === input.viewerUserId
      )
    })
    .map(value => {
      const definition = PASSPORT_FIELD_DEFINITIONS.find(field => field.key === value.field_key)
      const isSubject = value.subject_user_id === input.viewerUserId || (
        value.collaborator_id !== null && input.collaboratorClaims[value.collaborator_id] === input.viewerUserId
      )
      return {
        id: value.id,
        fieldKey: value.field_key,
        label: definition?.label ?? humanize(value.field_key),
        layer: value.layer,
        targetKey: value.target_key,
        value: value.value_jsonb,
        state: value.state,
        visibility: value.visibility,
        sourceKind: value.source_kind,
        sourceRecordId: value.source_record_id,
        createdAt: value.created_at,
        canConfirm: value.layer === 'contributor' && isSubject && value.state !== 'confirmed' && value.state !== 'locked',
        canPropose: input.viewerIsMember && value.state !== 'locked',
      }
    })

  const missingByLayer = Object.fromEntries(
    ['contributor', 'composition', 'recording_version', 'release'].map(layer => [
      layer,
      PASSPORT_FIELD_DEFINITIONS
        .filter(definition => definition.layer === layer)
        .filter(definition => !fields.some(field => field.fieldKey === definition.key))
        .map(definition => definition.label),
    ])
  ) as Record<PassportLayer, string[]>

  return {
    id: input.passport.id,
    workId: input.passport.work_id,
    lifecycleState: input.passport.lifecycle_state,
    fields,
    missingByLayer,
    issues: [...input.issues],
    tasks: [...input.tasks],
    snapshots: [...input.snapshots],
    permissions: [...input.permissions],
    trustedFacts: fields.filter(field => field.state === 'confirmed' || field.state === 'locked').length,
    visibleFacts: fields.length,
    hasHiddenLegalFacts: input.values.some(value => value.visibility === 'legal_restricted') && !canViewLegal,
    currentMaster: input.currentMaster ? {
      id: input.currentMaster.id,
      workVersionId: input.currentMaster.work_version_id,
      approvalSnapshotId: input.currentMaster.approval_snapshot_id,
      designatedAt: input.currentMaster.designated_at,
    } : null,
    releaseLink: input.releaseLink ? {
      vaultProjectId: input.releaseLink.vault_project_id,
      trackId: input.releaseLink.track_id,
      createdAt: input.releaseLink.created_at,
    } : null,
    releaseCandidates: input.releaseCandidates ?? [],
    artifacts: (input.artifacts ?? []).map(artifact => ({
      id: artifact.id,
      kind: artifact.kind,
      purpose: artifact.purpose,
      artifactSha256: artifact.artifact_sha256,
      createdAt: artifact.created_at,
    })),
    custodyEvents: (input.custodyEvents ?? []).map(event => ({
      id: event.id,
      eventType: event.event_type,
      controllerAfter: event.controller_after,
      occurredAt: event.occurred_at,
    })),
  }
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}
