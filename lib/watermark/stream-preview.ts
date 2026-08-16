// ─── Stream-preview render pipeline (31-12) ────────────────────────────────
// Implements WatermarkProvider.renderStreamPreview against the 31-01 contract
// (lib/watermark/provider.ts) using the owner-locked approach (README.md,
// 2026-08-16 — LOCKED at the Task 2 blocking-human checkpoint): in-house,
// async/pre-computed rendering — never inline in a request handler (Vercel
// Hobby tier confirmed, 10s maxDuration).
//
// T-31-27 / T-31-29 (Information Disclosure, mitigate): output is written to
// a PRIVATE previews bucket at a path keyed by track_id, distinct from the
// master bucket (`track-audio`). The master path is read here but never
// returned or re-exposed — callers get back only the new previews-bucket
// path (see WatermarkRenderResult).
//
// T-31-28 (Denial of Service, mitigate): renderPreviewIfAbsent is the entry
// point callers should invoke, and it is meant to be fired WITHOUT awaiting
// the render itself from a request handler (see signed-url.ts) — a
// not-yet-ready track resolves to a 'processing' status instead of blocking.

import { createServiceClient } from '@/lib/supabase/server'
import { readMasterAudio } from '@/lib/metadata/schema'
import type {
  WatermarkProvider,
  WatermarkRenderInput,
  WatermarkForensicInput,
  WatermarkRenderResult,
} from './provider'

const MASTER_BUCKET = 'track-audio'
export const PREVIEWS_BUCKET = 'selects-stream-previews'

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
}

// PCM formats we can tone-inject directly (uncompressed containers only —
// no codec/watermarking package is installed, per README.md Prohibitions).
// Compressed sources (mp3/aac/flac/ogg/webm) are copied through untagged
// for now; full codec-aware tone injection for compressed formats is a
// tracked fast-follow (see 31-12-SUMMARY.md "Known Stubs") — it does not
// weaken the R12/T-31-27 guarantee this plan is verified against, which is
// that the player can never resolve a signed URL against the MASTER path,
// regardless of whether a given source format could be tone-injected.
const PCM_EXTENSIONS = new Set(['wav'])

function extensionOf(path: string): string {
  const clean = path.split('?')[0]
  const m = clean.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

/**
 * The deterministic previews-bucket path for a track's stream preview.
 * Keyed by track_id ONLY (not selects_id or share_token) — the stream tag
 * is not per-recipient, so one render is reused across every Selects/share
 * that includes this track (idempotent, cacheable per-track).
 */
function previewPath(trackId: string, ext: string): string {
  return `${trackId}/preview.${ext}`
}

/**
 * Ensure the private previews bucket exists. Idempotent — a bucket that
 * already exists is a no-op. Provisioned at runtime (service-role client),
 * not via a schema migration: this project's migrations are human-gated and
 * pushed manually (see migrations/111_selects.sql header — "this project
 * never runs `supabase db push` from an agent"); a storage bucket carries no
 * such gate and is safe to create from server-side service-role code.
 */
async function ensurePreviewsBucket(): Promise<void> {
  const service = createServiceClient()
  const { data: existing } = await service.storage.getBucket(PREVIEWS_BUCKET)
  if (existing) return

  const { error } = await service.storage.createBucket(PREVIEWS_BUCKET, {
    public: false,
    fileSizeLimit: 60 * 1024 * 1024, // 60MB safety ceiling, mirrors embed route's in-memory cap
  })
  // Ignore a race-lost "already exists" — a concurrent render request may
  // have created it first; the bucket existing either way satisfies this
  // function's postcondition.
  if (error && !/exists/i.test(error.message)) {
    throw error
  }
}

// ─── WAV PCM tone injection (D-01 audible-tag character) ───────────────────
// A brief, soft, sub-audible tonal pulse at fixed intervals — the
// owner-locked default (README.md), implemented in-house against raw PCM
// samples (no ffmpeg/codec package). Kept subtle enough that a genuine 30s+
// evaluative listen (R13's qualified-listen bar) still reads as a real
// listen, not a degraded one.

const PULSE_INTERVAL_SECONDS = 15 // a brief pulse every 15s of playback
const PULSE_DURATION_SECONDS = 0.25 // 250ms pulse
const PULSE_FREQUENCY_HZ = 60 // sub-audible/low-register tone
const PULSE_AMPLITUDE = 0.03 // soft — non-intrusive per D-01

type WavInfo = {
  dataOffset: number
  dataLength: number
  sampleRate: number
  bitsPerSample: number
  channels: number
}

/** Minimal RIFF/WAVE header parse — locates the `fmt ` and `data` chunks. */
function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null
  }

  let offset = 12
  let fmt: { sampleRate: number; bitsPerSample: number; channels: number } | null = null
  let data: { offset: number; length: number } | null = null

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (chunkId === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    } else if (chunkId === 'data') {
      data = { offset: body, length: chunkSize }
    }
    offset = body + chunkSize + (chunkSize % 2)
  }

  if (!fmt || !data) return null
  return {
    dataOffset: data.offset,
    dataLength: Math.min(data.length, buf.length - data.offset),
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    channels: fmt.channels,
  }
}

/** Mix the pulse additively into 16-bit PCM samples, clamped to avoid clipping. */
function tonePulseWav(buf: Buffer): Buffer {
  const info = parseWav(buf)
  if (!info || info.bitsPerSample !== 16) return buf // only the common case is handled

  const out = Buffer.from(buf) // copy — never mutate the source bytes
  const bytesPerSample = 2
  const frameBytes = bytesPerSample * info.channels
  const totalFrames = Math.floor(info.dataLength / frameBytes)
  const pulseIntervalFrames = Math.round(PULSE_INTERVAL_SECONDS * info.sampleRate)
  const pulseDurationFrames = Math.round(PULSE_DURATION_SECONDS * info.sampleRate)
  if (pulseIntervalFrames <= 0 || pulseDurationFrames <= 0) return out

  for (let frame = 0; frame < totalFrames; frame++) {
    const posInCycle = frame % pulseIntervalFrames
    if (posInCycle >= pulseDurationFrames) continue

    const t = posInCycle / info.sampleRate
    const envelope = Math.sin((Math.PI * posInCycle) / pulseDurationFrames) // fade in/out
    const toneSample = Math.sin(2 * Math.PI * PULSE_FREQUENCY_HZ * t) * PULSE_AMPLITUDE * envelope
    const base = info.dataOffset + frame * frameBytes

    for (let ch = 0; ch < info.channels; ch++) {
      const sampleOffset = base + ch * bytesPerSample
      if (sampleOffset + 1 >= out.length) continue
      const original = out.readInt16LE(sampleOffset)
      const mixed = original / 32768 + toneSample
      const clamped = Math.max(-1, Math.min(1, mixed))
      out.writeInt16LE(Math.round(clamped * 32767), sampleOffset)
    }
  }

  return out
}

function injectTonalPulse(bytes: Buffer, ext: string): Buffer {
  if (!PCM_EXTENSIONS.has(ext)) return bytes
  return tonePulseWav(bytes)
}

// ─── WatermarkProvider implementation ──────────────────────────────────────

/**
 * Render the stream-preview tag for a track. Reads the master audio from
 * the PRIVATE `track-audio` bucket (input.masterAudioPath) and writes a NEW
 * watermarked file to the PRIVATE previews bucket, keyed by track_id — the
 * master path is never returned (T-31-27).
 */
export async function renderStreamPreview(
  input: WatermarkRenderInput
): Promise<WatermarkRenderResult> {
  try {
    await ensurePreviewsBucket()
    const service = createServiceClient()

    const { data: blob, error: dlError } = await service.storage
      .from(MASTER_BUCKET)
      .download(input.masterAudioPath)
    if (dlError || !blob) {
      return { status: 'failed', path: null, contentType: null, renderedAt: null }
    }

    const ext = extensionOf(input.masterAudioPath) || 'wav'
    const contentType = CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream'
    const sourceBytes = Buffer.from(await blob.arrayBuffer())
    const watermarked = injectTonalPulse(sourceBytes, ext)

    const path = previewPath(input.trackId, ext)
    const { error: upError } = await service.storage
      .from(PREVIEWS_BUCKET)
      .upload(path, watermarked, { contentType, upsert: true })
    if (upError) {
      return { status: 'failed', path: null, contentType: null, renderedAt: null }
    }

    return { status: 'ready', path, contentType, renderedAt: new Date().toISOString() }
  } catch {
    return { status: 'failed', path: null, contentType: null, renderedAt: null }
  }
}

/**
 * The A2 fast-follow (per-share forensic download, D-03). Stubbed here so
 * the WatermarkProvider contract is fully implemented against provider.ts,
 * but it does no rendering — the shareable player (31-13) must treat this
 * as "not yet available" and MUST NOT fall back to a clean master download.
 */
export async function renderForensicDownload(
  _input: WatermarkForensicInput
): Promise<WatermarkRenderResult> {
  return { status: 'pending', path: null, contentType: null, renderedAt: null }
}

/**
 * Cheap existence check against the previews bucket — used both by
 * renderPreviewIfAbsent (idempotency) and getPreviewSignedUrl (status).
 * Never touches the master bucket.
 */
export async function findExistingPreview(trackId: string): Promise<WatermarkRenderResult | null> {
  const service = createServiceClient()
  const { data: files } = await service.storage.from(PREVIEWS_BUCKET).list(trackId, { limit: 1 })
  const file = files?.find(f => f.name.startsWith('preview.'))
  if (!file) return null

  const ext = extensionOf(file.name)
  return {
    status: 'ready',
    path: `${trackId}/${file.name}`,
    contentType: CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream',
    renderedAt: file.updated_at ?? file.created_at ?? null,
  }
}

/**
 * Resolve a track's master audio path and render its stream preview if one
 * does not already exist. Idempotent — a second call for an already-ready
 * track is a cheap existence check, not a re-render (T-31-28).
 *
 * This is the entry point the player/signed-url layer calls, and it MUST be
 * invoked without being awaited inside a request handler's response path —
 * see signed-url.ts's getPreviewSignedUrl.
 */
export async function renderPreviewIfAbsent(trackId: string): Promise<WatermarkRenderResult> {
  const existing = await findExistingPreview(trackId)
  if (existing) return existing

  const service = createServiceClient()
  const { data: track } = await service
    .from('tracks')
    .select('audio_file_url, metadata')
    .eq('id', trackId)
    .maybeSingle()

  const masterAudioPath: string | null =
    (track?.audio_file_url as string | null | undefined) ??
    readMasterAudio(track?.metadata as Record<string, unknown> | null | undefined)?.path ??
    null

  if (!masterAudioPath) {
    return { status: 'failed', path: null, contentType: null, renderedAt: null }
  }

  // selectsId is unused for the stream-preview path (cacheable per-track,
  // not per-recipient) — carried only for parity with WatermarkRenderInput,
  // which is shared with the per-share forensic-download method.
  return renderStreamPreview({ masterAudioPath, trackId, selectsId: '' })
}

// Type-level assertion that this module satisfies the WatermarkProvider
// contract (structural check only — 31-12/31-13 call sites import the free
// functions directly rather than a class instance).
const _provider: WatermarkProvider = { renderStreamPreview, renderForensicDownload }
void _provider
