import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import {
  readComposers,
  sanitizeComposers,
  sanitizeDescriptors,
  sanitizeLyrics,
  sanitizePerformers,
  sanitizeRecordingInfo,
} from '@/lib/metadata/schema'
import { isSyncActive, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'
import { mapComposersToParties } from '@/lib/split-sheets/project-sync'
import { normalizeName } from '@/lib/split-sheets/reconciliation'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type RouteCtx = { params: Promise<{ projectId: string; trackId: string }> }

type TrackUpdate = {
  title?: string
  isrc?: string | null
  iswc?: string | null
  language?: string | null
  writers?: string[]
  producers?: string[]
  mixing_engineer?: string | null
  mastering_engineer?: string | null
  has_sample?: boolean
  sample_details?: string | null
  metadata?: Record<string, unknown>
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map(x => String(x).trim()).filter(Boolean)
}

function sanitize(body: Record<string, unknown>): TrackUpdate {
  const update: TrackUpdate = {}
  if ('title' in body && typeof body.title === 'string' && body.title.trim()) {
    update.title = body.title.trim()
  }
  if ('has_sample' in body && typeof body.has_sample === 'boolean') {
    update.has_sample = body.has_sample
  }
  for (const key of [
    'isrc',
    'iswc',
    'language',
    'mixing_engineer',
    'mastering_engineer',
    'sample_details',
  ] as const) {
    if (!(key in body)) continue
    const value = body[key]
    if (value === null) update[key] = null
    else if (typeof value === 'string') {
      const t = value.trim()
      update[key] = t === '' ? null : t
    }
  }
  for (const key of ['writers', 'producers'] as const) {
    const arr = asStringArray(body[key])
    if (arr) update[key] = arr
  }
  // Metadata Studio: composer rows live under metadata.composers. The
  // PATCH handler merges this into the existing JSONB so other keys survive.
  if ('metadata' in body && body.metadata && typeof body.metadata === 'object') {
    const incoming = body.metadata as Record<string, unknown>
    const next: Record<string, unknown> = {}
    if ('composers' in incoming) {
      next.composers = sanitizeComposers(incoming.composers)
    }
    if ('lyrics' in incoming) {
      next.lyrics = sanitizeLyrics(incoming.lyrics) // null clears them
    }
    if ('performers' in incoming) {
      next.performers = sanitizePerformers(incoming.performers)
    }
    if ('recording' in incoming) {
      next.recording = sanitizeRecordingInfo(incoming.recording) // null clears
    }
    if ('descriptors' in incoming) {
      next.descriptors = sanitizeDescriptors(incoming.descriptors) // null clears (untagged)
    }
    if (Object.keys(next).length > 0) update.metadata = next
  }
  return update
}

// PATCH /api/vault/[projectId]/tracks/[trackId] — update track metadata,
// including the Stage 3 sample flag (has_sample / sample_details).
export async function PATCH(request: Request, { params }: RouteCtx) {
  const { projectId, trackId } = await params

  if (DEMO) {
    return NextResponse.json(
      { error: 'Editing tracks is not available in demo mode' },
      { status: 400 }
    )
  }

  const body = (await request.json()) as Record<string, unknown>
  const update = sanitize(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  // Captured BEFORE the metadata merge below folds in the pre-existing
  // JSONB — after that merge, 'composers' can appear in update.metadata
  // even when THIS PATCH never touched it (the reverse-sync gate below
  // must fire only on an actual composer edit).
  const touchesComposers = !!(update.metadata && 'composers' in update.metadata)

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Merge the metadata JSONB so we don't clobber keys we didn't touch.
  if (update.metadata) {
    const { data: existing } = await supabase
      .from('tracks')
      .select('metadata')
      .eq('id', trackId)
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    update.metadata = {
      ...((existing?.metadata as Record<string, unknown> | null) ?? {}),
      ...update.metadata,
    }
  }

  const { data, error } = await supabase
    .from('tracks')
    .update(update)
    .eq('id', trackId)
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  // ─── Reverse sync: project composers → linked living-draft sheet parties ──
  // (sheet-project-sync decision) — single-account guard (①, T-21-10):
  // fires only when the editor IS the sheet's own initiator, never a
  // cross-account split edit. Only REFRESHES an already-matched writer
  // party's role/pro/ipi/split — it never inserts a new party or
  // fabricates a percentage for a project-only credit, so a manually-added
  // producer/performer can never silently become a signature party on a
  // legal document (splits stay the sheet's job, ①). Does not widen this
  // route's owner-scoped ownership check (21-01 deferral). Best-effort
  // relative to the primary track save above: a sync failure must never
  // roll it back.
  if (touchesComposers) {
    try {
      const { data: candidateSheets } = await supabase
        .from('split_sheets')
        .select('id, status, track_id')
        .eq('vault_project_id', projectId)
        .eq('initiator_user_id', user.id)

      const syncable = (
        (candidateSheets ?? []) as { id: string; status: SplitSheetStatus; track_id: string | null }[]
      ).filter(s => isSyncActive(s.status))

      let targetSheet = syncable.find(s => s.track_id === trackId) ?? null
      if (!targetSheet) {
        // A sheet with no track_id covers "the whole release" — only safe
        // to treat as THIS track's sheet when the project has exactly one
        // track (mirrors the forward-sync route's pickSyncTrack fallback).
        const wholeProjectSheet = syncable.find(s => s.track_id === null)
        if (wholeProjectSheet) {
          const { count } = await supabase
            .from('tracks')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
          if (count === 1) targetSheet = wholeProjectSheet
        }
      }

      if (targetSheet) {
        const writerComposers = readComposers((data.metadata as Record<string, unknown> | null) ?? null)
        const writerParties = mapComposersToParties(writerComposers)
        const { data: existingPartyRows } = await supabase
          .from('split_sheet_parties')
          .select('id, name')
          .eq('split_sheet_id', targetSheet.id)
        const existingParties = (existingPartyRows ?? []) as { id: string; name: string }[]

        for (const wp of writerParties) {
          const match = existingParties.find(ep => normalizeName(ep.name) === normalizeName(wp.name))
          if (!match) continue // never invent a new party from a project-side edit
          await supabase
            .from('split_sheet_parties')
            .update({
              role: wp.role ?? null,
              pro: wp.pro ?? null,
              ipi: wp.ipi ?? null,
              split_percentage: wp.split_percentage,
            })
            .eq('id', match.id)
            .eq('split_sheet_id', targetSheet.id)
        }
      }
    } catch {
      // best-effort — never corrupt or roll back the track save above
    }
  }

  return NextResponse.json({ data })
}
