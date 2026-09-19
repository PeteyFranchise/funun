import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { fanOutAlert } from '@/lib/observability/alerts'
import { THRESHOLDS, classifyThreshold } from '@/lib/observability/config'

// ─── GET /api/cron/storage-usage-check (M-01 stopgap) ──────────────────
// Invoked daily by Vercel Cron. Vercel attaches an
// `Authorization: Bearer $CRON_SECRET` header automatically — this route
// rejects any mismatch BEFORE doing any work, mirroring the fail-closed guard
// in cleanup-rate-limits and daily-observability-check. Without that check
// first, the route is a quota-burning DoS vector reachable by anyone.
//
// WHAT THIS IS: detection, not prevention. Storage RLS lets an authenticated
// user write directly under their own `{userId}/...` prefix, which never
// passes through `lib/security/upload-admission.ts`, so the server's daily
// count and byte quotas do not bind a direct browser upload. The proper fix is
// server-issued upload intents — a narrow, expiring, per-upload grant instead
// of a blanket one. This does not stop anyone consuming unbounded storage; it
// means nobody does so unnoticed, and nothing here is wasted when intents land.
//
// WHAT THIS MEASURES, AND WHAT IT DOES NOT: one number — total bytes in
// Storage, every bucket. It used to pass the per-account warning band as the
// RPC's floor, which meant the job returned zero rows and reported healthy
// unless a SINGLE path segment exceeded 25 GB; with real usage at 0.047 GB
// fragmented across many segments, it could never fire. It also called each
// path segment an "account", which is false: work audio is deliberately
// written to `{workId}/...` (see lib/catalogue/audio-mime.ts), playbook media
// to `{roomId}/...`, stream previews to `{trackId}/...`. Verified against
// production, most UUID segments are not people. So the RPC is used here as a
// plain inventory feed (floor 0) and nothing below is attributed to anyone.
// Per-account measurement returns when attribution does; until then this file
// must make no claim about who owns what.

const GB = 1024 ** 3

// Two decimals, not one: total usage today is ~0.047 GB, and a figure that
// renders as "0 GB" tells the reader nothing about the thing being watched.
function gb(bytes: number): number {
  return Math.round((bytes / GB) * 100) / 100
}

// Only the two aggregate columns are read. `owner_segment` and `is_uuid` are
// deliberately left unread: the first is not an owner, and the second's
// "unattributed prefix" framing was wrong too — `ideas/` is the one path
// already governed by server-issued upload intents, so a non-UUID prefix is
// not a problem to report.
type UsageRow = {
  total_bytes: number | string | null
  object_count: number | string | null
}

function num(value: number | string | null): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const service = createServiceClient()
  // Floor 0: every row, so the sum is the whole bucket. A threshold-derived
  // floor here is what made the job silent by construction.
  const { data, error } = await service.rpc('storage_usage_over_threshold', {
    p_min_bytes: 0,
  })

  if (error) {
    // A failed check is itself reportable — silence here would be
    // indistinguishable from "storage is healthy", which is the one
    // reading this job must never produce by accident.
    await fanOutAlert(
      'Funūn — storage usage check FAILED',
      `<p>The daily total Storage usage check could not run, so today's usage is <strong>unknown</strong> rather than healthy.</p>
       <p>No-data is never silently healthy — see <code>lib/observability/config.ts</code>.</p>`
    )
    return NextResponse.json({ error: 'Storage usage check failed' }, { status: 500 })
  }

  const rows = (data ?? []) as UsageRow[]
  const totalBytes = rows.reduce((n, r) => n + num(r.total_bytes), 0)
  const objectCount = rows.reduce((n, r) => n + num(r.object_count), 0)
  const segmentCount = rows.length

  // Classify the exact ratio, report the rounded one — so a 4.96 GB total is
  // not tipped into the warning band by display rounding.
  const status = classifyThreshold('storage_total_gb', totalBytes / GB)
  const totalGb = gb(totalBytes)

  const summary = { ok: true, status, totalGb, totalBytes, objectCount, segmentCount }

  // Silent below the band, on purpose. A daily email about 0.047 GB trains
  // the reader to ignore the one that matters.
  if (status === 'healthy') {
    return NextResponse.json(summary)
  }

  // Summary only — counts and aggregates, never a user id or a file path
  // (T-32-06: alert content carries no raw user or Supabase records).
  await fanOutAlert(
    `Funūn — total Storage at ${totalGb} GB (${status} band)`,
    `<p>Status: <strong>${status}</strong>. Daily total Storage check, all buckets.</p>
     <ul>
       <li>Total Storage: <strong>${totalGb} GB</strong> (warning band ${THRESHOLDS.storage_total_gb.warning} GB, critical band ${THRESHOLDS.storage_total_gb.critical} GB).</li>
       <li><strong>${objectCount}</strong> object(s) across <strong>${segmentCount}</strong> distinct path segment(s).</li>
     </ul>
     <p>A path segment is not a person. The first segment of a Storage path may be a work id, a room id, a track id or a user id, so the segment count is a shape-of-the-bucket figure and nothing more — it is not a headcount, and no part of this total is attributed to anyone.</p>
     <p>This is a detection job, not a quota and not a growth rate. Direct browser uploads bypass the server's upload-admission quotas, so a figure here is a prompt to look, not a verdict. The durable fix is server-issued upload intents; see the M-01 todo.</p>`
  )

  return NextResponse.json({ ...summary, alerted: true })
}
