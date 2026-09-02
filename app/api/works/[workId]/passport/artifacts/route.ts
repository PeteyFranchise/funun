import { randomUUID } from 'crypto'
import NodeID3 from 'node-id3'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import { isSongPassportAvailableForWork, type SongPassportCohortClient } from '@/lib/song-passport/feature'
import { canonicalJson, canonicalSha256 } from '@/lib/song-passport/canonical'
import { buildPassportSidecar, deliverySafePassportMetadata, passportId3Fields } from '@/lib/song-passport/artifacts'
import { loadPassportServerContext, loadSongPassportView, PassportAuthorizationError, requirePassportAction } from '@/lib/song-passport/repository'
import { sha256Blob, sha256Bytes } from '@/lib/metadata/delivery-safe'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUCKET = 'track-audio'
const MAX_TAG_BYTES = 60 * 1024 * 1024

const BodySchema = z.object({
  kind: z.enum(['passport_json', 'metadata_sidecar', 'tagged_mp3', 'custody_package']),
  purpose: z.enum(['professional_handoff', 'distributor_upload', 'registration', 'archive', 'custody_transfer']),
  audience: z.object({ name: z.string().trim().max(200).optional(), organization: z.string().trim().max(200).optional() }).strict().optional(),
}).strict()

type RouteCtx = { params: Promise<{ workId: string }> }

export async function POST(request: Request, context: RouteCtx) {
  const { workId } = await context.params
  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Passport artifact request' }, { status: 400 })

  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user?.id ?? null, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  if (!await isSongPassportAvailableForWork(service as unknown as SongPassportCohortClient, workId, user!.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const actor = await loadPassportServerContext(service, { workId, actorUserId: user!.id, memberTier: access.tier, isWorkOwner: access.isOwner })
  if (!actor) return NextResponse.json({ error: 'Song Passport not found' }, { status: 404 })

  try {
    requirePassportAction(actor, 'export_delivery_safe')
    if (parsed.data.kind === 'tagged_mp3') requirePassportAction(actor, 'deliver_clean_master')
    if (parsed.data.kind === 'custody_package') requirePassportAction(actor, 'transfer_custody')

    const { data: heads, error: headError } = await service.from('song_passport_field_heads').select('current_value_id').eq('passport_id', actor.passportId)
    if (headError) throw new Error(headError.message)
    const ids = (heads ?? []).map(head => head.current_value_id)
    const { data: values, error: valueError } = ids.length > 0
      ? await service.from('song_passport_values').select('field_key, target_key, value_jsonb, state, visibility').in('id', ids)
      : { data: [], error: null }
    if (valueError) throw new Error(valueError.message)
    const metadata = deliverySafePassportMetadata((values ?? []).map(value => ({
      fieldKey: value.field_key,
      targetKey: value.target_key,
      value: value.value_jsonb,
      state: value.state,
      visibility: value.visibility,
    })))
    if (parsed.data.kind !== 'custody_package' && Object.keys(metadata.facts).length === 0) return NextResponse.json({ error: 'No delivery-safe Passport facts are ready to export.' }, { status: 409 })

    const { data: master } = await service.from('song_passport_master_designations').select('id, work_version_id, approval_snapshot_id').eq('passport_id', actor.passportId).order('designated_at', { ascending: false }).limit(1).maybeSingle()
    if ((parsed.data.kind === 'metadata_sidecar' || parsed.data.kind === 'tagged_mp3') && !master) return NextResponse.json({ error: 'Select an approved master before creating an audio sidecar or tagged copy.' }, { status: 409 })
    const { data: version } = master
      ? await service.from('work_versions').select('id, audio_path, audio_ext').eq('id', master.work_version_id).eq('work_id', workId).maybeSingle()
      : { data: null }

    let sourceBlob: Blob | null = null
    let sourceSha256: string | null = null
    if (version) {
      const { data, error } = await service.storage.from(BUCKET).download(version.audio_path)
      if (error || !data) throw new Error('Could not read the selected master.')
      sourceBlob = data
      sourceSha256 = await sha256Blob(data)
    }

    if (parsed.data.kind === 'tagged_mp3' && (!version || version.audio_ext.toLowerCase() !== 'mp3' || !sourceBlob)) {
      return NextResponse.json({ error: 'Embedded tags require an MP3 master. Use the sidecar for WAV, FLAC or other formats.', useSidecar: true }, { status: 422 })
    }
    if (parsed.data.kind === 'tagged_mp3' && sourceBlob!.size > MAX_TAG_BYTES) {
      return NextResponse.json({ error: 'This MP3 is too large to tag in one request. Use the sidecar.' }, { status: 413 })
    }

    const createdAt = new Date().toISOString()
    let custodyPackage: Record<string, unknown> | null = null
    if (parsed.data.kind === 'custody_package') {
      const [scopedView, custodyRes, artifactRes, masterRes] = await Promise.all([
        loadSongPassportView(service, { workId, viewerUserId: actor.actorUserId, viewerTier: access.tier, viewerIsOwner: access.isOwner }),
        service.from('song_passport_custody_events').select('id, event_type, controller_before, controller_after, recipient, details, actor_user_id, occurred_at').eq('passport_id', actor.passportId).order('occurred_at'),
        service.from('song_passport_artifacts').select('id, kind, purpose, source_sha256, artifact_sha256, manifest, receipt, created_at').eq('passport_id', actor.passportId).order('created_at'),
        service.from('song_passport_master_designations').select('id, work_version_id, approval_snapshot_id, supersedes_designation_id, designated_by, designated_at').eq('passport_id', actor.passportId).order('designated_at'),
      ])
      const historyError = [custodyRes.error, artifactRes.error, masterRes.error].find(Boolean)
      if (historyError) throw new Error('Could not assemble the Passport custody history.')
      custodyPackage = {
        schemaVersion: 'funun.song-passport.custody-package.v1',
        generatedAt: createdAt,
        passport: scopedView,
        masterHistory: masterRes.data ?? [],
        custodyHistory: custodyRes.data ?? [],
        artifactEvidence: artifactRes.data ?? [],
        privacyStatement: 'This package contains only the facts visible to the requesting user at generation time.',
      }
    }

    const snapshotPayload = {
      schemaVersion: 1,
      purpose: parsed.data.purpose,
      audience: parsed.data.audience ?? {},
      masterDesignationId: master?.id ?? null,
      source: version && sourceSha256 ? { bucket: BUCKET, path: version.audio_path, sha256: sourceSha256 } : null,
      metadata,
      custodyPackage,
    }
    const snapshotHash = canonicalSha256(snapshotPayload)
    const { data: snapshot, error: snapshotError } = await service.from('song_passport_snapshots').insert({
      passport_id: actor.passportId,
      purpose: 'export',
      schema_version: 1,
      payload: snapshotPayload,
      payload_sha256: snapshotHash,
      created_by: actor.actorUserId,
    }).select('id').single()
    if (snapshotError || !snapshot) throw new Error(snapshotError?.message ?? 'Could not freeze the export snapshot')

    const artifactId = randomUUID()
    const sourceDirectory = version ? version.audio_path.slice(0, Math.max(0, version.audio_path.lastIndexOf('/') + 1)) : `${workId}/`
    let bytes: Buffer
    let extension: string
    let mimeType: string
    if (parsed.data.kind === 'passport_json') {
      bytes = Buffer.from(JSON.stringify(snapshotPayload, null, 2), 'utf8')
      extension = 'passport.json'
      mimeType = 'application/json'
    } else if (parsed.data.kind === 'custody_package') {
      bytes = Buffer.from(JSON.stringify(custodyPackage, null, 2), 'utf8')
      extension = 'custody.json'
      mimeType = 'application/json'
    } else if (parsed.data.kind === 'metadata_sidecar') {
      bytes = Buffer.from(buildPassportSidecar(metadata), 'utf8')
      extension = 'metadata.txt'
      mimeType = 'text/plain; charset=utf-8'
    } else {
      const fields = passportId3Fields(metadata)
      const source = Buffer.from(await sourceBlob!.arrayBuffer())
      const tagged = NodeID3.write({
        title: fields.title,
        artist: fields.artist,
        album: fields.album,
        composer: fields.composer,
        publisher: fields.publisher,
        copyright: fields.copyright,
        language: fields.language,
        bpm: fields.bpm,
        ...(fields.lyrics ? { unsynchronisedLyrics: { language: 'eng', text: fields.lyrics } } : {}),
        userDefinedText: [
          fields.isrc && { description: 'ISRC', value: fields.isrc },
          fields.iswc && { description: 'ISWC', value: fields.iswc },
          fields.upc && { description: 'BARCODE', value: fields.upc },
        ].filter(Boolean) as { description: string; value: string }[],
      }, Buffer.from(source))
      if (!Buffer.isBuffer(tagged)) throw new Error('Could not write the MP3 tags.')
      bytes = tagged
      extension = 'tagged.mp3'
      mimeType = 'audio/mpeg'
    }

    const artifactPath = `${sourceDirectory}passport-exports/${actor.passportId}/${artifactId}.${extension}`
    const artifactSha256 = sha256Bytes(bytes)
    const manifest = {
      schemaVersion: 'funun.song-passport.artifact.v1',
      artifactId,
      passportId: actor.passportId,
      snapshotId: snapshot.id,
      snapshotSha256: snapshotHash,
      kind: parsed.data.kind,
      purpose: parsed.data.purpose,
      audience: parsed.data.audience ?? {},
      source: version && sourceSha256 ? { bucket: BUCKET, path: version.audio_path, sha256: sourceSha256, unchanged: true } : null,
      artifact: { bucket: BUCKET, path: artifactPath, sha256: artifactSha256, sizeBytes: bytes.byteLength, mimeType },
      createdAt,
    }
    const receipt = {
      schemaVersion: 'funun.song-passport.receipt.v1',
      artifactId,
      actorUserId: actor.actorUserId,
      action: 'generated',
      status: 'complete',
      createdAt,
      statement: 'Funūn generated this artifact. It is not evidence that a recipient downloaded or accepted it.',
    }

    const { error: uploadError } = await service.storage.from(BUCKET).upload(artifactPath, bytes, { contentType: mimeType, upsert: false })
    if (uploadError) throw new Error('Could not store the Passport artifact.')
    const { error: ledgerError } = await service.from('song_passport_artifacts').insert({
      id: artifactId,
      passport_id: actor.passportId,
      snapshot_id: snapshot.id,
      master_designation_id: master?.id ?? null,
      kind: parsed.data.kind,
      purpose: parsed.data.purpose,
      source_bucket: version ? BUCKET : null,
      source_path: version?.audio_path ?? null,
      source_sha256: sourceSha256,
      artifact_bucket: BUCKET,
      artifact_path: artifactPath,
      artifact_sha256: artifactSha256,
      artifact_size_bytes: bytes.byteLength,
      audience: parsed.data.audience ?? {},
      manifest,
      receipt,
      created_by: actor.actorUserId,
      created_at: createdAt,
    })
    if (ledgerError) {
      await service.storage.from(BUCKET).remove([artifactPath])
      throw new Error('Could not record the artifact evidence. The original was not changed.')
    }
    await service.from('song_passport_custody_events').insert({
      passport_id: actor.passportId,
      master_designation_id: master?.id ?? null,
      artifact_id: artifactId,
      event_type: 'delivery_copy_generated',
      recipient: parsed.data.audience ?? {},
      details: { kind: parsed.data.kind, purpose: parsed.data.purpose, snapshotId: snapshot.id },
      actor_user_id: actor.actorUserId,
    })
    const { data: signed, error: signedError } = await service.storage.from(BUCKET).createSignedUrl(artifactPath, 60 * 60 * 2)
    if (signedError || !signed?.signedUrl) throw new Error('The artifact was recorded, but its temporary download link could not be created.')

    return NextResponse.json({ data: { artifactId, url: signed.signedUrl, manifest, receipt, canonicalManifest: canonicalJson(manifest) } }, { status: 201 })
  } catch (error) {
    if (!(error instanceof PassportAuthorizationError)) {
      Sentry.captureException(error, { tags: { feature: 'song-passport', operation: 'artifact-generation' } })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create the Passport artifact' }, { status: error instanceof PassportAuthorizationError ? 403 : 400 })
  }
}
