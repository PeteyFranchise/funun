import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { approvePendingTags, rejectPendingTags } from '@/lib/tagging/tag-merge'
import { readDescriptors } from '@/lib/metadata/schema'

// ─── POST /api/sync-library/tag-approve ─────────────────────────────────
// Leadership/A&R approve or reject an AE's pending tag proposal
// (30-CONTEXT.md "Tag proposals made by leadership/A&R auto-confirm; AE
// proposals sit `pending` until a leadership/A&R approve action confirms
// (or rejects) them"). Gated to ONLY leadership + anr — an AE, even the
// original proposer, can never approve their own (or anyone's) proposal.
//
// T-30-01 / T-30-14 (Elevation of Privilege): requireStaff(['leadership',
// 'anr']) is the FIRST statement, before any DB read — an AE gets 403.
// T-30-08 (Tampering — descriptors overwrite): approvePendingTags/
// rejectPendingTags (lib/tagging/tag-merge.ts) are the single write
// primitives; sibling tracks.metadata keys are preserved.
// T-30-05 (Repudiation): logStaffAction is called UNCONDITIONALLY after a
// successful write.

const VALID_DECISIONS = ['approve', 'reject'] as const

type RequestBody = { trackId?: unknown; decision?: unknown }
type TrackRow = { id: string; metadata: Record<string, unknown> | null }

export async function POST(request: Request) {
  // T-30-01 / T-30-14: staff-gate-first, leadership+anr ONLY — precedes any
  // DB read. AE (incl. the proposer) → 403.
  const auth = await requireStaff(['leadership', 'anr'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody
  const trackId = body.trackId
  if (typeof trackId !== 'string' || !trackId.trim()) {
    return NextResponse.json({ error: 'trackId is required.' }, { status: 400 })
  }

  // T-15-08-style input validation — mirrors the admin admit/reject
  // route's hand-rolled decision allowlist.
  const decision = body.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json(
      { error: `decision must be one of: ${VALID_DECISIONS.join(', ')}.` },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // Target loaded from the DB by trackId — the body never carries the
  // proposal itself, only the decision.
  const { data: trackRaw, error: trackError } = await service
    .from('tracks')
    .select('id, metadata')
    .eq('id', trackId)
    .maybeSingle()
  if (trackError) {
    return NextResponse.json({ error: trackError.message }, { status: 500 })
  }
  const track = trackRaw as TrackRow | null
  if (!track) {
    return NextResponse.json({ error: 'Track not found.' }, { status: 404 })
  }

  const current = readDescriptors(track.metadata)
  const previousPending = current?.pending ?? null
  if (!previousPending) {
    return NextResponse.json(
      { error: 'This track has no pending tag proposal to decide.' },
      { status: 409 }
    )
  }

  const nextDescriptors =
    decision === 'approve'
      ? approvePendingTags(current!, auth.user.id)
      : rejectPendingTags(current!)

  // Merge into the existing metadata JSONB — sibling keys survive untouched.
  const nextMetadata = { ...(track.metadata ?? {}), descriptors: nextDescriptors }

  const { error: updateError } = await service
    .from('tracks')
    .update({ metadata: nextMetadata })
    .eq('id', trackId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // T-30-05: UNCONDITIONAL, after the write.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: decision === 'approve' ? 'sync_library.tag_approve' : 'sync_library.tag_reject',
    targetType: 'track',
    targetId: trackId,
    changes: { previousPending },
  })

  return NextResponse.json({ data: { trackId, decision, descriptors: nextDescriptors } })
}
