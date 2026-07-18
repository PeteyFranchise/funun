import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { validateReportPatch, applyContentAction } from '@/lib/trust-safety/admin-reports'
import type { ReportTargetType } from '@/lib/trust-safety/contracts'

type ExistingReportRow = { id: string; target_type: ReportTargetType; target_id: string; status: string }

// ─── PATCH /api/admin/reports/[id] ────────────────────────────────────────
// Body: { status?, adminNotes?, contentAction? }
// Moves a report to under_review/actioned/dismissed, records an internal
// note (admin-only — never exposed to the reporter's status view), and
// optionally routes to the target's existing hide/remove/pause mechanism
// (green_room_post/comment moderation_status, green_room_repost
// deleted_at, green_room_placement status) when the report's target_type
// supports it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: existing, error: fetchError } = await service
    .from('reports')
    .select('id, target_type, target_id, status')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  const row = existing as ExistingReportRow

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validateReportPatch(body, row.target_type)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
  const { update, contentAction } = validated.value

  if (contentAction) {
    const result = await applyContentAction(service, row.target_type, row.target_id, contentAction)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  }

  const { data, error } = await service
    .from('reports')
    .update({ ...update, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json({ data })
}
