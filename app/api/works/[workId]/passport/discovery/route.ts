import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { discoverPassportFacts, type PassportDiscoveryReport } from '@/lib/song-passport/discovery'
import { isSongPassportAvailableForWork, type SongPassportCohortClient } from '@/lib/song-passport/feature'
import { legacyFactsForWork, type LegacyWorkSource } from '@/lib/song-passport/legacy'

type RouteCtx = { params: Promise<{ workId: string }> }

export async function GET(_request: Request, context: RouteCtx) {
  const authorized = await authorizeOwnerReview(context)
  if ('response' in authorized) return authorized.response
  const report = await buildReport(authorized.workId)
  if ('response' in report) return report.response
  return NextResponse.json({ data: report })
}

export async function POST(_request: Request, context: RouteCtx) {
  const authorized = await authorizeOwnerReview(context)
  if ('response' in authorized) return authorized.response
  const report = await buildReport(authorized.workId)
  if ('response' in report) return report.response

  const service = createServiceClient()
  let passportId: string | null = null
  let inserted = 0
  for (const seed of report.values) {
    const target = seed.target
    const { data, error } = await service.rpc('seed_song_passport_value', {
      p_work_id: authorized.workId,
      p_actor_user_id: authorized.userId,
      p_layer: seed.layer,
      p_field_key: seed.fieldKey,
      p_target_key: seed.targetKey,
      p_subject_user_id: target.layer === 'contributor' ? target.userId ?? null : null,
      p_collaborator_id: target.layer === 'contributor' ? target.collaboratorId ?? null : null,
      p_work_version_id: target.layer === 'recording_version' ? target.workVersionId : null,
      p_vault_project_id: target.layer === 'release' ? target.vaultProjectId : null,
      p_track_id: target.layer === 'release' ? target.trackId ?? null : null,
      p_value_jsonb: seed.value,
      p_visibility: seed.visibility,
      p_source_kind: seed.sourceKind,
      p_source_record_id: seed.sourceRecordId,
      p_source_revision: seed.sourceRevision ?? null,
      p_source_fingerprint: seed.sourceFingerprint,
    })
    if (error) {
      Sentry.captureException(error, { tags: { feature: 'song-passport', operation: 'legacy-discovery-apply' } })
      return NextResponse.json({ error: `Discovery apply failed: ${error.message}` }, { status: 500 })
    }
    const result = Array.isArray(data) ? data[0] : data
    passportId = result?.passport_id ?? passportId
    if (result?.inserted === true) inserted += 1
  }

  if (!passportId) {
    const { data: passport, error } = await service
      .from('song_passports')
      .upsert({ work_id: authorized.workId, created_by: authorized.userId }, { onConflict: 'work_id' })
      .select('id')
      .single()
    if (error || !passport) return NextResponse.json({ error: error?.message ?? 'Could not create the Song Passport' }, { status: 500 })
    passportId = passport.id
  }

  for (const issue of report.issues) {
    const { error } = await service.from('song_passport_reconciliation_issues').upsert({
      passport_id: passportId,
      issue_key: issue.issueKey,
      issue_type: issue.issueType,
      layer: issue.layer,
      field_key: issue.fieldKey,
      target_key: issue.targetKey,
      source_evidence: issue.evidence,
      created_by: authorized.userId,
    }, { onConflict: 'passport_id,issue_key', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: `Could not queue a reconciliation issue: ${error.message}` }, { status: 500 })
  }

  const idempotencyKey = reportKey(report)
  await service.from('song_passport_backfill_runs').upsert({
    passport_id: passportId,
    work_id: authorized.workId,
    mode: 'apply',
    idempotency_key: idempotencyKey,
    summary: { ...report.summary, inserted },
    created_by: authorized.userId,
  }, { onConflict: 'work_id,mode,idempotency_key', ignoreDuplicates: true })

  return NextResponse.json({ data: { ...report, passportId, inserted, idempotencyKey } })
}

async function authorizeOwnerReview(context: RouteCtx) {
  const { workId } = await context.params
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user?.id ?? null, 'administer')
  if (!access.granted) {
    return { response: NextResponse.json({ error: access.reason }, { status: access.status }) }
  }
  if (!await isSongPassportAvailableForWork(createServiceClient() as unknown as SongPassportCohortClient, workId, user!.id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (!access.isOwner) {
    return { response: NextResponse.json({ error: 'Only the song owner can apply legacy discovery.' }, { status: 403 }) }
  }
  return { workId, userId: user!.id }
}

async function buildReport(workId: string): Promise<PassportDiscoveryReport | { response: NextResponse }> {
  const service = createServiceClient()
  const { data: work, error: workError } = await service
    .from('works')
    .select('id, title, vocal_state, graduated_project_id, user_id')
    .eq('id', workId)
    .maybeSingle()
  if (workError || !work) return { response: NextResponse.json({ error: 'Work not found' }, { status: 404 }) }

  const [membersRes, blocksRes, versionsRes, sheetRes, ownerRes] = await Promise.all([
    service.from('work_members').select('user_id, collaborator_id').eq('work_id', workId),
    service.from('lyric_blocks').select('id, position, block_type, custom_label, text, updated_at').eq('work_id', workId),
    service.from('work_versions').select('id, label, performers, duration_seconds, created_at').eq('work_id', workId),
    service.from('split_sheets').select('id, status, updated_at, split_sheet_parties(collaborator_id, user_id, name, role, split_percentage)').eq('work_id', workId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    service.from('user_profiles').select('id, artist_name, legal_first_name, legal_middle_name, legal_last_name, legal_name_suffix, pro, ipi, publisher, industry_roles').eq('id', work.user_id).maybeSingle(),
  ])
  const legacyReadError = [membersRes.error, blocksRes.error, versionsRes.error, sheetRes.error, ownerRes.error].find(Boolean)
  if (legacyReadError) {
    Sentry.captureException(legacyReadError, { tags: { feature: 'song-passport', operation: 'legacy-discovery-read' } })
    return { response: NextResponse.json({ error: 'Could not inspect the existing song records.' }, { status: 500 }) }
  }
  const collaboratorIds = (membersRes.data ?? []).map(member => member.collaborator_id).filter(Boolean) as string[]
  const collaboratorsRes = collaboratorIds.length > 0
    ? await service.from('collaborators').select('id, name, legal_name, pro, ipi, publisher').in('id', collaboratorIds)
    : { data: [], error: null }
  if (collaboratorsRes.error) {
    Sentry.captureException(collaboratorsRes.error, { tags: { feature: 'song-passport', operation: 'legacy-discovery-collaborators' } })
    return { response: NextResponse.json({ error: 'Could not inspect the existing collaborator records.' }, { status: 500 }) }
  }

  let releaseProject: LegacyWorkSource['releaseProject'] = null
  if (work.graduated_project_id) {
    const { data, error } = await service
      .from('vault_projects')
      .select('id, title, release_date, label, upc, catalog_number, tracks(id, title, track_number, isrc, p_line, c_line)')
      .eq('id', work.graduated_project_id)
      .maybeSingle()
    if (error) {
      Sentry.captureException(error, { tags: { feature: 'song-passport', operation: 'legacy-discovery-release' } })
      return { response: NextResponse.json({ error: 'Could not inspect the linked Release Report.' }, { status: 500 }) }
    }
    releaseProject = data as LegacyWorkSource['releaseProject']
  }

  const source: LegacyWorkSource = {
    work,
    members: membersRes.data ?? [],
    collaborators: collaboratorsRes.data ?? [],
    ownerProfile: ownerRes.data,
    lyricBlocks: blocksRes.data ?? [],
    versions: versionsRes.data ?? [],
    splitSheet: sheetRes.data ? {
      ...sheetRes.data,
      parties: sheetRes.data.split_sheet_parties ?? [],
    } : null,
    releaseProject,
  }
  return discoverPassportFacts(legacyFactsForWork(source))
}

function reportKey(report: PassportDiscoveryReport): string {
  return createHash('sha256')
    .update(JSON.stringify(report.values.map(value => value.sourceFingerprint).sort()))
    .digest('hex')
}
