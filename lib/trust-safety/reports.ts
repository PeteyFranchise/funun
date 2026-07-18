import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isValidReportTargetType,
  isValidReportReason,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
  type ReportStatusView,
} from './contracts'

// ─────────────────────────────────────────────────────────────────────────
// Report creation (SAFETY-02, Plan 13-04 Task 1)
//
// Reports are private by default (migration 058): all writes go through the
// service client after app-level validation here. Two invariants matter
// most:
//   1. A report target must exist AND be visible to the reporter under the
//      SAME rules that already gate that surface's normal read path — a
//      reporter must never be able to probe hidden/blocked content
//      existence through this endpoint, so "doesn't exist" and "not
//      visible to you" return one identical shape (isReportTargetVisible
//      returns a plain boolean; callers must not branch on why it's false).
//   2. Re-reporting the same target while an earlier report is still open
//      must not create unbounded duplicate rows (findOpenReport).
// ─────────────────────────────────────────────────────────────────────────

export const REPORT_DETAILS_MAX = 2000

export type ReportCreateInput = {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details: string | null
}

export type ReportValidationOk<T> = { ok: true; value: T }
export type ReportValidationErr = { ok: false; error: string }
export type ReportValidation<T> = ReportValidationOk<T> | ReportValidationErr

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function validateReportCreate(body: Record<string, unknown>): ReportValidation<ReportCreateInput> {
  if (typeof body.targetType !== 'string' || !isValidReportTargetType(body.targetType)) {
    return { ok: false, error: 'targetType is invalid' }
  }
  if (!isUuid(body.targetId)) {
    return { ok: false, error: 'targetId must be a valid UUID' }
  }
  if (typeof body.reason !== 'string' || !isValidReportReason(body.reason)) {
    return { ok: false, error: 'reason is invalid' }
  }

  let details: string | null = null
  if (body.details != null && body.details !== '') {
    if (typeof body.details !== 'string' || body.details.length > REPORT_DETAILS_MAX) {
      return { ok: false, error: `details must be ≤${REPORT_DETAILS_MAX} characters` }
    }
    details = body.details.trim() || null
  }

  return {
    ok: true,
    value: { targetType: body.targetType, targetId: body.targetId, reason: body.reason, details },
  }
}

type GreenRoomPostRow = { id: string; deleted_at: string | null; moderation_status: string }
type GreenRoomCommentRow = { id: string; post_id: string; deleted_at: string | null; moderation_status: string }
type GreenRoomRepostRow = { id: string; original_post_id: string; deleted_at: string | null }
type GreenRoomPlacementRow = { id: string; status: string; starts_at: string; ends_at: string | null }
type ArtistProfileVisRow = { id: string; is_public: boolean }
type DmMessageRow = { id: string; thread_id: string }
type DmThreadRow = { a_id: string; b_id: string }

/**
 * True only when `targetId` currently exists AND is visible to `reporterId`
 * under the rules already enforced for that surface's normal read path.
 * Never distinguishes "not found" from "not visible" in its return value —
 * callers must treat every `false` identically (404 "not found").
 */
export async function isReportTargetVisible(
  service: SupabaseClient,
  targetType: ReportTargetType,
  targetId: string,
  reporterId: string
): Promise<boolean> {
  if (targetType === 'profile') {
    const { data } = await service
      .from('artist_profiles')
      .select('id, is_public')
      .eq('id', targetId)
      .maybeSingle()
    const row = data as ArtistProfileVisRow | null
    if (!row) return false
    if (row.id === reporterId) return true
    return row.is_public === true
  }

  if (targetType === 'message') {
    const { data: message } = await service
      .from('dm_messages')
      .select('id, thread_id')
      .eq('id', targetId)
      .maybeSingle()
    const msg = message as DmMessageRow | null
    if (!msg) return false

    const { data: thread } = await service
      .from('dm_threads')
      .select('a_id, b_id')
      .eq('id', msg.thread_id)
      .maybeSingle()
    const t = thread as DmThreadRow | null
    if (!t) return false
    return t.a_id === reporterId || t.b_id === reporterId
  }

  if (targetType === 'green_room_post') {
    const { data } = await service
      .from('green_room_posts')
      .select('id, deleted_at, moderation_status')
      .eq('id', targetId)
      .maybeSingle()
    const row = data as GreenRoomPostRow | null
    if (!row || row.deleted_at || row.moderation_status !== 'visible') return false
    return canViewGreenRoomPost(service, targetId, reporterId)
  }

  if (targetType === 'green_room_comment') {
    const { data } = await service
      .from('green_room_comments')
      .select('id, post_id, deleted_at, moderation_status')
      .eq('id', targetId)
      .maybeSingle()
    const row = data as GreenRoomCommentRow | null
    if (!row || row.deleted_at || row.moderation_status !== 'visible') return false
    return canViewGreenRoomPost(service, row.post_id, reporterId)
  }

  if (targetType === 'green_room_repost') {
    const { data } = await service
      .from('green_room_reposts')
      .select('id, original_post_id, deleted_at')
      .eq('id', targetId)
      .maybeSingle()
    const row = data as GreenRoomRepostRow | null
    if (!row || row.deleted_at) return false
    return canViewGreenRoomPost(service, row.original_post_id, reporterId)
  }

  if (targetType === 'green_room_placement') {
    const { data } = await service
      .from('green_room_placements')
      .select('id, status, starts_at, ends_at')
      .eq('id', targetId)
      .maybeSingle()
    const row = data as GreenRoomPlacementRow | null
    if (!row || row.status !== 'active') return false
    const now = Date.now()
    if (new Date(row.starts_at).getTime() > now) return false
    if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false
    return true
  }

  return false
}

// Reuses the same SECURITY DEFINER visibility function the feed/comments/
// reactions/reposts RLS policies already call (migrations 057/059/060) —
// no re-derivation of draft/publish/audience/block logic here. The service
// client is used the same way lib/green-room/placements-admin.ts already
// calls the sibling `no_block` RPC (both are `GRANT EXECUTE ... TO
// authenticated` only; the service role reaches them the same proven way).
async function canViewGreenRoomPost(service: SupabaseClient, postId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await service.rpc('green_room_can_view_post', {
    p_post_id: postId,
    p_viewer: viewerId,
  })
  if (error) return false
  return data === true
}

type OpenReportRow = { id: string; target_type: string; status: string; created_at: string }

/**
 * Returns the reporter's own still-open (submitted/under_review) report for
 * this exact target, if one exists — used to dedupe re-reports instead of
 * inserting an unbounded number of rows for the same reporter+target pair.
 */
export async function findOpenReport(
  service: SupabaseClient,
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string
): Promise<OpenReportRow | null> {
  const { data } = await service
    .from('reports')
    .select('id, target_type, status, created_at')
    .eq('reporter_id', reporterId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .in('status', ['submitted', 'under_review'])
    .maybeSingle()
  return (data as OpenReportRow | null) ?? null
}

/** Narrows a raw {id,target_type,status,created_at} row to the reporter-facing view. */
export function toReportStatusView(row: OpenReportRow): ReportStatusView {
  return {
    id: row.id,
    targetType: row.target_type as ReportTargetType,
    status: row.status as ReportStatus,
    createdAt: row.created_at,
  }
}
