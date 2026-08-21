// POST /api/vault/[projectId]/export
// Assembles an Export Pack ZIP (D-10/D-11/D-12): every available artifact from
// Storage (master WAV, share MP3, stems ZIP, instrumental) plus the two
// generated PDFs (credits/splits + metadata), uploaded to a stable path, with a
// signed URL returned.
//
// Delivery modes (D-11):
//   mode: 'download' → 5-min TTL signed URL (auto-triggered as a direct download)
//   mode: 'share'    → 7-day TTL signed URL (artist copies/sends to recipient)
//
// NEVER returns the archive bytes as the Response body (D-12/Pitfall 3): the
// pack is uploaded to Storage and the client receives a signed URL, so the byte
// transfer happens client→Supabase directly, outside the function budget.
//
// Small packs assemble inline (fit in Hobby's 10s ceiling). Packs over
// INLINE_THRESHOLD_BYTES are handed to the durable background worker (audit #10)
// so they stop timing out mid-assembly; the client polls ./export/status.

// Node-only APIs (archiver, node:stream) run in the assembly module — not
// available in the Edge runtime (Pitfall 2).
export const runtime = 'nodejs'
// 10s Hobby hard ceiling — cannot be raised on Vercel Hobby regardless of this value (Pitfall 3).
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { enqueueJob } from '@/lib/jobs/queue'
import {
  loadExportPlan,
  assembleAndUploadPack,
  EXPORT_BUCKET,
  MAX_PACK_BYTES,
  INLINE_THRESHOLD_BYTES,
} from '@/lib/vault/export-assemble'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

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
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse delivery mode from request body
  let mode: 'download' | 'share' = 'download'
  try {
    const body = (await request.json()) as { mode?: string }
    if (body.mode === 'share') mode = 'share'
  } catch {
    // malformed body — default to download
  }

  const service = createServiceClient()

  // Load the plan — scoped by user_id, so a missing/unowned project returns null
  // (this IS the owner gate; T-14-12).
  const plan = await loadExportPlan(service, { projectId, userId: user.id })
  if (!plan) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // No-master gate — nothing meaningful to export without at least one master WAV
  if (!plan.manifest.hasMaster) {
    return NextResponse.json(
      { error: 'Upload a master WAV before generating an export pack.' },
      { status: 400 }
    )
  }

  // Size gate — reject packs too large to assemble even on the worker.
  if (plan.totalBytes > MAX_PACK_BYTES) {
    return NextResponse.json(
      {
        error:
          'Export pack is too large to assemble (over 200MB of audio). Download the stems ZIP separately from the playback room instead.',
      },
      { status: 413 }
    )
  }

  const packPath = `${user.id}/${projectId}/export-pack.zip`

  // ─── Large pack → durable worker (audit #10) ─────────────────────────────
  // Over the inline threshold, assembly won't finish inside 10s — enqueue it and
  // let the client poll ./export/status. Dedup per (user, project, mode) so a
  // double-click collapses to one active job.
  if (plan.totalBytes > INLINE_THRESHOLD_BYTES) {
    const job = await enqueueJob({
      type: 'vault_export',
      dedupKey: `vault_export:${user.id}:${projectId}:${mode}`,
      payload: { projectId, userId: user.id, mode },
    })
    if (!job) {
      return NextResponse.json({ error: 'Could not queue the export pack.' }, { status: 500 })
    }
    return NextResponse.json({ data: { queued: true, jobId: job.id, mode } })
  }

  // ─── Small pack → inline assembly ────────────────────────────────────────
  try {
    await assembleAndUploadPack(service, { manifest: plan.manifest, packPath })
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not assemble the export pack: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    )
  }

  // ─── Mint signed URL (D-12) ──────────────────────────────────────────────
  // TTL is in SECONDS. download: 5 min; share: 7 days (60*60*24*7).
  const ttl = mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7
  const { data: signed } = await service.storage.from(EXPORT_BUCKET).createSignedUrl(packPath, ttl)

  return NextResponse.json({
    data: {
      url: signed?.signedUrl ?? null,
      path: packPath,
      mode,
    },
  })
}
