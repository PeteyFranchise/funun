import { NextResponse } from 'next/server'
import NodeID3 from 'node-id3'
import { randomUUID } from 'node:crypto'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildId3Fields } from '@/lib/metadata/export'
import {
  buildDeliveryArtifactPath,
  buildDeliveryDocuments,
  sha256Bytes,
} from '@/lib/metadata/delivery-safe'
import { audioExtension } from '@/lib/metadata/validate'

// ID3 writing needs Node APIs (Buffer / node-id3) — not the edge runtime.
export const runtime = 'nodejs'
export const maxDuration = 60

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'
const MAX_BYTES = 60 * 1024 * 1024 // 60 MB safety ceiling for in-memory tagging

const PROJECT_COLS =
  'title, type, genre, sub_genre, release_date, upc, cover_art_url, label, publisher, c_line, p_line, copyright_year, primary_language, contact_name, contact_email, contact_phone'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, explicit, language, featuring_artists, audio_file_url, metadata'

// POST /api/vault/[projectId]/tracks/[trackId]/metadata/embed
// Writes the captured metadata into an ID3v2 tag on the track's MP3 and
// stores a uniquely identified tagged delivery copy, freezes its manifest
// and receipt, and returns short-lived authenticated download links.
// Non-MP3 formats can't carry ID3 — the client should use the sidecar.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; trackId: string }> }
) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Embedding is not available in demo mode' },
      { status: 400 }
    )
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
    return NextResponse.json({ error: 'This track has no audio file yet.' }, { status: 400 })
  }

  const ext = audioExtension(audioPath)
  if (ext !== 'mp3') {
    return NextResponse.json(
      {
        error: `Embedded tags need an MP3. This file is ${ext ? ext.toUpperCase() : 'an unknown format'} — download the metadata sidecar and ship it alongside the file instead.`,
        useSidecar: true,
      },
      { status: 422 }
    )
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  // Use the service client for storage (private bucket, owner-scoped path).
  const service = createServiceClient()

  const { data: blob, error: dlError } = await service.storage.from(BUCKET).download(audioPath)
  if (dlError || !blob) {
    return NextResponse.json({ error: 'Could not read the audio file.' }, { status: 502 })
  }
  if (blob.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File is too large to tag in one request. Use the sidecar for now.' },
      { status: 413 }
    )
  }

  const bundle = buildBundle(
    project as unknown as ProjectRow,
    [track] as unknown as TrackRow[],
    profile?.artist_name ?? ''
  )
  const f = buildId3Fields(bundle, bundle.tracks[0])

  const tags: NodeID3.Tags = {
    title: f.title,
    artist: f.artist,
    performerInfo: f.albumArtist,
    album: f.album,
    composer: f.composer,
    trackNumber: f.trackNumber || undefined,
    year: f.year || undefined,
    genre: f.genre || undefined,
    copyright: f.copyright || undefined,
    publisher: f.publisher || undefined,
    language: f.language || undefined,
    bpm: f.bpm || undefined,
    comment: { language: 'eng', text: f.comment },
    ...(f.lyrics
      ? { unsynchronisedLyrics: { language: f.lyricsLanguage, text: f.lyrics } }
      : {}),
    userDefinedText: [
      f.isrc && { description: 'ISRC', value: f.isrc },
      f.iswc && { description: 'ISWC', value: f.iswc },
      f.upc && { description: 'BARCODE', value: f.upc },
    ].filter(Boolean) as { description: string; value: string }[],
  }

  const sourceBuffer = Buffer.from(await blob.arrayBuffer())
  const sourceSha256 = sha256Bytes(sourceBuffer)
  // node-id3 receives its own copy. The source bytes and source Storage path
  // are read-only inputs; only the unique delivery path below is written.
  const tagged = NodeID3.write(tags, Buffer.from(sourceBuffer))
  if (!Buffer.isBuffer(tagged)) {
    return NextResponse.json({ error: 'Tagging failed.' }, { status: 500 })
  }

  const deliveryId = randomUUID()
  const createdAt = new Date().toISOString()
  const taggedPath = buildDeliveryArtifactPath(audioPath, deliveryId, 'tagged_mp3')
  const artifactSha256 = sha256Bytes(tagged)
  const titleSlug =
    bundle.tracks[0].title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() ||
    'track'
  const { manifest, receipt } = buildDeliveryDocuments({
    deliveryId,
    createdAt,
    kind: 'tagged_mp3',
    projectId,
    trackId,
    actorUserId: user.id,
    source: { bucket: BUCKET, path: audioPath, sha256: sourceSha256 },
    artifact: {
      bucket: BUCKET,
      path: taggedPath,
      filename: `${titleSlug}.tagged.mp3`,
      mime_type: 'audio/mpeg',
      size_bytes: tagged.byteLength,
      sha256: artifactSha256,
    },
    metadataSnapshot: f as unknown as Record<string, unknown>,
  })

  // upsert:false is part of the custody boundary: a correction creates a
  // successor artifact and record; it never rewrites an earlier delivery.
  const { error: upError } = await service.storage
    .from(BUCKET)
    .upload(taggedPath, tagged, { contentType: 'audio/mpeg', upsert: false })
  if (upError) {
    return NextResponse.json({ error: 'Could not save the tagged file.' }, { status: 502 })
  }

  const { data: signed, error: signError } = await service.storage
    .from(BUCKET)
    .createSignedUrl(taggedPath, 60 * 60 * 2)
  if (signError || !signed?.signedUrl) {
    await service.storage.from(BUCKET).remove([taggedPath])
    return NextResponse.json({ error: 'Could not create the tagged-file download.' }, { status: 502 })
  }

  const { error: ledgerError } = await service.from('metadata_delivery_exports').insert({
    id: deliveryId,
    project_id: projectId,
    track_id: trackId,
    user_id: user.id,
    kind: 'tagged_mp3',
    source_bucket: BUCKET,
    source_path: audioPath,
    source_sha256: sourceSha256,
    artifact_bucket: BUCKET,
    artifact_path: taggedPath,
    artifact_sha256: artifactSha256,
    metadata_snapshot: f,
    manifest,
    receipt,
    created_at: createdAt,
  })
  if (ledgerError) {
    // Roll back only the just-created delivery copy. The source is never a
    // cleanup target, and no incomplete delivery is presented to the user.
    await service.storage.from(BUCKET).remove([taggedPath])
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
      path: taggedPath,
      fields: f,
      manifestUrl: `${documentsBase}/manifest`,
      receiptUrl: `${documentsBase}/receipt`,
    },
  })
}
