import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildId3Fields, buildSidecar } from '@/lib/metadata/export'
import {
  buildDeliveryArtifactPath,
  buildDeliveryDocuments,
  sha256Blob,
  sha256Bytes,
} from '@/lib/metadata/delivery-safe'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

// GET /api/vault/[projectId]/tracks/[trackId]/metadata/sidecar
// Downloads a .txt metadata sidecar to ship alongside a WAV/AIFF (or any
// file) so the metadata travels even when the format can't embed tags.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; trackId: string }> }
) {
  const { projectId, trackId } = await params

  if (DEMO) return new Response('Not available in demo mode', { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return new Response('Project not found', { status: 404 })

  const { data: track } = await supabase
    .from('tracks')
    .select(TRACK_COLS)
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return new Response('Track not found', { status: 404 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  const bundle = buildBundle(
    project as unknown as ProjectRow,
    [track] as unknown as TrackRow[],
    profile?.artist_name ?? ''
  )
  const meta = bundle.tracks[0]
  const text = buildSidecar(bundle, meta)
  const slug =
    meta.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'track'

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.metadata.txt"`,
    },
  })
}

// POST creates an accountable sidecar delivery artifact. GET above remains a
// compatibility download for older links; Metadata Studio uses this POST so
// the generated file receives hashes, a manifest and an export receipt.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; trackId: string }> }
) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json({ error: 'Sidecar delivery is not available in demo mode' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: track } = await supabase
    .from('tracks')
    .select(TRACK_COLS)
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const audioPath = (track as { audio_file_url: string | null }).audio_file_url
  if (!audioPath) {
    return NextResponse.json(
      { error: 'Upload an audio file before creating a delivery-safe sidecar.' },
      { status: 400 }
    )
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  const bundle = buildBundle(
    project as unknown as ProjectRow,
    [track] as unknown as TrackRow[],
    profile?.artist_name ?? ''
  )
  const meta = bundle.tracks[0]
  const text = buildSidecar(bundle, meta)
  const fields = buildId3Fields(bundle, meta)
  // The sidecar includes richer composer/publishing data than the normalized
  // ID3 map, so freeze both the complete bundle and its rendered field map.
  const metadataSnapshot = { bundle, rendered_fields: fields }
  const artifactBytes = Buffer.from(text, 'utf8')
  const service = createServiceClient()
  const { data: sourceBlob, error: sourceError } = await service.storage
    .from(BUCKET)
    .download(audioPath)
  if (sourceError || !sourceBlob) {
    return NextResponse.json({ error: 'Could not read the source audio.' }, { status: 502 })
  }

  const sourceSha256 = await sha256Blob(sourceBlob)
  const deliveryId = randomUUID()
  const createdAt = new Date().toISOString()
  const artifactPath = buildDeliveryArtifactPath(audioPath, deliveryId, 'metadata_sidecar')
  const artifactSha256 = sha256Bytes(artifactBytes)
  const slug = meta.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'track'
  const { manifest, receipt } = buildDeliveryDocuments({
    deliveryId,
    createdAt,
    kind: 'metadata_sidecar',
    projectId,
    trackId,
    actorUserId: user.id,
    source: { bucket: BUCKET, path: audioPath, sha256: sourceSha256 },
    artifact: {
      bucket: BUCKET,
      path: artifactPath,
      filename: `${slug}.metadata.txt`,
      mime_type: 'text/plain; charset=utf-8',
      size_bytes: artifactBytes.byteLength,
      sha256: artifactSha256,
    },
    metadataSnapshot,
  })

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(artifactPath, artifactBytes, { contentType: 'text/plain; charset=utf-8', upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: 'Could not save the metadata sidecar.' }, { status: 502 })
  }

  const { data: signed, error: signError } = await service.storage
    .from(BUCKET)
    .createSignedUrl(artifactPath, 60 * 60 * 2)
  if (signError || !signed?.signedUrl) {
    await service.storage.from(BUCKET).remove([artifactPath])
    return NextResponse.json({ error: 'Could not create the sidecar download.' }, { status: 502 })
  }

  const { error: ledgerError } = await service.from('metadata_delivery_exports').insert({
    id: deliveryId,
    project_id: projectId,
    track_id: trackId,
    user_id: user.id,
    kind: 'metadata_sidecar',
    source_bucket: BUCKET,
    source_path: audioPath,
    source_sha256: sourceSha256,
    artifact_bucket: BUCKET,
    artifact_path: artifactPath,
    artifact_sha256: artifactSha256,
    metadata_snapshot: metadataSnapshot,
    manifest,
    receipt,
    created_at: createdAt,
  })
  if (ledgerError) {
    await service.storage.from(BUCKET).remove([artifactPath])
    return NextResponse.json(
      { error: 'Could not record the delivery evidence. No source file was changed.' },
      { status: 502 }
    )
  }

  const documentsBase = `/api/vault/${projectId}/tracks/${trackId}/metadata/deliveries/${deliveryId}`
  return NextResponse.json({
    data: {
      deliveryId,
      url: signed.signedUrl,
      path: artifactPath,
      manifestUrl: `${documentsBase}/manifest`,
      receiptUrl: `${documentsBase}/receipt`,
    },
  })
}
