import type { SupabaseClient } from '@supabase/supabase-js'
import { isAssignedToOrg } from '@/lib/staff/scope'
import type { StaffRole } from '@/lib/admin/staff-role'
import type { Selects, SelectsTrack, SelectsTrackSource } from './types'

// ─── Selects — service-role persistence (31-04) ────────────────────────────
// Pure-ish helpers: every function here takes an ALREADY-CREATED service
// client and does its own I/O — no HTTP concerns (NextResponse/status codes
// live in the route layer). This is what makes the own-book-scope and
// idempotent-add/soft-remove/empty-send-guard behavior unit-testable without
// mocking Next.js request/response objects (mirrors lib/staff/
// createStaffAccount.ts's testing convention).
//
// R11/R5/R6/D-02: every write path re-checks own-book scope via
// isOrgInAeScope/loadSelectsInScope BEFORE touching a row — leadership
// bypasses, non-leadership must be isAssignedToOrg on the Selects' buyer_org.
// Scope denial resolves to null (never a thrown/typed "forbidden"), so every
// route above renders it as a 404 — never a 403 (T-31-07, no existence leak).

const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

const SELECTS_TRACK_COLUMNS =
  'id, selects_id, track_id, note, position, added_by, source, removed_at, removed_by, created_at'

// ─── Mass-assignment allowlist (T-31-08) ───────────────────────────────────
// Mirrors lib/admin/gate.ts's EDITABLE_FIELDS convention. Includes
// download_enabled/download_max_seconds so the D-02 download gate is
// editable pre-send (the send route can also set them at send time).
export const SELECTS_EDITABLE_FIELDS = [
  'name',
  'cover_note',
  'download_enabled',
  'download_max_seconds',
] as const

export type SelectsEditableField = (typeof SELECTS_EDITABLE_FIELDS)[number]

// ─── Own-book scope helpers ─────────────────────────────────────────────────

/**
 * True only when `orgId` exists AND (the caller is leadership OR the caller
 * is the org's assigned AE). A missing org row always resolves to false —
 * fail-closed, mirrors isAssignedToOrg's own contract.
 */
export async function isOrgInAeScope(
  service: SupabaseClient,
  orgId: string,
  staffRole: StaffRole,
  staffUserId: string
): Promise<boolean> {
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, ae_user_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!orgRow) return false
  if (staffRole === 'leadership') return true
  return isAssignedToOrg(orgRow, staffUserId)
}

/**
 * Loads a Selects row scoped to the caller's book. Returns null both when
 * the row does not exist AND when a non-leadership caller is not assigned
 * to its org — the two cases are made INDISTINGUISHABLE by design so every
 * route renders scope denial identically to a genuine 404 (T-31-07).
 */
export async function loadSelectsInScope(
  service: SupabaseClient,
  id: string,
  staffRole: StaffRole,
  staffUserId: string
): Promise<Selects | null> {
  const { data } = await service.from('selects').select(SELECTS_COLUMNS).eq('id', id).maybeSingle()
  if (!data) return null
  const selects = data as Selects
  const inScope = await isOrgInAeScope(service, selects.buyer_org_id, staffRole, staffUserId)
  return inScope ? selects : null
}

// ─── Selects CRUD (Task 1) ──────────────────────────────────────────────────

export type CreateSelectsInput = {
  orgId: string
  aeUserId: string
  name: string
  coverNote?: string | null
  briefId?: string | null
}

export async function createSelects(service: SupabaseClient, input: CreateSelectsInput): Promise<Selects> {
  const { data, error } = await service
    .from('selects')
    .insert({
      buyer_org_id: input.orgId,
      created_by: input.aeUserId,
      name: input.name,
      cover_note: input.coverNote ?? null,
      brief_id: input.briefId ?? null,
    })
    .select(SELECTS_COLUMNS)
    .single()

  if (error || !data) throw new Error(`Failed to create Selects: ${error?.message ?? 'unknown error'}`)
  return data as Selects
}

export type PatchSelectsInput = Partial<{
  name: string
  cover_note: string | null
  download_enabled: boolean
  download_max_seconds: number | null
}>

/**
 * Updates ONLY the fields present in SELECTS_EDITABLE_FIELDS — any other key
 * on `input` is silently dropped (mass-assignment protection, T-31-08). The
 * route layer validates value shapes with zod BEFORE calling this; this
 * function's own allowlist loop is the second, independent gate (defense in
 * depth — mirrors app/api/admin/curators/[id]/route.ts's PATCH convention).
 */
export async function patchSelects(
  service: SupabaseClient,
  id: string,
  input: Record<string, unknown>
): Promise<Selects | null> {
  const update: Record<string, unknown> = {}
  for (const field of SELECTS_EDITABLE_FIELDS) {
    if (field in input) update[field] = input[field]
  }
  if (Object.keys(update).length === 0) return null

  const { data, error } = await service
    .from('selects')
    .update(update)
    .eq('id', id)
    .select(SELECTS_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to update Selects: ${error.message}`)
  return data as Selects | null
}

export type DeleteSelectsResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_draft' }

/**
 * Discards a Selects. NOTE (deviation from the plan's literal "soft delete"
 * wording — see 31-04-SUMMARY.md): migration 111's `selects` table has NO
 * deleted_at column (unlike selects_tracks, which has a real soft-remove).
 * A true soft-delete of the Selects row itself isn't representable in the
 * current schema, and adding one is a migration (Rule 4 territory, and this
 * project never runs `supabase db push` from an agent). The safe equivalent
 * implemented here: a Selects can only be discarded while still 'draft' —
 * before any client-visible share link has ever been sent — so a hard
 * delete at this stage destroys nothing a client has seen. A Selects that
 * has ever reached 'sent' (or beyond) is never deletable through this path.
 */
export async function softDeleteSelects(service: SupabaseClient, id: string): Promise<DeleteSelectsResult> {
  const { data: existing } = await service.from('selects').select('id, status').eq('id', id).maybeSingle()
  if (!existing) return { ok: false, reason: 'not_found' }
  if ((existing as { status: string }).status !== 'draft') return { ok: false, reason: 'not_draft' }

  const { error } = await service.from('selects').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete Selects: ${error.message}`)
  return { ok: true }
}

// ─── Selects tracks (Task 2) ────────────────────────────────────────────────

async function nextSelectsTrackPosition(service: SupabaseClient, selectsId: string): Promise<number> {
  const { data } = await service
    .from('selects_tracks')
    .select('position')
    .eq('selects_id', selectsId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? (data as { position: number }).position + 1 : 0
}

export type AddSelectsTrackInput = {
  selectsId: string
  trackId: string
  note?: string | null
  source?: SelectsTrackSource
  addedBy: string
}

/**
 * Idempotent add (R11 AC): re-adding a track already present (non-removed)
 * returns the SAME row unchanged — never a second selects_tracks row. A
 * previously soft-removed row is un-removed (removed_at/removed_by cleared)
 * rather than inserting a duplicate, preserving the original added_by/
 * created_at provenance.
 */
export async function addSelectsTrack(service: SupabaseClient, input: AddSelectsTrackInput): Promise<SelectsTrack> {
  const { data: existing } = await service
    .from('selects_tracks')
    .select(SELECTS_TRACK_COLUMNS)
    .eq('selects_id', input.selectsId)
    .eq('track_id', input.trackId)
    .maybeSingle()

  if (existing) {
    const row = existing as SelectsTrack
    if (row.removed_at === null) {
      return row
    }
    const { data, error } = await service
      .from('selects_tracks')
      .update({ removed_at: null, removed_by: null })
      .eq('id', row.id)
      .select(SELECTS_TRACK_COLUMNS)
      .single()
    if (error || !data) throw new Error(`Failed to re-add track: ${error?.message ?? 'unknown error'}`)
    return data as SelectsTrack
  }

  const nextPosition = await nextSelectsTrackPosition(service, input.selectsId)
  const { data, error } = await service
    .from('selects_tracks')
    .insert({
      selects_id: input.selectsId,
      track_id: input.trackId,
      note: input.note ?? null,
      source: input.source ?? 'crate',
      added_by: input.addedBy,
      position: nextPosition,
    })
    .select(SELECTS_TRACK_COLUMNS)
    .single()

  if (error || !data) throw new Error(`Failed to add track: ${error?.message ?? 'unknown error'}`)
  return data as SelectsTrack
}

/**
 * Soft-removes a selects_tracks row (removed_at/removed_by) — NEVER a hard
 * delete (co-edit history/the Removed tray must survive). Scoped by BOTH id
 * AND selects_id in the same WHERE clause (not a separate pre-check) so a
 * caller cannot mutate a track row belonging to a DIFFERENT Selects by
 * guessing/reusing a trackRowId — a TOCTOU-safe own-book boundary
 * (mirrors app/api/admin/buyer-orgs/[id]/route.ts's "scope-safe write"
 * convention).
 */
export async function removeSelectsTrack(
  service: SupabaseClient,
  selectsId: string,
  trackRowId: string,
  removedBy: string
): Promise<SelectsTrack | null> {
  const { data, error } = await service
    .from('selects_tracks')
    .update({ removed_at: new Date().toISOString(), removed_by: removedBy })
    .eq('id', trackRowId)
    .eq('selects_id', selectsId)
    .select(SELECTS_TRACK_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to remove track: ${error.message}`)
  return data as SelectsTrack | null
}

export type UpdateSelectsTrackInput = Partial<{ note: string | null; position: number }>

/**
 * Updates a track's note and/or position. Scoped by BOTH trackRowId AND
 * selectsId (same TOCTOU-safe convention as removeSelectsTrack).
 */
export async function updateSelectsTrack(
  service: SupabaseClient,
  selectsId: string,
  trackRowId: string,
  input: UpdateSelectsTrackInput
): Promise<SelectsTrack | null> {
  const update: Record<string, unknown> = {}
  if ('note' in input) update.note = input.note
  if ('position' in input) update.position = input.position
  if (Object.keys(update).length === 0) return null

  const { data, error } = await service
    .from('selects_tracks')
    .update(update)
    .eq('id', trackRowId)
    .eq('selects_id', selectsId)
    .select(SELECTS_TRACK_COLUMNS)
    .maybeSingle()

  if (error) throw new Error(`Failed to update track: ${error.message}`)
  return data as SelectsTrack | null
}

// NOTE: read-time rights-ready evaluation (isRightsReady/computeStage3) and
// the send-guard/status-transition logic (isLegalSelectsTransition) are
// deliberately implemented directly in their route files —
// app/api/admin/selects/[id]/tracks/route.ts and
// app/api/admin/selects/[id]/send/route.ts — rather than wrapped here,
// mirroring app/api/admin/deals/[id]/route.ts's convention of importing
// lib/deals/stage-machine's pure predicates directly into the route rather
// than through an extra persistence-layer indirection.
