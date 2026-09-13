import type { SupabaseClient } from '@supabase/supabase-js'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import { loadWorkspaceCatalogue } from '@/lib/workspaces/catalogue'
import {
  WORKSPACE_ROOM_PAGE_MAX,
  normalizeWorkspaceRosterRows,
} from '@/lib/workspaces/room-data'

// Workspace Contract Locker read model (38.1-04). Agreement evidence is
// admitted by its own RLS policy first. Document details then come only from
// the caller's ordinary project/document RLS or migration 193's narrow,
// caller-bound workspace_read_documents() function. The service client never
// supplies a display field from vault_documents; it may locate project_id for
// an already-visible document id solely so the authenticated RPC can make the
// authorization decision.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DOCUMENT_TYPES = new Set([
  'split_sheet',
  'copyright_registration',
  'hire_right',
  'sample_clearance',
  'distribution_agreement',
  'sync_license',
  'blanket_agreement',
])

const DOCUMENT_STATUSES = new Set(['pending', 'signed', 'verified'])

export const WORKSPACE_DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  split_sheet: 'Split Sheet',
  copyright_registration: 'Copyright Registration',
  hire_right: 'Work-for-Hire',
  sample_clearance: 'Sample Clearance',
  distribution_agreement: 'Distribution Agreement',
  sync_license: 'Sync License',
  blanket_agreement: 'Sync Library Agreement',
}

export type WorkspaceEvidenceState =
  | 'awaiting_confirmation'
  | 'confirmed_record'
  | 'not_yet_effective'
  | 'expired'
  | 'superseded'
  | 'document_not_linked'
  | 'record_issue'

export type WorkspaceDocumentState = 'pending' | 'signed' | 'verified' | 'unavailable'

export type WorkspaceContractShelfRecord = {
  evidenceId: string
  relationshipId: string
  memberUserId: string
  memberDisplayName: string
  memberHandle: string | null
  declaredScope: string | null
  evidenceState: WorkspaceEvidenceState
  documentId: string | null
  documentType: string | null
  documentTypeLabel: string
  documentState: WorkspaceDocumentState
  signedAt: string | null
  projectLabel: string
  uploadedAt: string
  uploadedByDisplayName: string
  confirmedAt: string | null
  effectiveFrom: string | null
  expiresAt: string | null
  supersededAt: string | null
  witnessedBySignature: boolean
  canonicalHref: string | null
}

export type WorkspaceContractShelfGroup = {
  memberUserId: string
  memberDisplayName: string
  memberHandle: string | null
  records: WorkspaceContractShelfRecord[]
}

export type WorkspaceContractShelfData = {
  groups: WorkspaceContractShelfGroup[]
  recordCount: number
  limited: boolean
}

export type WorkspaceContractShelfResult =
  | { ok: true; data: WorkspaceContractShelfData }
  | { ok: false; status: 500; error: string }

type NormalizedEvidence = {
  id: string
  relationshipId: string
  documentId: string | null
  declaredScope: string | null
  declaredBy: string
  effectiveFrom: string | null
  expiresAt: string | null
  supersededAt: string | null
  uploadedAt: string
  witnessedBySignature: boolean
  confirmedAt: string | null
  hasMalformedDate: boolean
}

type WorkspaceDocumentSummary = {
  id: string
  projectId: string | null
  type: string
  status: Exclude<WorkspaceDocumentState, 'unavailable'>
  signedAt: string | null
  personallyReadable: boolean
}

type ProfileSummary = { id: string; artistName: string | null; handle: string | null }

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeDate(value: unknown): { value: string | null; malformed: boolean } {
  if (value === null || value === undefined || value === '') return { value: null, malformed: false }
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    return { value: null, malformed: true }
  }
  return { value, malformed: false }
}

export function normalizeWorkspaceEvidenceRows(
  rawRows: unknown,
  relationshipIds: ReadonlySet<string>
): NormalizedEvidence[] {
  if (!Array.isArray(rawRows)) return []
  const rows: NormalizedEvidence[] = []

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.id) || !isUuid(row.relationship_id) || !relationshipIds.has(row.relationship_id)) continue
    if (!isUuid(row.declared_by)) continue

    const uploadedAt = normalizeDate(row.uploaded_at)
    if (!uploadedAt.value) continue
    const effectiveFrom = normalizeDate(row.effective_from)
    const expiresAt = normalizeDate(row.expires_at)
    const supersededAt = normalizeDate(row.superseded_at)
    const confirmedAt = normalizeDate(row.confirmed_by_subject_at)

    rows.push({
      id: row.id,
      relationshipId: row.relationship_id,
      documentId: isUuid(row.document_id) ? row.document_id : null,
      declaredScope: nullableString(row.declared_scope),
      declaredBy: row.declared_by,
      effectiveFrom: effectiveFrom.value,
      expiresAt: expiresAt.value,
      supersededAt: supersededAt.value,
      uploadedAt: uploadedAt.value,
      witnessedBySignature: row.witnessed_by_signature === true,
      confirmedAt: confirmedAt.value,
      hasMalformedDate:
        effectiveFrom.malformed || expiresAt.malformed || supersededAt.malformed || confirmedAt.malformed,
    })
  }

  return rows
}

export function normalizeWorkspaceDocumentRows(
  rawRows: unknown,
  allowedDocumentIds: ReadonlySet<string>,
  personallyReadable: boolean
): WorkspaceDocumentSummary[] {
  if (!Array.isArray(rawRows)) return []
  const rows: WorkspaceDocumentSummary[] = []

  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.id) || !allowedDocumentIds.has(row.id)) continue
    if (typeof row.type !== 'string' || !DOCUMENT_TYPES.has(row.type)) continue
    if (typeof row.status !== 'string' || !DOCUMENT_STATUSES.has(row.status)) continue
    const signedAt = normalizeDate(row.signed_at)
    if (signedAt.malformed) continue

    rows.push({
      id: row.id,
      projectId: isUuid(row.project_id) ? row.project_id : null,
      type: row.type,
      status: row.status as WorkspaceDocumentSummary['status'],
      signedAt: signedAt.value,
      personallyReadable,
    })
  }

  return rows
}

export function resolveWorkspaceEvidenceState(
  evidence: Pick<
    NormalizedEvidence,
    'confirmedAt' | 'documentId' | 'effectiveFrom' | 'expiresAt' | 'supersededAt' | 'hasMalformedDate'
  >,
  now = Date.now()
): WorkspaceEvidenceState {
  if (evidence.hasMalformedDate) return 'record_issue'
  if (evidence.supersededAt && new Date(evidence.supersededAt).getTime() <= now) return 'superseded'
  if (evidence.expiresAt && new Date(evidence.expiresAt).getTime() <= now) return 'expired'
  if (evidence.effectiveFrom && new Date(evidence.effectiveFrom).getTime() > now) return 'not_yet_effective'
  if (!evidence.documentId) return 'document_not_linked'
  if (!evidence.confirmedAt) return 'awaiting_confirmation'
  return 'confirmed_record'
}

function profileLabel(profile: ProfileSummary | undefined): string {
  if (!profile) return 'Member'
  return profileDisplayTitle({ artistName: profile.artistName, handle: profile.handle }) || 'Member'
}

export function buildWorkspaceContractShelf(args: {
  rosterRows: ReturnType<typeof normalizeWorkspaceRosterRows>
  evidenceRows: NormalizedEvidence[]
  documentRows: WorkspaceDocumentSummary[]
  profiles: ReadonlyMap<string, ProfileSummary>
  projectTitles: ReadonlyMap<string, string>
  now?: number
  limited?: boolean
}): WorkspaceContractShelfData {
  const relationshipById = new Map(args.rosterRows.map(row => [row.id, row]))
  const documentById = new Map(args.documentRows.map(row => [row.id, row]))
  const records: WorkspaceContractShelfRecord[] = []

  for (const evidence of args.evidenceRows) {
    const relationship = relationshipById.get(evidence.relationshipId)
    if (!relationship) continue
    const document = evidence.documentId ? documentById.get(evidence.documentId) : undefined
    const memberProfile = args.profiles.get(relationship.member_user_id)
    const documentTypeLabel = document
      ? WORKSPACE_DOCUMENT_TYPE_LABELS[document.type] ?? 'Supporting agreement'
      : 'Supporting agreement'

    let canonicalHref: string | null = null
    if (document?.personallyReadable) {
      canonicalHref = document.projectId
        ? `/vault/${encodeURIComponent(document.projectId)}/documents`
        : `/contracts?view=documents&document=${encodeURIComponent(document.id)}`
    }

    records.push({
      evidenceId: evidence.id,
      relationshipId: evidence.relationshipId,
      memberUserId: relationship.member_user_id,
      memberDisplayName: profileLabel(memberProfile),
      memberHandle: memberProfile?.handle ?? null,
      declaredScope: evidence.declaredScope,
      evidenceState: resolveWorkspaceEvidenceState(evidence, args.now),
      documentId: evidence.documentId,
      documentType: document?.type ?? null,
      documentTypeLabel,
      documentState: document?.status ?? 'unavailable',
      signedAt: document?.signedAt ?? null,
      projectLabel: document?.projectId
        ? args.projectTitles.get(document.projectId) ?? 'Project-linked document'
        : document
          ? 'Standalone agreement'
          : 'Member-controlled document',
      uploadedAt: evidence.uploadedAt,
      uploadedByDisplayName: profileLabel(args.profiles.get(evidence.declaredBy)),
      confirmedAt: evidence.confirmedAt,
      effectiveFrom: evidence.effectiveFrom,
      expiresAt: evidence.expiresAt,
      supersededAt: evidence.supersededAt,
      witnessedBySignature: evidence.witnessedBySignature,
      canonicalHref,
    })
  }

  records.sort((a, b) => {
    const member = a.memberDisplayName.localeCompare(b.memberDisplayName)
    if (member !== 0) return member
    const project = a.projectLabel.localeCompare(b.projectLabel)
    if (project !== 0) return project
    const type = a.documentTypeLabel.localeCompare(b.documentTypeLabel)
    if (type !== 0) return type
    return b.uploadedAt.localeCompare(a.uploadedAt)
  })

  const groupsByMember = new Map<string, WorkspaceContractShelfGroup>()
  for (const record of records) {
    const group = groupsByMember.get(record.memberUserId) ?? {
      memberUserId: record.memberUserId,
      memberDisplayName: record.memberDisplayName,
      memberHandle: record.memberHandle,
      records: [],
    }
    group.records.push(record)
    groupsByMember.set(record.memberUserId, group)
  }

  return {
    groups: [...groupsByMember.values()],
    recordCount: records.length,
    limited: args.limited === true,
  }
}

async function loadProfiles(service: SupabaseClient, userIds: readonly string[]) {
  const profiles = new Map<string, ProfileSummary>()
  const uniqueIds = [...new Set(userIds.filter(isUuid))]
  if (uniqueIds.length === 0) return profiles

  const { data, error } = await service
    .from('user_profiles')
    .select('id, artist_name, handle')
    .in('id', uniqueIds)
  if (error || !Array.isArray(data)) return profiles

  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!isUuid(row.id)) continue
    profiles.set(row.id, {
      id: row.id,
      artistName: nullableString(row.artist_name),
      handle: nullableString(row.handle),
    })
  }
  return profiles
}

/**
 * Loads the latest bounded workspace agreement-evidence shelf. The function
 * never returns a file URL, storage path, document body, signer identity,
 * verification payload, or service-client document row.
 */
export async function loadWorkspaceContractShelf(
  session: SupabaseClient,
  service: SupabaseClient,
  args: { workspaceId: string; userId: string; now?: number }
): Promise<WorkspaceContractShelfResult> {
  const rosterResult = await session.rpc('workspace_roster_page', {
    p_workspace_id: args.workspaceId,
    p_uid: args.userId,
    p_limit: WORKSPACE_ROOM_PAGE_MAX,
    p_offset: 0,
  })
  if (rosterResult.error) {
    return { ok: false, status: 500, error: 'Contract records could not be loaded.' }
  }

  const rosterRows = normalizeWorkspaceRosterRows(rosterResult.data, args.workspaceId)
  const relationshipIds = new Set(rosterRows.map(row => row.id))
  if (relationshipIds.size === 0) {
    return { ok: true, data: { groups: [], recordCount: 0, limited: false } }
  }

  // This is the decisive evidence boundary. Owners/admins see evidence for
  // their workspace; a roster Member sees only evidence naming them. The
  // application does not recreate that policy with service credentials.
  const evidenceResult = await session
    .from('workspace_agreement_evidence')
    .select(
      'id, relationship_id, document_id, declared_scope, declared_by, effective_from, expires_at, superseded_at, uploaded_at, witnessed_by_signature, confirmed_by_subject_at'
    )
    .in('relationship_id', [...relationshipIds])
    .order('uploaded_at', { ascending: false })
    .limit(WORKSPACE_ROOM_PAGE_MAX)
  if (evidenceResult.error) {
    return { ok: false, status: 500, error: 'Contract records could not be loaded.' }
  }

  const evidenceRows = normalizeWorkspaceEvidenceRows(evidenceResult.data, relationshipIds)
  const evidenceDocumentIds = new Set(
    evidenceRows.flatMap(row => (row.documentId ? [row.documentId] : []))
  )

  const rosterByRelationshipId = new Map(rosterRows.map(row => [row.id, row]))
  const profileUserIds = evidenceRows.flatMap(row => {
    const relationship = rosterByRelationshipId.get(row.relationshipId)
    return [row.declaredBy, ...(relationship ? [relationship.member_user_id] : [])]
  })
  const directDocumentPromise = evidenceDocumentIds.size > 0
    ? session
      .from('vault_documents')
      .select('id, project_id, track_id, type, status, signed_at')
      .in('id', [...evidenceDocumentIds])
    : Promise.resolve({ data: [], error: null })

  // Locate only project ids for already RLS-visible evidence document ids.
  // These rows never become output; each project must independently pass the
  // authenticated workspace_read_documents() authorization contract below.
  const locatorPromise = evidenceDocumentIds.size > 0
    ? service
      .from('vault_documents')
      .select('id, project_id')
      .in('id', [...evidenceDocumentIds])
    : Promise.resolve({ data: [], error: null })
  const profilesPromise = loadProfiles(service, profileUserIds)

  const [directResult, locatorResult, profiles] = await Promise.all([
    directDocumentPromise,
    locatorPromise,
    profilesPromise,
  ])
  const personallyReadableDocuments = directResult.error
    ? []
    : normalizeWorkspaceDocumentRows(directResult.data, evidenceDocumentIds, true)
  const personallyReadableIds = new Set(personallyReadableDocuments.map(row => row.id))

  const projectIds = new Set<string>()
  if (!locatorResult.error && Array.isArray(locatorResult.data)) {
    for (const raw of locatorResult.data) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      if (
        isUuid(row.id) &&
        evidenceDocumentIds.has(row.id) &&
        !personallyReadableIds.has(row.id) &&
        isUuid(row.project_id)
      ) {
        projectIds.add(row.project_id)
      }
    }
  }

  const [workspaceDocumentPages, catalogue] = await Promise.all([
    Promise.all(
      [...projectIds].map(projectId =>
        session.rpc('workspace_read_documents', {
          p_project_id: projectId,
          p_uid: args.userId,
        })
      )
    ),
    projectIds.size > 0
      ? loadWorkspaceCatalogue(session, {
          workspaceId: args.workspaceId,
          actorUserId: args.userId,
          limit: WORKSPACE_ROOM_PAGE_MAX,
        })
      : Promise.resolve([]),
  ])
  const workspaceReadableDocuments = workspaceDocumentPages.flatMap(result =>
    result.error ? [] : normalizeWorkspaceDocumentRows(result.data, evidenceDocumentIds, false)
  )

  const documentsById = new Map<string, WorkspaceDocumentSummary>()
  for (const row of workspaceReadableDocuments) documentsById.set(row.id, row)
  // Personal/project RLS is the stronger navigation permission because the
  // canonical personal pages do not accept a workspace grant as authority.
  for (const row of personallyReadableDocuments) documentsById.set(row.id, row)

  const projectTitles = new Map(catalogue.map(entry => [entry.projectId, entry.title]))

  return {
    ok: true,
    data: buildWorkspaceContractShelf({
      rosterRows,
      evidenceRows,
      documentRows: [...documentsById.values()],
      profiles,
      projectTitles,
      now: args.now,
      limited: Array.isArray(evidenceResult.data) && evidenceResult.data.length === WORKSPACE_ROOM_PAGE_MAX,
    }),
  }
}
