// ─── Export-pack assembly (audit #10) ─────────────────────────────────────
// Extracted from the export route so the SAME plan-load + ZIP-assembly runs
// both inline (small packs, in the request) and on the durable worker (large
// packs, off the 10s request path). All fetches use the service client scoped
// by user_id, so the worker — which has no user session — is exactly as
// owner-safe as the inline path.

// Node-only APIs (archiver, node:stream) — not available in the Edge runtime.
import { ZipArchive } from 'archiver'
import { Readable } from 'node:stream'
import * as stream from 'node:stream'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildExportManifest,
  type ExportManifest,
  type ManifestProjectInput,
  type ManifestTrackInput,
} from '@/lib/vault/export-pack'
import { resolveStorageBytes } from '@/lib/vault/export-size'
import { renderCreditsSheet } from '@/lib/vault/pdf/credits-sheet'
import { renderMetadataSheet } from '@/lib/vault/pdf/metadata-sheet'

// archiver v8 uses named class exports — ZipArchive replaces the archiver('zip', opts) factory.
function archiver(opts: ConstructorParameters<typeof ZipArchive>[0]) {
  return new ZipArchive(opts)
}

export const EXPORT_BUCKET = 'track-audio'

// Assembly buffers each artifact in memory, and the destination bucket caps
// objects at 250MB (migration 041). Reject oversized packs up front.
export const MAX_PACK_BYTES = 200 * 1024 * 1024 // 200MB

// Packs at/under this go inline in the request (fit comfortably in Hobby's 10s
// ceiling); larger ones are routed to the background worker (audit #10). Heuristic
// — tunable as real pack sizes are observed.
export const INLINE_THRESHOLD_BYTES = 80 * 1024 * 1024 // 80MB

// Columns the manifest + PDF renderers need from vault_projects / tracks.
const PROJECT_COLS = 'id, title, type, genre, release_date, cover_art_url, user_id'
const TRACK_COLS =
  'id, title, track_number, isrc, iswc, duration_seconds, bpm, key_signature, language, audio_file_url, metadata'

export type ExportPlan = {
  manifest: ExportManifest
  /** Real Storage bytes when resolvable, else the manifest's DB-metadata sum. */
  totalBytes: number
}

/**
 * Load everything assembly needs for a project, scoped to its owner. Returns
 * null when the project doesn't exist or isn't owned by userId (the ownership
 * gate — the service client is scoped by user_id, so a non-owner sees nothing).
 */
export async function loadExportPlan(
  service: SupabaseClient,
  { projectId, userId }: { projectId: string; userId: string }
): Promise<ExportPlan | null> {
  const { data: project } = await service
    .from('vault_projects')
    .select(PROJECT_COLS)
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!project) return null

  const { data: tracksRaw } = await service
    .from('tracks')
    .select(TRACK_COLS)
    .eq('project_id', projectId)
    .eq('user_id', userId)
  const tracks = tracksRaw ?? []

  const { data: profile } = await service
    .from('user_profiles')
    .select('artist_name')
    .eq('id', userId)
    .maybeSingle()

  // project/tracks come from the untyped service client (any) — buildExportManifest
  // declares the minimal fields it reads (ManifestProjectInput / ManifestTrackInput).
  const manifest = buildExportManifest(
    { ...project, artist_name: profile?.artist_name ?? null } as ManifestProjectInput,
    tracks as ManifestTrackInput[]
  )

  // Resolve ACTUAL Storage object sizes rather than trusting the manifest's DB
  // metadata (stem/instrumental sizes are client-provided + uncapped, so the
  // metadata sum can badly undercount — audit #10). Fall back to the metadata
  // sum only when Storage sizes can't be read, so a transient stat hiccup never
  // blocks a legitimate export.
  const realBytes = await resolveStorageBytes(service, EXPORT_BUCKET, manifest.files.map(f => f.path))
  const totalBytes = realBytes ?? manifest.files.reduce((sum, f) => sum + f.size, 0)

  return { manifest, totalBytes }
}

/**
 * Assemble the ZIP for a manifest and upload it to packPath (upsert). Throws on
 * any download/assembly/upload failure so the caller (route → 502, worker →
 * failJob/retry) can react. Never returns the archive bytes.
 */
export async function assembleAndUploadPack(
  service: SupabaseClient,
  { manifest, packPath }: { manifest: ExportManifest; packPath: string }
): Promise<void> {
  // zlib level 0 = "store" — already-compressed inputs (stems ZIP, MP3) gain
  // nothing from extra CPU-expensive compression.
  const archive = archiver({ zlib: { level: 0 } })
  const passthrough = new stream.PassThrough()
  // Propagate mid-stream archiver failures into the upload stream — without this
  // an unhandled 'error' event crashes the process and the passthrough hangs the
  // upload await until the function is killed with no error surfaced.
  archive.on('error', err => {
    passthrough.destroy(err instanceof Error ? err : new Error(String(err)))
  })
  archive.pipe(passthrough)

  for (const file of manifest.files) {
    const { data: blob, error: dlError } = await service.storage.from(EXPORT_BUCKET).download(file.path)
    if (dlError || !blob) {
      throw new Error(`Could not read file: ${file.filename}`)
    }
    archive.append(Readable.fromWeb(blob.stream() as import('node:stream/web').ReadableStream), {
      name: file.filename,
    })
  }

  const creditsBuf = await renderCreditsSheet(manifest)
  archive.append(creditsBuf, { name: 'credits-and-splits.pdf' })

  const metaBuf = await renderMetadataSheet(manifest)
  archive.append(metaBuf, { name: 'metadata.pdf' })

  // finalize() races the upload: archiver drains its lazily-read sources only
  // while the passthrough is consumed, so both must be awaited together — a
  // fire-and-forget finalize() leaves stream errors unobserved.
  const [, upResult] = await Promise.all([
    archive.finalize(),
    service.storage
      .from(EXPORT_BUCKET)
      .upload(packPath, passthrough, { contentType: 'application/zip', upsert: true }),
  ])
  if (upResult.error) {
    throw new Error(`Could not save the export pack: ${upResult.error.message}`)
  }
}
