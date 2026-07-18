import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { validateReportCreate, isReportTargetVisible, findOpenReport, toReportStatusView } from '@/lib/trust-safety/reports'

// ─── GET /api/reports ─────────────────────────────────────────────────────
// The caller's own report statuses only. Uses the SESSION client on
// purpose: migration 058's RLS (reporter_id = auth.uid()) plus its
// column-level GRANT (id, target_type, status, created_at only) already
// enforce both the row-scope and the field-lockdown, so this is genuine
// defense-in-depth rather than an app-level-only check. A reported user has
// no policy path to any row where they are the target, and admin fields
// (admin_notes, reviewed_by, reviewed_at, reason, details) are never
// selectable here even for the reporter's own row.
export async function GET() {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reports')
    .select('id, target_type, status, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as { id: string; target_type: string; status: string; created_at: string }[]
  return NextResponse.json({ data: rows.map(toReportStatusView) })
}

// ─── POST /api/reports  { targetType, targetId, reason, details? } ───────
// Creates a report for a profile, message, or Green Room post/comment/
// repost/placement target. All target-existence/visibility validation
// happens here, before any service-client write — the service role is only
// ever used after that gate passes.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validateReportCreate(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
  const input = validated.value

  if (input.targetType === 'profile' && input.targetId === user.id) {
    return NextResponse.json({ error: 'Cannot report your own profile' }, { status: 400 })
  }

  const service = createServiceClient()

  // "Doesn't exist" and "not visible to you" return the exact same error —
  // a reporter must never be able to probe hidden/blocked content existence
  // through this endpoint (SAFETY-02).
  const visible = await isReportTargetVisible(service, input.targetType, input.targetId, user.id)
  if (!visible) return NextResponse.json({ error: 'Report target not found' }, { status: 404 })

  // Dedupe: an already-open report for this exact reporter+target pair is
  // returned as-is rather than creating another row.
  const existing = await findOpenReport(service, user.id, input.targetType, input.targetId)
  if (existing) {
    return NextResponse.json({ data: toReportStatusView(existing) }, { status: 200 })
  }

  const { data, error } = await service
    .from('reports')
    .insert({
      reporter_id: user.id,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      details: input.details,
    })
    .select('id, target_type, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: toReportStatusView(data) }, { status: 201 })
}
