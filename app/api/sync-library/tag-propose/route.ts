import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { proposeStaffRefinement } from '@/lib/tagging/tag-merge'
import { readDescriptors, sanitizeDescriptors, type TrackDescriptors } from '@/lib/metadata/schema'

// ─── POST /api/sync-library/tag-propose ─────────────────────────────────
// AE proposes a tag refinement; leadership/A&R proposals auto-confirm
// (30-CONTEXT.md "Tag curation + approval (Pete, 2026-08-13)" —
// supersedes the earlier leadership-only tag-curation note). The role
// branch itself is owned by lib/tagging/tag-merge.ts's
// proposeStaffRefinement(current, refined, staffUserId, role) — this route
// only resolves the caller's server-side staffRole, coerces the incoming
// descriptor fields to vocab, and persists.
//
// T-30-01 (Elevation of Privilege): requireStaff(['leadership','ae','anr'])
// — the tag-curation-capable staff (bd is not a tag curator here) — is the
// FIRST statement, before any DB read.
// T-30-14 (Elevation of Privilege — AE proposal never auto-confirms): the
// resolved staffRole (never a client-supplied role) drives
// proposeStaffRefinement's branch — an AE's proposal always lands
// `pending`.
// T-30-08 (Tampering — descriptors overwrite): sanitizeDescriptors coerces
// the incoming refinement to controlled vocab before it ever reaches
// proposeStaffRefinement; sibling tracks.metadata keys are preserved.
// T-30-05 (Repudiation): logStaffAction is called UNCONDITIONALLY after a
// successful write.

type RequestBody = { trackId?: unknown; descriptors?: unknown }
type TrackRow = { id: string; metadata: Record<string, unknown> | null }

function emptyDescriptors(): TrackDescriptors {
  return { moods: [], energy: null, vocal: null }
}

export async function POST(request: Request) {
  // T-30-01: staff-gate-first — precedes any DB read.
  const auth = await requireStaff(['leadership', 'ae', 'anr'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody
  const trackId = body.trackId
  if (typeof trackId !== 'string' || !trackId.trim()) {
    return NextResponse.json({ error: 'trackId is required.' }, { status: 400 })
  }

  // T-30-08: coerce the incoming refinement through the SAME vocab
  // coercion the artist-facing PATCH route uses — off-vocab values are
  // silently dropped, never persisted.
  const sanitized = sanitizeDescriptors(body.descriptors)
  if (!sanitized) {
    return NextResponse.json(
      { error: 'Provide at least one of moods, energy, vocal, or instruments.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // Target loaded from the DB by trackId — the body never carries the
  // current descriptors, only the proposed refinement.
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

  const current = readDescriptors(track.metadata) ?? emptyDescriptors()

  // T-30-14: the resolved (server-side) staffRole drives the branch — AE
  // proposals always land `pending`; leadership/A&R auto-confirm.
  const nextDescriptors = proposeStaffRefinement(
    current,
    {
      moods: sanitized.moods,
      energy: sanitized.energy,
      vocal: sanitized.vocal,
      instruments: sanitized.instruments ?? [],
    },
    auth.user.id,
    auth.staffRole
  )

  // Merge into the existing metadata JSONB — sibling keys survive untouched.
  const nextMetadata = { ...(track.metadata ?? {}), descriptors: nextDescriptors }

  const { error: updateError } = await service
    .from('tracks')
    .update({ metadata: nextMetadata })
    .eq('id', trackId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const isPending = !!nextDescriptors.pending

  // T-30-05: UNCONDITIONAL, after the write.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.tag_propose',
    targetType: 'track',
    targetId: trackId,
    changes: { role: auth.staffRole, pending: isPending, descriptors: nextDescriptors },
  })

  return NextResponse.json({ data: { trackId, pending: isPending, descriptors: nextDescriptors } })
}
