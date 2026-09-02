import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { canonicalSha256 } from '@/lib/song-passport/canonical'
import { isSongPassportAvailableForWork, type SongPassportCohortClient } from '@/lib/song-passport/feature'
import {
  loadPassportServerContext,
  loadSongPassportView,
  PassportAuthorizationError,
  requirePassportAction,
} from '@/lib/song-passport/repository'
import { passportFieldDefinition } from '@/lib/song-passport/schema'
import { createNotification } from '@/lib/notifications'

type RouteCtx = { params: Promise<{ workId: string }> }

const OperationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('propose'), valueId: z.string().uuid(), value: z.unknown(), reason: z.string().trim().max(1000).optional() }).strict(),
  z.object({ operation: z.literal('confirm'), valueId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('dispute'), valueId: z.string().uuid(), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ operation: z.literal('approve'), scope: z.enum(['composition', 'release']), reason: z.string().trim().max(1000).optional() }).strict(),
  z.object({ operation: z.literal('select_master'), versionId: z.string().uuid(), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ operation: z.literal('graduate_release'), masterDesignationId: z.string().uuid(), releaseTitle: z.string().trim().min(1).max(200) }).strict(),
  z.object({ operation: z.literal('attach_final_mix'), trackId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('grant_self'), permission: z.enum(['view_legal', 'approve_composition', 'approve_release', 'select_master', 'export_delivery_safe', 'deliver_clean_master', 'transfer_custody']), acknowledge: z.literal(true) }).strict(),
  z.object({ operation: z.literal('record_custody_transfer'), newControllerName: z.string().trim().min(1).max(200), newControllerUserId: z.string().uuid().optional(), evidence: z.string().trim().min(3).max(2000), acknowledge: z.literal(true) }).strict(),
  z.object({ operation: z.literal('retention_request'), requestType: z.enum(['portable_copy', 'archive', 'delete_personal_data', 'delete_passport']), reason: z.string().trim().max(2000).optional() }).strict(),
  z.object({ operation: z.literal('task_update'), taskId: z.string().uuid(), status: z.enum(['open', 'in_progress', 'blocked', 'completed', 'dismissed']) }).strict(),
  z.object({ operation: z.literal('resolve_issue'), issueId: z.string().uuid(), status: z.enum(['resolved', 'dismissed']), note: z.string().trim().min(1).max(2000) }).strict(),
])

export async function GET(_request: Request, context: RouteCtx) {
  const authorized = await authorize(context, 'contribute')
  if ('response' in authorized) return authorized.response
  try {
    const view = await loadSongPassportView(createServiceClient(), {
      workId: authorized.workId,
      viewerUserId: authorized.userId,
      viewerTier: authorized.access.tier,
      viewerIsOwner: authorized.access.isOwner,
    })
    return NextResponse.json({ data: view })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load the Song Passport' }, { status: 500 })
  }
}

export async function POST(request: Request, routeContext: RouteCtx) {
  const authorized = await authorize(routeContext, 'contribute')
  if ('response' in authorized) return authorized.response
  const parsed = OperationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Song Passport action' }, { status: 400 })

  const service = createServiceClient()
  const context = await loadPassportServerContext(service, {
    workId: authorized.workId,
    actorUserId: authorized.userId,
    memberTier: authorized.access.tier,
    isWorkOwner: authorized.access.isOwner,
  })
  if (!context) return NextResponse.json({ error: 'Create or review the Song Passport first.' }, { status: 409 })

  try {
    const operation = parsed.data
    if (operation.operation === 'propose') {
      requirePassportAction(context, 'draft_metadata')
      ensureJsonSize(operation.value)
      const current = await loadCurrentValue(service, context.passportId, operation.valueId)
      if (!current) return NextResponse.json({ error: 'Passport fact not found' }, { status: 404 })
      requireVisibilityForWrite(context, current)
      const definition = passportFieldDefinition(current.field_key)
      if (!definition || definition.layer !== current.layer) return NextResponse.json({ error: 'Unsupported Passport field' }, { status: 400 })
      const valueId = await appendRevision(service, context, current, operation.value, 'draft', operation.reason)
      await createPostApprovalTask(service, context, current.layer, current.field_key)
      await notifyOwner(service, context, 'A Song Passport fact was proposed', `${definition.label} has a new proposal to review.`)
      return NextResponse.json({ data: { valueId } }, { status: 201 })
    }

    if (operation.operation === 'confirm') {
      const current = await loadCurrentValue(service, context.passportId, operation.valueId)
      if (!current) return NextResponse.json({ error: 'Passport fact not found' }, { status: 404 })
      const isIdentitySubject = current.subject_user_id === context.actorUserId || (
        current.collaborator_id && await collaboratorBelongsTo(service, current.collaborator_id, context.actorUserId)
      )
      requirePassportAction({ ...context, isIdentitySubject: Boolean(isIdentitySubject) }, 'confirm_own_identity')
      const valueId = await appendRevision(service, context, current, current.value_jsonb, 'confirmed')
      return NextResponse.json({ data: { valueId } }, { status: 201 })
    }

    if (operation.operation === 'dispute') {
      requirePassportAction(context, 'draft_metadata')
      const current = await loadCurrentValue(service, context.passportId, operation.valueId)
      if (!current) return NextResponse.json({ error: 'Passport fact not found' }, { status: 404 })
      requireVisibilityForWrite(context, current)
      const valueId = await appendRevision(service, context, current, current.value_jsonb, 'disputed', operation.reason)
      await service.from('song_passport_tasks').insert({
        passport_id: context.passportId,
        rule_key: `dispute.${current.field_key}`,
        title: `Resolve the disagreement about ${passportFieldDefinition(current.field_key)?.label ?? current.field_key}`,
        status: 'open',
        assigned_user_id: context.workOwnerId,
        created_by: context.actorUserId,
      })
      await notifyOwner(service, context, 'A Song Passport fact was disputed', operation.reason)
      return NextResponse.json({ data: { valueId } }, { status: 201 })
    }

    if (operation.operation === 'approve') {
      requirePassportAction(context, operation.scope === 'composition' ? 'approve_composition' : 'approve_release')
      const values = await loadCurrentValuesForLayer(service, context.passportId, operation.scope)
      if (values.some(value => value.visibility === 'legal_restricted') && !context.explicitPermissions.includes('view_legal')) {
        throw new PassportAuthorizationError('Legal-restricted facts are present. Accept explicit legal-review visibility before approving this snapshot.')
      }
      const payload = {
        schemaVersion: 1,
        scope: operation.scope,
        values: values.map(value => ({
          id: value.id,
          fieldKey: value.field_key,
          targetKey: value.target_key,
          value: value.value_jsonb,
          state: value.state,
          sourceKind: value.source_kind,
          visibility: value.visibility,
        })),
      }
      const hash = canonicalSha256(payload)
      const { data: snapshotId, error } = await service.rpc('create_song_passport_approval_snapshot', {
        p_passport_id: context.passportId,
        p_actor_user_id: context.actorUserId,
        p_scope: operation.scope,
        p_payload: payload,
        p_payload_sha256: hash,
        p_supersedes_snapshot_id: null,
        p_reason: operation.reason ?? null,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ data: { snapshotId, hash } }, { status: 201 })
    }

    if (operation.operation === 'select_master') {
      requirePassportAction(context, 'select_master')
      const { data: version } = await service.from('work_versions').select('id').eq('id', operation.versionId).eq('work_id', context.workId).maybeSingle()
      if (!version) return NextResponse.json({ error: 'That recording does not belong to this song.' }, { status: 404 })
      const { data: approvals, error: approvalError } = await service
        .from('song_passport_snapshots')
        .select('id, payload')
        .eq('passport_id', context.passportId)
        .eq('purpose', 'approval')
        .order('created_at', { ascending: false })
        .limit(20)
      if (approvalError) throw new Error(approvalError.message)
      const approval = (approvals ?? []).find(snapshot => snapshot.payload?.scope === 'composition')
      if (!approval) return NextResponse.json({ error: 'Approve a composition snapshot before selecting the release master.' }, { status: 409 })
      const { data: designationId, error } = await service.rpc('designate_song_passport_master', {
        p_passport_id: context.passportId,
        p_work_version_id: operation.versionId,
        p_approval_snapshot_id: approval.id,
        p_actor_user_id: context.actorUserId,
        p_note: operation.note ?? null,
      })
      if (error) throw new Error(error.message)
      await notifyOwner(service, context, 'A release master was selected', 'The exact recording and approved Passport snapshot are now linked.')
      return NextResponse.json({ data: { designationId } }, { status: 201 })
    }

    if (operation.operation === 'graduate_release') {
      if (!context.isWorkOwner) throw new PassportAuthorizationError('Only the song owner can create its Release Report.')
      const { data, error } = await service.rpc('graduate_song_passport_to_release', {
        p_passport_id: context.passportId,
        p_master_designation_id: operation.masterDesignationId,
        p_actor_user_id: context.actorUserId,
        p_release_title: operation.releaseTitle,
      })
      if (error) throw new Error(error.message)
      const link = Array.isArray(data) ? data[0] : data
      return NextResponse.json({ data: link }, { status: link?.created ? 201 : 200 })
    }

    if (operation.operation === 'attach_final_mix') {
      if (!context.isWorkOwner) throw new PassportAuthorizationError('Only the song owner can attach a release asset to this Writer’s Room.')
      const { data: track } = await service
        .from('tracks')
        .select('id, title, audio_file_url, audio_file_size, duration_seconds, project_id, vault_projects!inner(user_id, title)')
        .eq('id', operation.trackId)
        .eq('vault_projects.user_id', context.actorUserId)
        .maybeSingle()
      if (!track?.audio_file_url) return NextResponse.json({ error: 'That Release Report track has no master audio yet.' }, { status: 409 })
      const { data: existing } = await service.from('work_versions').select('id').eq('work_id', context.workId).eq('audio_path', track.audio_file_url).maybeSingle()
      if (existing) return NextResponse.json({ data: { versionId: existing.id, created: false } })
      const extension = track.audio_file_url.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'wav'
      const project = Array.isArray(track.vault_projects) ? track.vault_projects[0] : track.vault_projects
      const { data: version, error } = await service.from('work_versions').insert({
        work_id: context.workId,
        user_id: context.actorUserId,
        source: 'upload',
        audio_path: track.audio_file_url,
        audio_ext: extension,
        audio_size: track.audio_file_size,
        duration_seconds: track.duration_seconds,
        label: `Final mix from ${project?.title ?? 'Release Report'}`,
        performers: [],
      }).select('id').single()
      if (error || !version) throw new Error(error?.message ?? 'Could not attach the final mix')
      return NextResponse.json({ data: { versionId: version.id, created: true } }, { status: 201 })
    }

    if (operation.operation === 'record_custody_transfer') {
      requirePassportAction(context, 'transfer_custody')
      const { data: prior } = await service.from('song_passport_custody_events').select('controller_after').eq('passport_id', context.passportId).eq('event_type', 'custody_transferred').order('occurred_at', { ascending: false }).limit(1).maybeSingle()
      const before = prior?.controller_after ?? { userId: context.workOwnerId, basis: 'work_owner' }
      const after = { name: operation.newControllerName, userId: operation.newControllerUserId ?? null }
      const { data: proposed, error: proposalError } = await service.from('song_passport_custody_events').insert({
        passport_id: context.passportId,
        master_designation_id: (await latestMasterId(service, context.passportId)),
        event_type: 'custody_transfer_proposed',
        controller_before: before,
        controller_after: after,
        details: { evidence: operation.evidence, acknowledged: true },
        actor_user_id: context.actorUserId,
      }).select('id').single()
      if (proposalError || !proposed) throw new Error(proposalError?.message ?? 'Could not record the transfer proposal')
      const { data: completed, error: transferError } = await service.from('song_passport_custody_events').insert({
        passport_id: context.passportId,
        master_designation_id: (await latestMasterId(service, context.passportId)),
        event_type: 'custody_transferred',
        controller_before: before,
        controller_after: after,
        recipient: after,
        details: { evidence: operation.evidence, proposalEventId: proposed.id, acknowledged: true },
        actor_user_id: context.actorUserId,
      }).select('id').single()
      if (transferError || !completed) throw new Error(transferError?.message ?? 'Could not complete the custody record')
      await service.from('song_passport_tasks').insert({
        passport_id: context.passportId,
        rule_key: 'custody.review_access_after_transfer',
        title: 'Review access, delivery and legal permissions after the master transfer',
        status: 'open',
        assigned_user_id: context.workOwnerId,
        created_by: context.actorUserId,
      })
      return NextResponse.json({ data: { eventId: completed.id, controller: after } }, { status: 201 })
    }

    if (operation.operation === 'retention_request') {
      if (operation.requestType === 'delete_passport') requirePassportAction(context, 'delete_passport')
      const { data, error } = await service.from('song_passport_retention_requests').insert({
        passport_id: context.passportId,
        request_type: operation.requestType,
        status: 'requested',
        reason: operation.reason ?? null,
        requested_by: context.actorUserId,
      }).select('id').single()
      if (error || !data) throw new Error(error?.message ?? 'Could not create the retention request')
      await service.from('song_passport_custody_events').insert({
        passport_id: context.passportId,
        event_type: 'retention_requested',
        details: { requestId: data.id, requestType: operation.requestType },
        actor_user_id: context.actorUserId,
      })
      return NextResponse.json({ data: { requestId: data.id } }, { status: 201 })
    }

    if (operation.operation === 'grant_self') {
      if (!context.isWorkOwner) throw new PassportAuthorizationError('Only the song owner can create a Passport authority grant.')
      const { error } = await service.rpc('grant_song_passport_permission', {
        p_passport_id: context.passportId,
        p_actor_user_id: context.actorUserId,
        p_grantee_user_id: context.actorUserId,
        p_permission: operation.permission,
        p_scope: { acknowledged: true, source: 'passport_owner_action' },
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ data: { permission: operation.permission } }, { status: 201 })
    }

    if (operation.operation === 'task_update') {
      const { data: task } = await service.from('song_passport_tasks').select('assigned_user_id').eq('id', operation.taskId).eq('passport_id', context.passportId).maybeSingle()
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
      if (!context.isWorkOwner && task.assigned_user_id !== context.actorUserId) throw new PassportAuthorizationError('Only the assignee or song owner can update this task.')
      const { error } = await service.from('song_passport_tasks').update({
        status: operation.status,
        completed_at: operation.status === 'completed' ? new Date().toISOString() : null,
      }).eq('id', operation.taskId).eq('passport_id', context.passportId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ data: { taskId: operation.taskId, status: operation.status } })
    }

    if (!context.isWorkOwner && context.memberTier !== 'administer') throw new PassportAuthorizationError('Administer access is required to resolve reconciliation issues.')
    const { error } = await service.from('song_passport_reconciliation_issues').update({
      status: operation.status,
      resolution_note: operation.note,
      resolved_by: context.actorUserId,
      resolved_at: new Date().toISOString(),
    }).eq('id', operation.issueId).eq('passport_id', context.passportId)
    if (error) throw new Error(error.message)
    return NextResponse.json({ data: { issueId: operation.issueId, status: operation.status } })
  } catch (error) {
    if (!(error instanceof PassportAuthorizationError)) {
      Sentry.captureException(error, { tags: { feature: 'song-passport', operation: parsed.data.operation } })
    }
    const status = error instanceof PassportAuthorizationError ? error.status : 400
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not complete the Passport action' }, { status })
  }
}

async function authorize(context: RouteCtx, tier: 'contribute' | 'administer') {
  const { workId } = await context.params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user?.id ?? null, tier)
  if (!access.granted) return { response: NextResponse.json({ error: access.reason }, { status: access.status }) }
  if (!await isSongPassportAvailableForWork(createServiceClient() as unknown as SongPassportCohortClient, workId, user!.id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { workId, userId: user!.id, access }
}

async function loadCurrentValue(service: ReturnType<typeof createServiceClient>, passportId: string, valueId: string) {
  const { data } = await service.from('song_passport_values').select('*').eq('id', valueId).eq('passport_id', passportId).maybeSingle()
  if (!data) return null
  const { data: head } = await service.from('song_passport_field_heads').select('current_value_id').eq('passport_id', passportId).eq('layer', data.layer).eq('field_key', data.field_key).eq('target_key', data.target_key).maybeSingle()
  return head?.current_value_id === data.id ? data : null
}

async function appendRevision(service: ReturnType<typeof createServiceClient>, context: NonNullable<Awaited<ReturnType<typeof loadPassportServerContext>>>, current: Record<string, any>, value: unknown, state: 'draft' | 'confirmed' | 'disputed', reason?: string) {
  const { data, error } = await service.rpc('append_song_passport_revision', {
    p_passport_id: context.passportId,
    p_actor_user_id: context.actorUserId,
    p_layer: current.layer,
    p_field_key: current.field_key,
    p_target_key: current.target_key,
    p_value_jsonb: value,
    p_state: state,
    p_visibility: current.visibility,
    p_expected_value_id: current.id,
    p_subject_user_id: current.subject_user_id,
    p_collaborator_id: current.collaborator_id,
    p_work_version_id: current.work_version_id,
    p_vault_project_id: current.vault_project_id,
    p_track_id: current.track_id,
    p_reason: reason ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

async function loadCurrentValuesForLayer(service: ReturnType<typeof createServiceClient>, passportId: string, layer: string) {
  const { data: heads } = await service.from('song_passport_field_heads').select('current_value_id').eq('passport_id', passportId).eq('layer', layer)
  const ids = (heads ?? []).map(head => head.current_value_id)
  if (ids.length === 0) return []
  const { data, error } = await service.from('song_passport_values').select('*').in('id', ids)
  if (error) throw new Error(error.message)
  return data ?? []
}

function requireVisibilityForWrite(context: NonNullable<Awaited<ReturnType<typeof loadPassportServerContext>>>, current: Record<string, any>) {
  if (current.visibility === 'legal_restricted') requirePassportAction(context, 'view_legal')
  if (current.visibility === 'private_identity') {
    const self = current.subject_user_id === context.actorUserId
    requirePassportAction({ ...context, isIdentitySubject: self }, 'view_private_identity')
  }
}

async function collaboratorBelongsTo(service: ReturnType<typeof createServiceClient>, collaboratorId: string, userId: string) {
  const { data } = await service.from('collaborators').select('id').eq('id', collaboratorId).eq('claimed_by', userId).maybeSingle()
  return Boolean(data)
}

async function latestMasterId(service: ReturnType<typeof createServiceClient>, passportId: string): Promise<string | null> {
  const { data } = await service.from('song_passport_master_designations').select('id').eq('passport_id', passportId).order('designated_at', { ascending: false }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function createPostApprovalTask(service: ReturnType<typeof createServiceClient>, context: NonNullable<Awaited<ReturnType<typeof loadPassportServerContext>>>, layer: string, fieldKey: string) {
  const scope = layer === 'release' ? 'release' : layer === 'composition' ? 'composition' : null
  if (!scope) return
  const { data: snapshot } = await service.from('song_passport_snapshots').select('id').eq('passport_id', context.passportId).eq('purpose', 'approval').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!snapshot) return
  await service.from('song_passport_tasks').insert({
    passport_id: context.passportId,
    rule_key: `approval.successor.${scope}.${fieldKey}`,
    title: `Review ${passportFieldDefinition(fieldKey)?.label ?? fieldKey} after the approved snapshot changed`,
    status: 'open', assigned_user_id: context.workOwnerId, created_by: context.actorUserId,
  })
}

async function notifyOwner(service: ReturnType<typeof createServiceClient>, context: NonNullable<Awaited<ReturnType<typeof loadPassportServerContext>>>, title: string, body: string) {
  if (context.workOwnerId === context.actorUserId) return
  await createNotification(service, {
    userId: context.workOwnerId,
    type: 'song_passport_review',
    title,
    body,
    link: `/vault/works/${context.workId}`,
    data: { passportId: context.passportId },
    actorId: context.actorUserId,
  })
}

function ensureJsonSize(value: unknown) {
  if (JSON.stringify(value).length > 50_000) throw new Error('This Passport fact is too large to save in one field.')
}
