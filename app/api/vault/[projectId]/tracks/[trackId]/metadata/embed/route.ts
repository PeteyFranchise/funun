import { NextResponse } from 'next/server'
import NodeID3 from 'node-id3'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildBundle, type ProjectRow, type TrackRow } from '@/lib/metadata/bundle'
import { buildId3Fields } from '@/lib/metadata/export'
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
// stores a tagged "delivery copy", returning a short-lived signed URL.
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
    .from('artist_profiles')
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
  const tagged = NodeID3.write(tags, sourceBuffer)
  if (!Buffer.isBuffer(tagged)) {
    return NextResponse.json({ error: 'Tagging failed.' }, { status: 500 })
  }

  // Store the tagged delivery copy next to the original, then sign it.
  const taggedPath = audioPath.replace(/(\.[^.]+)$/, '') + '.tagged.mp3'
  const { error: upError } = await service.storage
    .from(BUCKET)
    .upload(taggedPath, tagged, { contentType: 'audio/mpeg', upsert: true })
  if (upError) {
    return NextResponse.json({ error: 'Could not save the tagged file.' }, { status: 502 })
  }

  const { data: signed } = await service.storage
    .from(BUCKET)
    .createSignedUrl(taggedPath, 60 * 60 * 2)

  return NextResponse.json({
    data: {
      url: signed?.signedUrl ?? null,
      path: taggedPath,
      fields: f,
    },
  })
}
