import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { suggestTrackTags } from '@/lib/tagging/ai-tag'
import { mergeAiSuggestion } from '@/lib/tagging/tag-merge'
import { readDescriptors, readLyrics, type TrackDescriptors } from '@/lib/metadata/schema'
import { aiAdmissionError, aiProviderSignal, claimAiUsage, finishAiUsage } from '@/lib/ai/admission'

// ─── POST /api/sync-library/tag-suggest ─────────────────────────────────
// Staff-triggered AI tag suggestion (30-CONTEXT.md "Tagging... layered, all
// three: AI suggests (auto-listen)..."). Writes ONLY to
// tracks.metadata.descriptors.ai_suggested — NEVER the artist-confirmed
// moods/energy/vocal/instruments (lib/tagging/tag-merge.ts's
// mergeAiSuggestion is the structural guarantee).
//
// T-30-01 (Elevation of Privilege): requireStaff() (default ALL_STAFF_ROLES
// — suggestion is broad staff read/curation-assist, kept staff-only) is the
// FIRST statement, before any DB read.
// T-30-04 (Tampering — prompt injection): suggestTrackTags() constrains its
// output to the enumerated mood/energy/vocal/instrument/genre vocab; only
// coerced values are ever persisted.
// T-30-05 (Repudiation): logStaffAction is called UNCONDITIONALLY after a
// successful write.

type RequestBody = { trackId?: unknown }
type TrackRow = { id: string; title: string | null; metadata: Record<string, unknown> | null }

function emptyDescriptors(): TrackDescriptors {
  return { moods: [], energy: null, vocal: null }
}

export async function POST(request: Request) {
  // T-30-01: staff-gate-first — precedes any DB read.
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as RequestBody
  const trackId = body.trackId
  if (typeof trackId !== 'string' || !trackId.trim()) {
    return NextResponse.json({ error: 'trackId is required.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Target loaded from the DB by trackId — the body never carries the
  // artist-supplied prompt text directly, only the id to look it up by.
  const { data: trackRaw, error: trackError } = await service
    .from('tracks')
    .select('id, title, metadata')
    .eq('id', trackId)
    .maybeSingle()
  if (trackError) {
    return NextResponse.json({ error: trackError.message }, { status: 500 })
  }
  const track = trackRaw as TrackRow | null
  if (!track) {
    return NextResponse.json({ error: 'Track not found.' }, { status: 404 })
  }

  const lyrics = readLyrics(track.metadata)
  const sessionClient = await createApiClient()
  const admission = await claimAiUsage(sessionClient, request, {
    operation: 'sync-library:tag-suggest',
    units: 1,
  })
  if (!admission.allowed) {
    const denied = aiAdmissionError(admission)
    return NextResponse.json({ error: denied.error }, { status: denied.status })
  }

  const result = await suggestTrackTags({
    title: track.title ?? '',
    text: lyrics?.text ?? '',
  }, aiProviderSignal())
  await finishAiUsage(sessionClient, admission.claimId, result.ok)

  if (!result.ok) {
    // Graceful, non-500 result the UI can show ("AI tagging is offline").
    return NextResponse.json({ data: { ok: false, error: result.error } })
  }

  const current = readDescriptors(track.metadata) ?? emptyDescriptors()
  const nextDescriptors = mergeAiSuggestion(current, result.suggestion)

  // Merge into the existing metadata JSONB — sibling keys (composers,
  // lyrics, performers, recording) must survive untouched.
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
    action: 'sync_library.tag_suggest',
    targetType: 'track',
    targetId: trackId,
    changes: { ai_suggested: nextDescriptors.ai_suggested },
  })

  return NextResponse.json({ data: { ok: true, trackId, descriptors: nextDescriptors } })
}
