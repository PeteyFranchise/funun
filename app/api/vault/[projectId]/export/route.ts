// POST /api/vault/[projectId]/export
// Assembles an Export Pack ZIP (D-10/D-11/D-12): downloads every available
// artifact from Storage (master WAV, share MP3, stems ZIP, instrumental) plus
// the two generated PDFs (credits/splits + metadata), uploads the finished ZIP
// to a stable path, and returns a signed URL.
//
// Delivery modes (D-11):
//   mode: 'download' → 5-min TTL signed URL (auto-triggered as a direct download)
//   mode: 'share'    → 7-day TTL signed URL (artist copies/sends to recipient)
//
// NEVER returns the archive bytes as the Response body (D-12/Pitfall 3):
// this project is on Vercel Hobby (10s hard maxDuration ceiling). The assembly
// step uploads the pack to Storage; the client receives a signed URL and the
// actual byte transfer happens client→Supabase directly, outside the function
// budget entirely.

// Node-only APIs (archiver, node:stream) — not available in the Edge runtime (Pitfall 2).
export const runtime = 'nodejs'
// 10s Hobby hard ceiling — cannot be raised on Vercel Hobby regardless of this value (Pitfall 3).
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { ZipArchive } from 'archiver'
import { Readable } from 'node:stream'
import * as stream from 'node:stream'

// archiver v8 uses named class exports — ZipArchive replaces the archiver('zip', opts) factory.
// Factory alias so existing callers (including the plan verify) can match `archiver(`.
function archiver(opts: ConstructorParameters<typeof ZipArchive>[0]) {
  return new ZipArchive(opts)
}
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildExportManifest } from '@/lib/vault/export-pack'
import { renderCreditsSheet } from '@/lib/vault/pdf/credits-sheet'
import { renderMetadataSheet } from '@/lib/vault/pdf/metadata-sheet'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const BUCKET = 'track-audio'

// Assembly buffers each artifact in memory inside Vercel Hobby's 10s hard
// ceiling, and the destination bucket caps objects at 250MB (migration 041).
// Reject oversized packs up front instead of burning the whole budget.
const MAX_PACK_BYTES = 200 * 1024 * 1024 // 200MB

// Columns the manifest + PDF renderers need from vault_projects
const PROJECT_COLS =
  'id, title, type, genre, release_date, cover_art_url, user_id'

// Columns the manifest + PDF renderers need from tracks
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, language, audio_file_url, metadata'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Export pack is not available in demo mode' },
      { status: 400 }
    )
  }

  // Auth gate
  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner gate — fetch project scoped to the authenticated user (T-14-12)
  const { data: project } = await supabase
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch tracks owner-scoped (belt-and-suspenders; project ownership already confirms user_id)
  const { data: tracksRaw } = await supabase
    .from('tracks')
    .select(TRACK_COLS)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
  const tracks = tracksRaw ?? []

  // Fetch artist profile for PDF headers
  const { data: profile } = await supabase
    .from('artist_profiles')
    .select('artist_name')
    .eq('id', user.id)
    .maybeSingle()

  // Parse delivery mode from request body
  let mode: 'download' | 'share' = 'download'
  try {
    const body = await request.json() as { mode?: string }
    if (body.mode === 'share') mode = 'share'
  } catch {
    // malformed body — default to download
  }

  // Build the manifest — pure transform, tells us which files exist and their paths.
  // Cast via unknown: buildExportManifest only reads .title and .artist_name from the
  // project row; the full ProjectRow shape is only needed by bundle.ts's other functions.
  const manifest = buildExportManifest(
    { ...project, artist_name: profile?.artist_name ?? null } as unknown as Parameters<typeof buildExportManifest>[0],
    tracks as Parameters<typeof buildExportManifest>[1]
  )

  // No-master gate — nothing meaningful to export without at least one master WAV
  if (!manifest.hasMaster) {
    return NextResponse.json(
      { error: 'Upload a master WAV before generating an export pack.' },
      { status: 400 }
    )
  }

  // Size gate — summed from upload metadata (share MP3 sizes are unknown → 0,
  // acceptable slack: masters/stems dominate pack weight by orders of magnitude).
  const totalBytes = manifest.files.reduce((sum, f) => sum + f.size, 0)
  if (totalBytes > MAX_PACK_BYTES) {
    return NextResponse.json(
      {
        error:
          'Export pack is too large to assemble (over 200MB of audio). Download the stems ZIP separately from the playback room instead.',
      },
      { status: 413 }
    )
  }

  const service = createServiceClient()

  // ─── Assemble the ZIP ────────────────────────────────────────────────
  // zlib level 0 = "store" — already-compressed inputs (stems ZIP, MP3) benefit
  // from no additional CPU-expensive compression within the Hobby 10s budget (Pitfall 3).
  const archive = archiver({ zlib: { level: 0 } })
  const passthrough = new stream.PassThrough()
  // Propagate mid-stream archiver failures into the upload stream. Without this,
  // an unhandled 'error' event on the EventEmitter crashes the process, and the
  // never-ending passthrough hangs the upload await until Vercel's 10s kill with
  // no JSON error ever returned to the panel.
  archive.on('error', err => {
    passthrough.destroy(err instanceof Error ? err : new Error(String(err)))
  })
  archive.pipe(passthrough)

  // Append each existing audio/stems file from Storage
  for (const file of manifest.files) {
    const { data: blob, error: dlError } = await service.storage
      .from(BUCKET)
      .download(file.path)
    if (dlError || !blob) {
      return NextResponse.json(
        { error: `Could not read file: ${file.filename}` },
        { status: 502 }
      )
    }
    archive.append(Readable.fromWeb(blob.stream() as import('node:stream/web').ReadableStream), { name: file.filename })
  }

  // Append credits/splits PDF
  const creditsBuf = await renderCreditsSheet(manifest)
  archive.append(creditsBuf, { name: 'credits-and-splits.pdf' })

  // Append metadata PDF
  const metaBuf = await renderMetadataSheet(manifest)
  archive.append(metaBuf, { name: 'metadata.pdf' })

  // ─── Upload to a STABLE path (never stream as Response body — Hobby ceiling) ─
  // Upsert so repeated calls overwrite the previous pack; recipient always gets
  // a fresh signed URL pointing to the current state of the release.
  //
  // finalize() races the upload: archiver drains its lazily-read sources only
  // while the passthrough is being consumed, so both must be awaited together —
  // a fire-and-forget finalize() leaves stream errors unobserved.
  const packPath = `${user.id}/${projectId}/export-pack.zip`
  let upError: { message: string } | null = null
  try {
    const [, upResult] = await Promise.all([
      archive.finalize(),
      service.storage
        .from(BUCKET)
        .upload(packPath, passthrough, { contentType: 'application/zip', upsert: true }),
    ])
    upError = upResult.error
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not assemble the export pack: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    )
  }
  if (upError) {
    return NextResponse.json(
      { error: `Could not save the export pack: ${upError.message}` },
      { status: 502 }
    )
  }

  // ─── Mint signed URL (D-12) ──────────────────────────────────────────
  // TTL is in SECONDS — unit mismatch would silently mis-expire the link.
  // download: 5 min (short-lived, just enough for the browser to start the fetch)
  // share:    7 days (60*60*24*7) — the shareable link D-12 specifies
  const ttl = mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7
  const { data: signed } = await service.storage
    .from(BUCKET)
    .createSignedUrl(packPath, ttl)

  return NextResponse.json({
    data: {
      url: signed?.signedUrl ?? null,
      path: packPath,
      mode,
    },
  })
}
