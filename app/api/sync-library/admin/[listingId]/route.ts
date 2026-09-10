import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import {
  buildSyncLibraryAdmittedNotification,
  buildSyncLibraryRejectedNotification,
} from '@/lib/social/notifications'
import { isValidTransition } from '@/lib/sync-library/submission'
import { evaluateInclusionGate, type GateSignal } from '@/lib/sync-library/gate'
import {
  syncReadinessForTrack,
  isSyncMetadataComplete,
  syncIneligibleTypeReason,
} from '@/lib/sync-library/readiness'
import { computeStage3 } from '@/lib/vault/stage3'
import type { VaultProjectType } from '@/types'

// ─── POST /api/sync-library/admin/[listingId] ──────────────────────────
// The SINGLE staff curation gate — admit or reject a song, invited OR
// self-applied (26-CONTEXT.md decision #2: "invited vs self-applied is
// metadata... not a different flow gate"). Mirrors
// app/api/capabilities/approve/[grantId]/route.ts's staff-gate-first +
// DB-loaded-target + double-decide doctrine exactly.
//
// T-30-06 (Elevation of Privilege): requireStaff(['leadership']) is the
// FIRST statement, before any DB read — LEADERSHIP-ONLY (30-CONTEXT.md
// access decision, tightened from the Phase 26 leadership+ae grant; AE
// keeps browse & pull only, no curation writes). This route now matches
// the REMOVAL route's (already leadership-only) access level.
//
// Gate precondition (30-04): admitting ADDITIONALLY requires
// evaluateInclusionGate() (lib/sync-library/gate.ts) to return
// 'admit_eligible' — computed server-side from computeStage3() (rights),
// the listing's persisted quality_ok (quality), and
// isSyncMetadataComplete(syncReadinessForTrack(...)) (metadata complete).
// A 'needs_completion' verdict returns 409 and leaves the listing's
// status UNCHANGED — never auto-rejected (30-CONTEXT.md "Incomplete ≠
// rejected": incomplete tracks stay in the completion pipeline, not a
// bin). isValidTransition() remains the single legal-transition
// authority (T-26-22) — the gate is an ADDITIONAL admit precondition on
// top of it, never a replacement.

const VALID_DECISIONS = ['admit', 'reject'] as const
const REASON_MAX_LENGTH = 500

type RequestBody = { decision?: unknown; reason?: unknown }
type ListingRow = {
  id: string
  status: string
  artist_user_id: string
  track_id: string
  vault_project_id: string
  quality_ok: boolean | null
}
type TrackRow = { title: string }

// Gate-input columns for a single project — mirrors lib/deals/catalog-
// query.ts's PROJECT_COLUMNS (the batched shape computeStage3 already
// consumes), plus isrc/iswc which syncReadinessForTrack additionally
// needs (catalog-query.ts's rights-only query doesn't select those).
const PROJECT_GATE_COLUMNS = `
  id, title, type, vault_readiness_score,
  content_id_registered, content_id_dismissed_until,
  tracks (id, title, isrc, iswc, metadata, writers, producers, mixing_engineer, mastering_engineer, has_sample, sample_details),
  vault_documents (id, type, status, track_id, document_data),
  vault_assets (id, type)
`

type GateProjectRow = {
  id: string
  title: string
  type: VaultProjectType
  vault_readiness_score: number | null
  content_id_registered: boolean | null
  content_id_dismissed_until: string | null
  tracks: {
    id: string
    title: string | null
    isrc: string | null
    iswc: string | null
    metadata: Record<string, unknown> | null
    writers: string[] | null
    producers: string[] | null
    mixing_engineer: string | null
    mastering_engineer: string | null
    has_sample: boolean | null
    sample_details: string | null
  }[]
  vault_documents: {
    id: string
    type: string
    status: string
    track_id: string | null
    document_data: Record<string, unknown> | null
  }[]
  // 2026-09-10: `visual_asset` joined SYNC_READINESS_KEYS, and it resolves
  // from vault_assets (cover_art_url is only a display mirror).
  vault_assets: { id: string; type: string }[]
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
  const decision = body.decision
  if (decision !== 'admit' && decision !== 'reject') {
    return NextResponse.json(
      { error: `decision must be one of: ${VALID_DECISIONS.join(', ')}.` },
      { status: 400 }
    )
  }

  // reason is optional and only meaningful for reject (26-CONTEXT.md
  // UI-phase decision #1) — trimmed and length-capped either way.
  const rawReason = body.reason
  const reason =
    typeof rawReason === 'string' && rawReason.trim() !== ''
      ? rawReason.trim().slice(0, REASON_MAX_LENGTH)
      : null

  const service = createServiceClient()

  // T-26-19: target loaded from the DB by the path param — the body never
  // carries a listing/artist identity.
  const { data: listingRaw, error: listingError } = await service
    .from('sync_listings')
    .select('id, status, artist_user_id, track_id, vault_project_id, quality_ok')
    .eq('id', listingId)
    .maybeSingle()
  if (listingError) {
    return NextResponse.json({ error: listingError.message }, { status: 500 })
  }
  const row = listingRaw as ListingRow | null
  if (!row) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  }

  const nextStatus: 'admitted' | 'rejected' = decision === 'admit' ? 'admitted' : 'rejected'

  // T-26-22: double-decide guard — the ONE authority for legal transitions.
  if (!isValidTransition(row.status, nextStatus)) {
    return NextResponse.json(
      { error: 'This song is not awaiting an admit/reject decision.' },
      { status: 409 }
    )
  }

  // Song title for the artist-facing notification — a separate flat query,
  // matching this codebase's established convention (app/api/sync-library/
  // submit/route.ts, mint-agreement/route.ts) over an embedded select.
  const { data: trackRaw } = await service
    .from('tracks')
    .select('title')
    .eq('id', row.track_id)
    .maybeSingle()
  const songTitle = (trackRaw as TrackRow | null)?.title ?? 'Your song'

  const nowIso = new Date().toISOString()

  if (decision === 'admit') {
    // Gate precondition (30-04): admit is additionally gated on
    // evaluateInclusionGate() — signals recomputed server-side from a
    // fresh, DB-loaded project/track fetch, never trusted from the
    // request body or from row's already-loaded fields alone.
    const { data: projectRaw, error: projectError } = await service
      .from('vault_projects')
      .select(PROJECT_GATE_COLUMNS)
      .eq('id', row.vault_project_id)
      .maybeSingle()
    if (projectError) {
      return NextResponse.json({ error: projectError.message }, { status: 500 })
    }
    const project = projectRaw as unknown as GateProjectRow | null
    const track = project?.tracks?.find(t => t.id === row.track_id) ?? null
    if (!project || !track) {
      return NextResponse.json(
        { error: "This song's project could not be loaded — cannot evaluate the inclusion gate." },
        { status: 500 }
      )
    }

    // ─── The project-TYPE gate, FIRST and deliberately so ────────────────
    // (2026-09-10, .planning/todos "Enforce the sync project-type rule at
    // the staff surfaces".) The sync catalogue licenses released-format
    // recordings — SYNC_ELIGIBLE_PROJECT_TYPES, 'single' | 'ep' | 'album'.
    // isRightsReady() (lib/deals/catalog.ts) has enforced that at the BUYER
    // gate since ca919cf2; this route did not, so a 'snippet' or
    // 'unreleased' project could be admitted and then never render to a
    // buyer — "staff admitted it and it vanished", explained to an artist
    // after the fact.
    //
    // It runs BEFORE evaluateInclusionGate() on purpose. Today those two
    // types ALSO fail the gate below, but only by accident: the `metadata`
    // readiness item's applies_to table does not include them, so
    // isSyncMetadataComplete() fails closed on an empty family and the
    // refusal reads "needs to finish the Sync Readiness checklist" — a
    // checklist that can never be finished, sending staff hunting for a
    // missing item that does not exist. That accidental coupling is exactly
    // what SYNC_ELIGIBLE_PROJECT_TYPES was added to replace, and it would
    // vanish the moment anyone added 'unreleased' to that applies_to list
    // for an unrelated release-readiness reason. This check is independent
    // of the readiness registry entirely.
    //
    // Same discipline as the gate refusal below: 409, and the listing's
    // status is left UNTOUCHED — refusing to admit is not rejecting. Staff
    // can still reject the listing explicitly; only `admit` is gated.
    const ineligibleReason = syncIneligibleTypeReason(project.type)
    if (ineligibleReason) {
      return NextResponse.json(
        {
          error: ineligibleReason,
          data: { listingId, status: row.status, projectType: project.type },
        },
        { status: 409 }
      )
    }

    const stage3 = computeStage3(
      project,
      project.tracks,
      project.vault_documents ?? [],
      project.vault_readiness_score ?? 0
    )
    const rightsClear = stage3.canContinue

    const syncItems = syncReadinessForTrack({
      type: project.type,
      track: { id: track.id, isrc: track.isrc, iswc: track.iswc, metadata: track.metadata },
      assets: project.vault_assets ?? [],
      documents: project.vault_documents ?? [],
    })
    const metadataComplete = isSyncMetadataComplete(syncItems)

    const qualityOk = row.quality_ok === true

    const gateSignal: GateSignal = { rightsClear, qualityOk, metadataComplete }
    const verdict = evaluateInclusionGate(gateSignal)
    if (verdict === 'needs_completion') {
      // CONTEXT.md: "Incomplete ≠ rejected" — refuse to admit, but leave
      // the listing's status untouched. It stays in the Sync Readiness
      // completion pipeline, never auto-rejected.
      return NextResponse.json(
        {
          error:
            'This track needs to finish the Sync Readiness checklist and/or pass quality review before it can go live.',
          data: { listingId, status: row.status, gate: gateSignal },
        },
        { status: 409 }
      )
    }

    // T-26-20: fixed allowlisted column set — never spread the request body.
    const { error: updateError } = await service
      .from('sync_listings')
      .update({
        status: 'admitted',
        admitted_at: nowIso,
        decided_at: nowIso,
        decided_by: auth.user.id,
        updated_at: nowIso,
      })
      .eq('id', listingId)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // SYNCLIB-14: the new-feature-highlight fires ONLY on the artist's
    // FIRST admitted listing — recount after the write.
    const { data: admittedRaw } = await service
      .from('sync_listings')
      .select('id')
      .eq('artist_user_id', row.artist_user_id)
      .eq('status', 'admitted')
    const admittedCount = ((admittedRaw ?? []) as { id: string }[]).length
    if (admittedCount === 1) {
      try {
        await createNotification(
          service,
          buildSyncLibraryAdmittedNotification({
            recipientId: row.artist_user_id,
            actorId: auth.user.id,
            songTitle,
          })
        )
      } catch {
        // swallow — non-fatal side effect, must never fail the admit write
      }
    }

    // T-26-21: UNCONDITIONAL, after the write. Extended (30-04) to record
    // the gate verdict that cleared this admit.
    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'sync_library.admit',
      targetType: 'sync_listing',
      targetId: listingId,
      changes: { previousStatus: row.status, gate: gateSignal },
    })

    return NextResponse.json({ data: { listingId, status: 'admitted' as const } })
  }

  // Reject path.
  const { error: rejectError } = await service
    .from('sync_listings')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      decided_at: nowIso,
      decided_by: auth.user.id,
      updated_at: nowIso,
    })
    .eq('id', listingId)
  if (rejectError) {
    return NextResponse.json({ error: rejectError.message }, { status: 500 })
  }

  try {
    await createNotification(
      service,
      buildSyncLibraryRejectedNotification({
        recipientId: row.artist_user_id,
        actorId: auth.user.id,
        songTitle,
        reason,
      })
    )
  } catch {
    // swallow — non-fatal side effect
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'sync_library.reject',
    targetType: 'sync_listing',
    targetId: listingId,
    changes: { previousStatus: row.status, reason },
  })

  return NextResponse.json({ data: { listingId, status: 'rejected' as const } })
}
