import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// Admin-curated Green Room placements (Plan 12-10)
//
// Placements are labeled featured/sponsored/partner/program/opportunity cards
// — NOT self-serve ads. There is no billing, targeting, or ad-analytics
// surface here by design (see migration 057 table comment). Writes are
// server-owned: RLS revokes INSERT/UPDATE/DELETE from authenticated, so the
// admin API uses the service client behind verifyAdmin().
//
// A placement may only be ACTIVATED once its destination is confirmed
// visible (public), so a paused/private/removed destination can never be
// surfaced through a placement card.
// ─────────────────────────────────────────────────────────────────────────

export const PLACEMENT_KIND_VALUES = ['featured', 'sponsored', 'partner', 'program', 'opportunity'] as const
export type PlacementKind = (typeof PLACEMENT_KIND_VALUES)[number]

export const PLACEMENT_STATUS_VALUES = ['draft', 'active', 'paused', 'archived'] as const
export type PlacementStatus = (typeof PLACEMENT_STATUS_VALUES)[number]

export const PLACEMENT_DESTINATION_VALUES = ['profile', 'project', 'track', 'opportunity', 'post', 'external'] as const
export type PlacementDestinationType = (typeof PLACEMENT_DESTINATION_VALUES)[number]

export const PLACEMENT_LABEL_MAX = 80
export const PLACEMENT_TITLE_MAX = 160
export const PLACEMENT_BODY_MAX = 500
export const PLACEMENT_PRIORITY_MIN = -100
export const PLACEMENT_PRIORITY_MAX = 100

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPlacementKind(value: unknown): value is PlacementKind {
  return typeof value === 'string' && (PLACEMENT_KIND_VALUES as readonly string[]).includes(value)
}

export function isPlacementStatus(value: unknown): value is PlacementStatus {
  return typeof value === 'string' && (PLACEMENT_STATUS_VALUES as readonly string[]).includes(value)
}

export function isPlacementDestinationType(value: unknown): value is PlacementDestinationType {
  return typeof value === 'string' && (PLACEMENT_DESTINATION_VALUES as readonly string[]).includes(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Only http(s) destinations are allowed for external placements — never
// javascript:, data:, or other schemes.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function clampPriority(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return 0
  return Math.max(PLACEMENT_PRIORITY_MIN, Math.min(PLACEMENT_PRIORITY_MAX, Math.trunc(parsed)))
}

function normalizeTimestamp(value: unknown): string | null | undefined {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return undefined
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return undefined
  return new Date(time).toISOString()
}

export type PlacementValidationOk<T> = { ok: true; value: T }
export type PlacementValidationErr = { ok: false; error: string }
export type PlacementValidation<T> = PlacementValidationOk<T> | PlacementValidationErr

export type PlacementInsert = {
  placement_kind: PlacementKind
  label: string
  title: string
  body: string | null
  destination_type: PlacementDestinationType
  destination_id: string | null
  destination_url: string | null
  priority: number
  status: Extract<PlacementStatus, 'draft' | 'active'>
  starts_at?: string
  ends_at: string | null
}

// Validate a create payload. Status is limited to draft|active on create
// (paused/archived are lifecycle transitions applied later via PATCH).
export function validatePlacementCreate(body: Record<string, unknown>): PlacementValidation<PlacementInsert> {
  if (!isPlacementKind(body.placement_kind)) {
    return { ok: false, error: `placement_kind must be one of: ${PLACEMENT_KIND_VALUES.join(', ')}` }
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (label.length < 1 || label.length > PLACEMENT_LABEL_MAX) {
    return { ok: false, error: `label must be 1–${PLACEMENT_LABEL_MAX} characters` }
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (title.length < 1 || title.length > PLACEMENT_TITLE_MAX) {
    return { ok: false, error: `title must be 1–${PLACEMENT_TITLE_MAX} characters` }
  }

  let bodyText: string | null = null
  if (body.body != null && body.body !== '') {
    if (typeof body.body !== 'string' || body.body.length > PLACEMENT_BODY_MAX) {
      return { ok: false, error: `body must be ≤${PLACEMENT_BODY_MAX} characters` }
    }
    bodyText = body.body.trim() || null
  }

  if (!isPlacementDestinationType(body.destination_type)) {
    return { ok: false, error: `destination_type must be one of: ${PLACEMENT_DESTINATION_VALUES.join(', ')}` }
  }

  let destinationId: string | null = null
  let destinationUrl: string | null = null
  if (body.destination_type === 'external') {
    if (!isHttpUrl(body.destination_url)) {
      return { ok: false, error: 'external placements require a valid http(s) destination_url' }
    }
    destinationUrl = body.destination_url
  } else {
    if (!isUuid(body.destination_id)) {
      return { ok: false, error: 'destination_id must be a valid UUID for internal placements' }
    }
    destinationId = body.destination_id
  }

  const startsAt = normalizeTimestamp(body.starts_at)
  if (startsAt === undefined) return { ok: false, error: 'starts_at must be a valid timestamp' }
  const endsAt = normalizeTimestamp(body.ends_at)
  if (endsAt === undefined) return { ok: false, error: 'ends_at must be a valid timestamp' }
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    return { ok: false, error: 'ends_at must be after starts_at' }
  }

  let status: Extract<PlacementStatus, 'draft' | 'active'> = 'draft'
  if (body.status != null) {
    if (body.status !== 'draft' && body.status !== 'active') {
      return { ok: false, error: 'status on create must be draft or active' }
    }
    status = body.status
  }

  const insert: PlacementInsert = {
    placement_kind: body.placement_kind,
    label,
    title,
    body: bodyText,
    destination_type: body.destination_type,
    destination_id: destinationId,
    destination_url: destinationUrl,
    priority: clampPriority(body.priority),
    status,
    ends_at: endsAt,
  }
  if (startsAt) insert.starts_at = startsAt

  return { ok: true, value: insert }
}

// PATCH only touches copy, priority, scheduling, and lifecycle status. The
// destination is immutable after create (change it by archiving + recreating)
// so an activation visibility check can never be bypassed by a same-request
// destination swap.
export const PLACEMENT_EDITABLE_FIELDS = [
  'label',
  'title',
  'body',
  'priority',
  'status',
  'starts_at',
  'ends_at',
] as const

export type PlacementPatch = Partial<{
  label: string
  title: string
  body: string | null
  priority: number
  status: PlacementStatus
  starts_at: string | null
  ends_at: string | null
}>

export function validatePlacementPatch(body: Record<string, unknown>): PlacementValidation<PlacementPatch> {
  const update: PlacementPatch = {}

  if ('label' in body) {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (label.length < 1 || label.length > PLACEMENT_LABEL_MAX) {
      return { ok: false, error: `label must be 1–${PLACEMENT_LABEL_MAX} characters` }
    }
    update.label = label
  }

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (title.length < 1 || title.length > PLACEMENT_TITLE_MAX) {
      return { ok: false, error: `title must be 1–${PLACEMENT_TITLE_MAX} characters` }
    }
    update.title = title
  }

  if ('body' in body) {
    if (body.body == null || body.body === '') {
      update.body = null
    } else if (typeof body.body !== 'string' || body.body.length > PLACEMENT_BODY_MAX) {
      return { ok: false, error: `body must be ≤${PLACEMENT_BODY_MAX} characters` }
    } else {
      update.body = body.body.trim() || null
    }
  }

  if ('priority' in body) update.priority = clampPriority(body.priority)

  if ('status' in body) {
    if (!isPlacementStatus(body.status)) {
      return { ok: false, error: `status must be one of: ${PLACEMENT_STATUS_VALUES.join(', ')}` }
    }
    update.status = body.status
  }

  if ('starts_at' in body) {
    const startsAt = normalizeTimestamp(body.starts_at)
    if (startsAt === undefined) return { ok: false, error: 'starts_at must be a valid timestamp' }
    if (startsAt === null) return { ok: false, error: 'starts_at cannot be cleared' }
    update.starts_at = startsAt
  }

  if ('ends_at' in body) {
    const endsAt = normalizeTimestamp(body.ends_at)
    if (endsAt === undefined) return { ok: false, error: 'ends_at must be a valid timestamp' }
    update.ends_at = endsAt
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'No valid fields to update' }
  }

  return { ok: true, value: update }
}

// ─── Destination visibility gate (activation guard) ──────────────────────
// Confirms an internal destination is public/visible before a placement can
// go active. Uses the service client (admin context) purely to read the
// destination's public flag. External placements are gated by URL shape only.
export async function isDestinationVisible(
  service: SupabaseClient,
  destinationType: PlacementDestinationType,
  destinationId: string | null,
  destinationUrl: string | null
): Promise<boolean> {
  if (destinationType === 'external') return isHttpUrl(destinationUrl)
  if (!destinationId) return false

  if (destinationType === 'profile') {
    const { data } = await service
      .from('artist_profiles')
      .select('id')
      .eq('id', destinationId)
      .eq('is_public', true)
      .maybeSingle()
    return !!data
  }

  if (destinationType === 'project') {
    const { data } = await service
      .from('vault_projects')
      .select('id')
      .eq('id', destinationId)
      .eq('is_public', true)
      .maybeSingle()
    return !!data
  }

  if (destinationType === 'track') {
    const { data: track } = await service
      .from('tracks')
      .select('project_id')
      .eq('id', destinationId)
      .maybeSingle()
    const projectId = (track as { project_id?: string } | null)?.project_id
    if (!projectId) return false
    const { data: project } = await service
      .from('vault_projects')
      .select('id')
      .eq('id', projectId)
      .eq('is_public', true)
      .maybeSingle()
    return !!project
  }

  if (destinationType === 'opportunity') {
    const { data } = await service
      .from('opportunities')
      .select('id')
      .eq('id', destinationId)
      .eq('active', true)
      .maybeSingle()
    return !!data
  }

  if (destinationType === 'post') {
    const { data } = await service
      .from('green_room_posts')
      .select('id, author_id')
      .eq('id', destinationId)
      .eq('status', 'published')
      .eq('moderation_status', 'visible')
      .eq('visibility', 'public')
      .is('deleted_at', null)
      .maybeSingle()
    const authorId = (data as { author_id?: string } | null)?.author_id
    if (!authorId) return false

    const { data: author } = await service
      .from('artist_profiles')
      .select('id')
      .eq('id', authorId)
      .eq('is_public', true)
      .maybeSingle()
    return !!author
  }

  return false
}
