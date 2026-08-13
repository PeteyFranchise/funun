import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'

// ─── POST /api/sync-library/admin/[listingId]/quality ──────────────────
// LEADERSHIP-ONLY write of the Sync Library inclusion gate's manual
// quality-bar verdict + free-text staff guidance (30-CONTEXT.md "Quality
// bar → audio quality + genuine sync fit"; 30-RESEARCH.md Open Question
// 2 — a manual staff judgment for v1, no automated audio analysis).
// Persists the migration 107 columns on sync_listings; the admit route
// (30-04, app/api/sync-library/admin/[listingId]/route.ts) reads
// quality_ok back as the gate's qualityOk signal.
//
// T-30-06 (Elevation of Privilege): requireStaff(['leadership']) is the
// FIRST statement, before any DB read — quality/notes are curation
// writes, matching the admit/reject route's leadership-only gate (30-04
// access fix). T-30-09 (Tampering — gate-signal spoofing): this route
// only WRITES the staff's own judgment; it never reads or trusts a
// client-supplied gate verdict. T-30-05 (Repudiation): logStaffAction is
// called UNCONDITIONALLY after every successful write.

const NOTE_MAX_LENGTH = 1000

type RequestBody = { quality_ok?: unknown; quality_note?: unknown; staff_notes?: unknown }
type ListingRow = { id: string; status: string }

/** Trims + length-caps an optional free-text field; empty string clears it (null). */
function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed.slice(0, NOTE_MAX_LENGTH)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  // T-30-06: staff-gate-first, leadership-only — precedes any DB read.
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { listingId } = await params
  const body = (await request.json().catch(() => ({}))) as RequestBody

  // T-15-08-style input validation — never trust the raw client value.
  // Every field is optional, but present-and-provided must be well-typed;
  // at least one field must be present.
  const hasQualityOk = Object.prototype.hasOwnProperty.call(body, 'quality_ok')
  const hasQualityNote = Object.prototype.hasOwnProperty.call(body, 'quality_note')
  const hasStaffNotes = Object.prototype.hasOwnProperty.call(body, 'staff_notes')

  if (!hasQualityOk && !hasQualityNote && !hasStaffNotes) {
    return NextResponse.json(
      { error: 'Provide at least one of quality_ok, quality_note, or staff_notes.' },
      { status: 400 }
    )
  }
  if (hasQualityOk && typeof body.quality_ok !== 'boolean') {
    return NextResponse.json({ error: 'quality_ok must be a boolean.' }, { status: 400 })
  }
  if (hasQualityNote && typeof body.quality_note !== 'string') {
    return NextResponse.json({ error: 'quality_note must be a string.' }, { status: 400 })
  }
  if (hasStaffNotes && typeof body.staff_notes !== 'string') {
    return NextResponse.json({ error: 'staff_notes must be a string.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Target loaded from the DB by the path param — the body never carries
  // a listing identity.
  const { data: listingRaw, error: listingError } = await service
    .from('sync_listings')
    .select('id, status')
    .eq('id', listingId)
    .maybeSingle()
  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 })
  }
  const row = listingRaw as ListingRow | null
  if (!row) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const nowIso = new Date().toISOString()

  // Fixed allowlisted column set — never spread the request body.
  const update: Record<string, unknown> = {}
  if (hasQualityOk) {
    update.quality_ok = body.quality_ok as boolean
    update.quality_reviewed_by = auth.user.id
    update.quality_reviewed_at = nowIso
  }
  if (hasQualityNote) update.quality_note = normalizeNote(body.quality_note as string)
  if (hasStaffNotes) update.staff_notes = normalizeNote(body.staff_notes as string)

  const { error: updateError } = await service
    .from('sync_listings')
    .update(update)
    .eq('id', listingId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // T-30-05: UNCONDITIONAL, after the write.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.quality_review',
    targetType: 'sync_listing',
    targetId: listingId,
    changes: update,
  })

  return NextResponse.json({ data: { listingId, ...update } })
}
