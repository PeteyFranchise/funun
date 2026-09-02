import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizePassportAction, type PassportActorContext, type PassportPermission } from '@/lib/song-passport/authorization'
import { buildSongPassportView, type PassportCurrentValueRow, type SongPassportView } from '@/lib/song-passport/view'
import type { WorkTier } from '@/lib/catalogue/membership'

export type PassportServerContext = PassportActorContext & {
  actorUserId: string
  workId: string
  passportId: string
  workOwnerId: string
}

export async function loadSongPassportView(
  service: SupabaseClient,
  input: { workId: string; viewerUserId: string; viewerTier: WorkTier; viewerIsOwner: boolean }
): Promise<SongPassportView | null> {
  const { data: passport, error } = await service
    .from('song_passports')
    .select('id, work_id, lifecycle_state')
    .eq('work_id', input.workId)
    .maybeSingle()
  if (error) throw new Error(`Could not load the Song Passport: ${error.message}`)
  if (!passport) return null

  const [headsRes, issuesRes, tasksRes, snapshotsRes, grantsRes, masterRes, releaseRes, artifactRes, custodyRes] = await Promise.all([
    service.from('song_passport_field_heads').select('current_value_id').eq('passport_id', passport.id),
    service.from('song_passport_reconciliation_issues').select('id, issue_type, layer, field_key, target_key, status, created_at').eq('passport_id', passport.id).eq('status', 'open').order('created_at'),
    service.from('song_passport_tasks').select('id, rule_key, title, status, assigned_user_id, due_at').eq('passport_id', passport.id).in('status', ['open', 'in_progress', 'blocked']).order('created_at'),
    service.from('song_passport_snapshots').select('id, purpose, payload_sha256, created_by, created_at').eq('passport_id', passport.id).order('created_at', { ascending: false }).limit(20),
    service.from('song_passport_grants').select('permission, expires_at').eq('passport_id', passport.id).eq('grantee_user_id', input.viewerUserId).is('revoked_at', null),
    service.from('song_passport_master_designations').select('id, work_version_id, approval_snapshot_id, designated_at').eq('passport_id', passport.id).order('designated_at', { ascending: false }).limit(1).maybeSingle(),
    service.from('song_passport_release_links').select('vault_project_id, track_id, created_at').eq('passport_id', passport.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    service.from('song_passport_artifacts').select('id, kind, purpose, artifact_sha256, created_at').eq('passport_id', passport.id).order('created_at', { ascending: false }).limit(20),
    service.from('song_passport_custody_events').select('id, event_type, controller_after, occurred_at').eq('passport_id', passport.id).order('occurred_at', { ascending: false }).limit(20),
  ])
  for (const result of [headsRes, issuesRes, tasksRes, snapshotsRes, grantsRes, masterRes, releaseRes, artifactRes, custodyRes]) {
    if (result.error) throw new Error(`Could not assemble the Song Passport: ${result.error.message}`)
  }

  const valueIds = (headsRes.data ?? []).map(head => head.current_value_id)
  const { data: values, error: valuesError } = valueIds.length > 0
    ? await service.from('song_passport_values').select('*').in('id', valueIds)
    : { data: [], error: null }
  if (valuesError) throw new Error(`Could not load current Passport facts: ${valuesError.message}`)

  const collaboratorIds = Array.from(new Set((values ?? []).map(value => value.collaborator_id).filter(Boolean))) as string[]
  const { data: collaborators, error: collaboratorError } = collaboratorIds.length > 0
    ? await service.from('collaborators').select('id, claimed_by').in('id', collaboratorIds)
    : { data: [], error: null }
  if (collaboratorError) throw new Error(`Could not scope contributor identity: ${collaboratorError.message}`)

  const now = Date.now()
  const permissions = (grantsRes.data ?? [])
    .filter(grant => !grant.expires_at || new Date(grant.expires_at).getTime() > now)
    .map(grant => grant.permission)
    .filter(isPassportPermission)

  let releaseCandidates: Array<{ projectId: string; projectTitle: string; trackId: string; trackTitle: string }> = []
  if (input.viewerIsOwner) {
    const { data: projects } = await service
      .from('vault_projects')
      .select('id, title, tracks(id, title, audio_file_url)')
      .eq('user_id', input.viewerUserId)
      .order('updated_at', { ascending: false })
      .limit(30)
    releaseCandidates = (projects ?? []).flatMap(project =>
      (project.tracks ?? [])
        .filter((track: { audio_file_url?: string | null }) => Boolean(track.audio_file_url))
        .map((track: { id: string; title: string }) => ({
          projectId: project.id,
          projectTitle: project.title,
          trackId: track.id,
          trackTitle: track.title,
        }))
    )
  }

  return buildSongPassportView({
    passport,
    values: (values ?? []) as PassportCurrentValueRow[],
    issues: issuesRes.data ?? [],
    tasks: tasksRes.data ?? [],
    snapshots: snapshotsRes.data ?? [],
    viewerUserId: input.viewerUserId,
    viewerIsMember: input.viewerIsOwner || input.viewerTier === 'contribute' || input.viewerTier === 'administer',
    permissions,
    collaboratorClaims: Object.fromEntries((collaborators ?? []).map(row => [row.id, row.claimed_by ?? null])),
    currentMaster: masterRes.data,
    releaseLink: releaseRes.data,
    releaseCandidates,
    artifacts: artifactRes.data ?? [],
    custodyEvents: custodyRes.data ?? [],
  })
}

export async function loadPassportServerContext(
  service: SupabaseClient,
  input: { workId: string; actorUserId: string; memberTier: WorkTier; isWorkOwner: boolean }
): Promise<PassportServerContext | null> {
  const { data: passport } = await service.from('song_passports').select('id').eq('work_id', input.workId).maybeSingle()
  if (!passport) return null
  const [{ data: work }, { data: grants }] = await Promise.all([
    service.from('works').select('user_id, graduated_project_id').eq('id', input.workId).single(),
    service.from('song_passport_grants').select('permission, expires_at').eq('passport_id', passport.id).eq('grantee_user_id', input.actorUserId).is('revoked_at', null),
  ])
  if (!work) return null

  let isReleaseController = input.isWorkOwner
  if (work.graduated_project_id) {
    const { data: project } = await service.from('vault_projects').select('user_id').eq('id', work.graduated_project_id).maybeSingle()
    isReleaseController = project?.user_id === input.actorUserId
  }
  const now = Date.now()
  const explicitPermissions = (grants ?? [])
    .filter(grant => !grant.expires_at || new Date(grant.expires_at).getTime() > now)
    .map(grant => grant.permission)
    .filter(isPassportPermission)

  return {
    actorUserId: input.actorUserId,
    workId: input.workId,
    passportId: passport.id,
    workOwnerId: work.user_id,
    isWorkOwner: input.isWorkOwner,
    memberTier: input.memberTier,
    isIdentitySubject: false,
    isContributionSubject: false,
    isReleaseController,
    explicitPermissions,
    isStaff: false,
    breakGlassApproved: false,
    hasDocumentedPurpose: false,
  }
}

export function requirePassportAction(context: PassportActorContext, action: Parameters<typeof authorizePassportAction>[1]) {
  const decision = authorizePassportAction(context, action)
  if (!decision.allowed) throw new PassportAuthorizationError(decision.reason)
}

export class PassportAuthorizationError extends Error {
  readonly status = 403
}

function isPassportPermission(value: string): value is PassportPermission {
  return [
    'view_private_identity', 'view_legal', 'approve_composition', 'approve_release',
    'select_master', 'export_delivery_safe', 'deliver_clean_master', 'transfer_custody',
    'delete_passport',
  ].includes(value)
}
