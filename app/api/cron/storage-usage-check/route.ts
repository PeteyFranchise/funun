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

const GB = 1024 ** 3

function gb(bytes: number): number {
  return Math.round((bytes / GB) * 10) / 10
}

type UsageRow = {
  owner_segment: string
  is_uuid: boolean
  total_bytes: number
  object_count: number
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const warningBytes = Math.floor(THRESHOLDS.account_storage_gb.warning * GB)

  const service = createServiceClient()
  const { data, error } = await service.rpc('storage_usage_over_threshold', {
    p_min_bytes: warningBytes,
  })

  if (error) {
    // A failed check is itself reportable — silence here would be
    // indistinguishable from "nobody is over threshold", which is the one
    // reading this job must never produce by accident.
    await fanOutAlert(
      'Funūn — storage usage check FAILED',
      `<p>The daily per-account Storage usage check could not run, so today's usage is <strong>unknown</strong> rather than healthy.</p>
       <p>No-data is never silently healthy — see <code>lib/observability/config.ts</code>.</p>`
    )
    return NextResponse.json({ error: 'Storage usage check failed' }, { status: 500 })
  }

  const rows = (data ?? []) as UsageRow[]
  const attributed = rows.filter(r => r.is_uuid)
  const unattributed = rows.filter(r => !r.is_uuid)

  const worstGb = rows.length > 0 ? gb(Math.max(...rows.map(r => r.total_bytes))) : 0
  const status = classifyThreshold('account_storage_gb', worstGb)

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, status: 'healthy', overThreshold: 0 })
  }

  // Summary only — counts and aggregates, never a user id or a file path.
  // The digest is email; identifying which account to look at is a deliberate
  // second step taken in the admin tooling, not something broadcast here
  // (T-32-06: alert content carries no raw user or Supabase records).
  const unattributedLine = unattributed.length > 0
    ? `<li><strong>${unattributed.length}</strong> unattributed path prefix(es) — objects whose first segment is not an account id, totalling ${gb(unattributed.reduce((n, r) => n + r.total_bytes, 0))} GB. These are worth looking at on their own: a file nobody can be billed for is its own kind of problem.</li>`
    : ''

  await fanOutAlert(
    `Funūn — ${attributed.length} account(s) over the Storage warning threshold`,
    `<p>Status: <strong>${status}</strong>. Daily per-account Storage check.</p>
     <ul>
       <li><strong>${attributed.length}</strong> account(s) at or above the ${THRESHOLDS.account_storage_gb.warning} GB warning band.</li>
       <li>Largest single footprint: <strong>${worstGb} GB</strong> (critical band is ${THRESHOLDS.account_storage_gb.critical} GB).</li>
       ${unattributedLine}
     </ul>
     <p>This is a detection job. Direct browser uploads bypass the server's upload-admission quotas, so a figure here is not necessarily abuse — a prolific artist with stems is legitimately large. It is a prompt to look, not a verdict.</p>
     <p>The durable fix is server-issued upload intents; see the M-01 todo.</p>`
  )

  return NextResponse.json({
    ok: true,
    status,
    overThreshold: attributed.length,
    unattributed: unattributed.length,
    worstGb,
  })
}
