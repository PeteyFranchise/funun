import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isValidReportReason,
  isValidReportTargetType,
  type ReportTargetType,
  type ReportReason,
  type ReportStatus,
} from './contracts'
import type { ReportValidation } from './reports'

// ─────────────────────────────────────────────────────────────────────────
// Admin report review (SAFETY-02, Plan 13-04 Task 2)
//
// Every function here assumes the caller has already run verifyAdmin() —
// none of these do their own auth check, mirroring lib/green-room/
// placements-admin.ts's split (route does the gate, lib does validation +
// data access with the already-authorized service client).
// ─────────────────────────────────────────────────────────────────────────

// A report may only be moved to one of these from the API — 'submitted' is
// create-time only and is never a valid PATCH target.
export const REPORT_RESOLVABLE_STATUS_VALUES = ['under_review', 'actioned', 'dismissed'] as const
export type ReportResolvableStatus = (typeof REPORT_RESOLVABLE_STATUS_VALUES)[number]

export function isValidResolvableStatus(value: unknown): value is ReportResolvableStatus {
  return typeof value === 'string' && (REPORT_RESOLVABLE_STATUS_VALUES as readonly string[]).includes(value)
}

// Content actions route an actioned report to whatever hide/remove/pause
// mechanism ALREADY EXISTS for that target's table — this does not invent
// any new moderation state machine. See applyContentAction's per-target-type
// mapping for exactly what each action does.
export const REPORT_CONTENT_ACTION_VALUES = ['hide', 'remove', 'pause'] as const
export type ReportContentAction = (typeof REPORT_CONTENT_ACTION_VALUES)[number]

export function isValidContentAction(value: unknown): value is ReportContentAction {
  return typeof value === 'string' && (REPORT_CONTENT_ACTION_VALUES as readonly string[]).includes(value)
}

export const REPORT_ADMIN_NOTES_MAX = 2000

export type ReportPatchUpdate = {
  status?: ReportResolvableStatus
  admin_notes?: string | null
}

export type ReportPatchResult = {
  update: ReportPatchUpdate
  contentAction: ReportContentAction | null
}

/**
 * Validates a PATCH /api/admin/reports/[id] body. `contentAction` is only
 * accepted when the report's OWN target_type supports it — a `pause`
 * requested against a `profile` report, for example, is rejected here
 * before any write is attempted.
 */
export function validateReportPatch(
  body: Record<string, unknown>,
  targetType: ReportTargetType
): ReportValidation<ReportPatchResult> {
  const update: ReportPatchUpdate = {}

  if ('status' in body && body.status != null) {
    if (!isValidResolvableStatus(body.status)) {
      return { ok: false, error: `status must be one of: ${REPORT_RESOLVABLE_STATUS_VALUES.join(', ')}` }
    }
    update.status = body.status
  }

  if ('adminNotes' in body) {
    if (body.adminNotes == null || body.adminNotes === '') {
      update.admin_notes = null
    } else if (typeof body.adminNotes !== 'string' || body.adminNotes.length > REPORT_ADMIN_NOTES_MAX) {
      return { ok: false, error: `adminNotes must be ≤${REPORT_ADMIN_NOTES_MAX} characters` }
    } else {
      update.admin_notes = body.adminNotes.trim()
    }
  }

  let contentAction: ReportContentAction | null = null
  if ('contentAction' in body && body.contentAction != null) {
    if (!isValidContentAction(body.contentAction)) {
      return { ok: false, error: `contentAction must be one of: ${REPORT_CONTENT_ACTION_VALUES.join(', ')}` }
    }
    if (!isContentActionSupported(targetType, body.contentAction)) {
      return { ok: false, error: `${body.contentAction} is not supported for ${targetType}` }
    }
    contentAction = body.contentAction
  }

  if (Object.keys(update).length === 0 && !contentAction) {
    return { ok: false, error: 'No valid fields to update' }
  }

  return { ok: true, value: { update, contentAction } }
}

function isContentActionSupported(targetType: ReportTargetType, action: ReportContentAction): boolean {
  if (targetType === 'green_room_post' || targetType === 'green_room_comment') {
    return action === 'hide' || action === 'remove'
  }
  if (targetType === 'green_room_repost') {
    return action === 'remove'
  }
  if (targetType === 'green_room_placement') {
    return action === 'pause' || action === 'remove'
  }
  // profile / message: no existing content-takedown mechanism to route to.
  return false
}

export type ContentActionResult = { ok: true } | { ok: false; error: string }

/**
 * Routes an actioned report's content action to whatever hide/remove/pause
 * mechanism already exists for that target's table:
 *  - green_room_post / green_room_comment: existing `moderation_status`
 *    column (migration 057) — hide → 'hidden', remove → 'removed'. Already
 *    enforced by the read-side RLS/visibility checks (migrations 057/060);
 *    this is the first admin-facing write path to it.
 *  - green_room_repost: existing `deleted_at` soft-delete column — no
 *    moderation_status column exists on this table, so remove is the only
 *    supported action.
 *  - green_room_placement: existing `status` lifecycle column
 *    (app/api/admin/green-room/placements already exposes paused/archived
 *    transitions) — pause → 'paused', remove → 'archived'.
 * profile/message targets have no content-takedown mechanism today —
 * validateReportPatch already rejects a contentAction for those before this
 * function is ever called.
 */
export async function applyContentAction(
  service: SupabaseClient,
  targetType: ReportTargetType,
  targetId: string,
  action: ReportContentAction
): Promise<ContentActionResult> {
  if (targetType === 'green_room_post' || targetType === 'green_room_comment') {
    const table = targetType === 'green_room_post' ? 'green_room_posts' : 'green_room_comments'
    const moderationStatus = action === 'hide' ? 'hidden' : 'removed'
    const { error } = await service.from(table).update({ moderation_status: moderationStatus }).eq('id', targetId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  if (targetType === 'green_room_repost') {
    const { error } = await service
      .from('green_room_reposts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  if (targetType === 'green_room_placement') {
    const status = action === 'pause' ? 'paused' : 'archived'
    const { error } = await service.from('green_room_placements').update({ status }).eq('id', targetId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }

  return { ok: false, error: `Content actions are not supported for ${targetType}` }
}

// ─── Admin queue filters + enriched listing ──────────────────────────────

export type ReportFilters = {
  status: ReportStatus | null
  reason: ReportReason | null
  targetType: ReportTargetType | null
  since: string | null
  until: string | null
}

/** Parses/validates ?status=&reason=&targetType=&since=&until= query params. */
export function parseReportFilters(searchParams: URLSearchParams): ReportValidation<ReportFilters> {
  const status = searchParams.get('status')
  const reason = searchParams.get('reason')
  const targetType = searchParams.get('targetType')
  const since = searchParams.get('since')
  const until = searchParams.get('until')

  if (status && !isValidReportStatusFilter(status)) {
    return { ok: false, error: 'Invalid status filter' }
  }
  if (reason && !isValidReportReason(reason)) {
    return { ok: false, error: 'Invalid reason filter' }
  }
  if (targetType && !isValidReportTargetType(targetType)) {
    return { ok: false, error: 'Invalid targetType filter' }
  }
  if (since && Number.isNaN(new Date(since).getTime())) {
    return { ok: false, error: 'Invalid since date' }
  }
  if (until && Number.isNaN(new Date(until).getTime())) {
    return { ok: false, error: 'Invalid until date' }
  }

  return {
    ok: true,
    value: {
      status: status as ReportStatus | null,
      reason: reason as ReportReason | null,
      targetType: targetType as ReportTargetType | null,
      since,
      until,
    },
  }
}

const REPORT_STATUS_FILTER_VALUES = ['submitted', 'under_review', 'actioned', 'dismissed'] as const
function isValidReportStatusFilter(value: string): value is ReportStatus {
  return (REPORT_STATUS_FILTER_VALUES as readonly string[]).includes(value)
}

export type AdminReportRow = {
  id: string
  reporter_id: string
  target_type: ReportTargetType
  target_id: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type ReporterProjection = { id: string; artist_name: string | null; handle: string | null; avatar_url: string | null }

export type EnrichedAdminReportRow = AdminReportRow & { reporter: ReporterProjection | null }

// Explicit column list — never select('*') on artist_profiles (migration
// 040 column lockdown). Only the fields the admin queue needs to render
// "Reporter" per 13-UI-SPEC.md.
const REPORTER_COLUMNS = 'id, artist_name, handle, avatar_url'

/**
 * Loads the admin report queue with optional filters, enriched with a
 * minimal reporter identity projection. Shared by the admin API route and
 * the admin server page so both stay in lock-step.
 */
export async function loadReportsForAdmin(
  service: SupabaseClient,
  filters: ReportFilters
): Promise<EnrichedAdminReportRow[]> {
  let query = service.from('reports').select('*').order('created_at', { ascending: false })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.reason) query = query.eq('reason', filters.reason)
  if (filters.targetType) query = query.eq('target_type', filters.targetType)
  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.until) query = query.lte('created_at', filters.until)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as AdminReportRow[]

  const reporterIds = Array.from(new Set(rows.map(r => r.reporter_id)))
  const reporterMap = new Map<string, ReporterProjection>()
  if (reporterIds.length > 0) {
    const { data: reporters } = await service.from('artist_profiles').select(REPORTER_COLUMNS).in('id', reporterIds)
    for (const r of (reporters ?? []) as ReporterProjection[]) {
      reporterMap.set(r.id, r)
    }
  }

  return rows.map(r => ({ ...r, reporter: reporterMap.get(r.reporter_id) ?? null }))
}
