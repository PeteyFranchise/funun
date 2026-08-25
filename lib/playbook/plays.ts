import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ─── Plays — the team-wide "today's play" domain (D-31.2-08/09/10/11) ─────
// migration 131 (plays / play_assignments / play_assignment_completions).
// A Play is a container of several assignments — structurally the SAME
// shape as a Game Plan (lib/client-partners/game-plan.ts) holding several
// topics, but team-wide rather than per-account, published/retired instead
// of upserted, and with a hard one-active-at-a-time invariant.
//
// (a) One-active invariant (D-31.2-08): publishing a new play retires the
// prior active one first — buildPublishTransition below describes that
// transition purely; publishPlay carries it out. The migration-131 partial
// unique index (plays_one_active_uniq) is the DB-level backstop.
//
// (b) Two assignment kinds (D-31.2-09/10): 'client_targeted' targets a
// health_band OR pipeline_stage_key, evaluated per-AE against their OWN
// book at read time (lib/client-partners/plays-eligibility.ts) — it never
// carries directive content. 'general_task' is a checkable directive that
// carries its own content (note/link/attachment/content) but is never
// client-filtered — posting-ready but posting-deferred (D-31.2-10, A5).
//
// (c) Idempotent completion (D-31.2-11): markAssignmentComplete upserts
// on the UNIQUE(assignment_id, ae_user_id) conflict key with
// ignoreDuplicates — a retried "mark done" call never produces a second
// completion row.

// ─── Types (mirror migration 131's columns) ────────────────────────────────

export type PlayStatus = 'active' | 'retired'
export type AssignmentKind = 'client_targeted' | 'general_task'

export type Play = {
  id: string
  title: string
  note: string | null
  status: PlayStatus
  publishedBy: string | null
  publishedAt: string | null
  createdAt: string
}

export type PlayAssignment = {
  id: string
  playId: string
  kind: AssignmentKind
  title: string
  note: string | null
  healthBand: string | null
  pipelineStageKey: string | null
  linkUrl: string | null
  attachmentUrl: string | null
  content: unknown | null
  sortOrder: number
  createdAt: string
}

export type PlayAssignmentCompletion = {
  id: string
  assignmentId: string
  aeUserId: string
  note: string | null
  completedAt: string
}

// ─── zod input schemas (shape-level validation — Task 3's route parses these) ──
// Mirrors GamePlanTopicSchema's `.strict()` convention (T-31.2-mass-assign).
export const PlayAssignmentInputSchema = z
  .object({
    kind: z.enum(['client_targeted', 'general_task']),
    title: z.string().trim().min(1).max(200),
    note: z.string().max(2000).optional(),
    healthBand: z.union([z.string().trim().max(50), z.null()]).optional(),
    pipelineStageKey: z.union([z.string().trim().max(100), z.null()]).optional(),
    linkUrl: z.union([z.string().trim().max(2000), z.null()]).optional(),
    attachmentUrl: z.union([z.string().trim().max(2000), z.null()]).optional(),
    content: z.unknown().optional(),
  })
  .strict()

export type PlayAssignmentInput = z.infer<typeof PlayAssignmentInputSchema>

export const PublishPlaySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    note: z.string().max(2000).optional(),
    assignments: z.array(PlayAssignmentInputSchema).min(1).max(50),
  })
  .strict()

export type PublishPlayInput = z.infer<typeof PublishPlaySchema>

// ─── validateAssignment — the two-kind discriminant (D-31.2-09/10) ────────
// Pure, no I/O. Zod (above) validates SHAPE (types/lengths); this function
// validates the DOMAIN rule the shape alone can't express: which fields a
// given kind is allowed to carry.
export type ValidationResult = { valid: true } | { valid: false; error: string }

export function validateAssignment(input: {
  kind: string
  title: string
  note?: string | null
  healthBand?: string | null
  pipelineStageKey?: string | null
  linkUrl?: string | null
  attachmentUrl?: string | null
  content?: unknown
}): ValidationResult {
  if (!input.title || !input.title.trim()) {
    return { valid: false, error: 'title is required' }
  }

  if (input.kind === 'client_targeted') {
    if (!input.healthBand && !input.pipelineStageKey) {
      return {
        valid: false,
        error: 'a client_targeted assignment requires healthBand or pipelineStageKey (D-31.2-09a)',
      }
    }
    if (input.linkUrl || input.attachmentUrl || input.content) {
      return {
        valid: false,
        error: 'a client_targeted assignment must not carry directive content — that belongs to general_task (D-31.2-10)',
      }
    }
    return { valid: true }
  }

  if (input.kind === 'general_task') {
    if (input.healthBand || input.pipelineStageKey) {
      return {
        valid: false,
        error: 'a general_task assignment must not carry healthBand/pipelineStageKey — that targeting belongs to client_targeted (D-31.2-09b)',
      }
    }
    return { valid: true }
  }

  return { valid: false, error: `unknown assignment kind: ${input.kind}` }
}

// ─── buildPublishTransition — the one-active invariant, described purely ──
// Describes (never performs) the retire-then-activate transition: retiring
// the currently active play (if any) and activating the new one — exactly
// one active play results regardless of the starting state. publishPlay
// below is the thin I/O function that carries this transition out.
export type PublishTransition = {
  retireId: string | null
  activate: PublishPlayInput
}

export function buildPublishTransition(currentActive: Play | null, newPlay: PublishPlayInput): PublishTransition {
  return { retireId: currentActive ? currentActive.id : null, activate: newPlay }
}

// ─── buildCompletionUpsert — the idempotent "mark done" shape (D-31.2-11) ──
// Pure description of the upsert markAssignmentComplete performs — the
// UNIQUE(assignment_id, ae_user_id) conflict key + ignoreDuplicates make a
// retried/duplicate "mark done" call a no-op, never a duplicate row.
export type CompletionUpsert = {
  values: { assignment_id: string; ae_user_id: string; note: string | null }
  onConflict: string
  ignoreDuplicates: boolean
}

export function buildCompletionUpsert(assignmentId: string, aeUserId: string, note?: string | null): CompletionUpsert {
  return {
    values: { assignment_id: assignmentId, ae_user_id: aeUserId, note: note ?? null },
    onConflict: 'assignment_id,ae_user_id',
    ignoreDuplicates: true,
  }
}

// ─── Row mapping (DB snake_case <-> domain camelCase) ──────────────────────

type PlayRow = {
  id: string
  title: string
  note: string | null
  status: PlayStatus
  published_by: string | null
  published_at: string | null
  created_at: string
}

function mapPlayRow(row: PlayRow): Play {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    status: row.status,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  }
}

type PlayAssignmentRow = {
  id: string
  play_id: string
  kind: AssignmentKind
  title: string
  note: string | null
  health_band: string | null
  pipeline_stage_key: string | null
  link_url: string | null
  attachment_url: string | null
  content: unknown | null
  sort_order: number
  created_at: string
}

function mapAssignmentRow(row: PlayAssignmentRow): PlayAssignment {
  return {
    id: row.id,
    playId: row.play_id,
    kind: row.kind,
    title: row.title,
    note: row.note,
    healthBand: row.health_band,
    pipelineStageKey: row.pipeline_stage_key,
    linkUrl: row.link_url,
    attachmentUrl: row.attachment_url,
    content: row.content,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

type PlayAssignmentCompletionRow = {
  id: string
  assignment_id: string
  ae_user_id: string
  note: string | null
  completed_at: string
}

function mapCompletionRow(row: PlayAssignmentCompletionRow): PlayAssignmentCompletion {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    aeUserId: row.ae_user_id,
    note: row.note,
    completedAt: row.completed_at,
  }
}

const PLAY_COLUMNS = 'id, title, note, status, published_by, published_at, created_at'
const ASSIGNMENT_COLUMNS =
  'id, play_id, kind, title, note, health_band, pipeline_stage_key, link_url, attachment_url, content, sort_order, created_at'
const COMPLETION_COLUMNS = 'id, assignment_id, ae_user_id, note, completed_at'

// ─── loadActivePlay — the shared read (route GET + plan 09's banner) ──────
export async function loadActivePlay(
  service: SupabaseClient
): Promise<{ play: Play; assignments: PlayAssignment[] } | null> {
  const { data: playRow, error } = await service
    .from('plays')
    .select(PLAY_COLUMNS)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error(`Failed to load active play: ${error.message}`)
  if (!playRow) return null

  const play = mapPlayRow(playRow as PlayRow)

  const { data: assignmentRows, error: assignmentsError } = await service
    .from('play_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('play_id', play.id)
    .order('sort_order', { ascending: true })
  if (assignmentsError) throw new Error(`Failed to load play assignments: ${assignmentsError.message}`)

  return {
    play,
    assignments: ((assignmentRows ?? []) as PlayAssignmentRow[]).map(mapAssignmentRow),
  }
}

// ─── publishPlay — retire-then-activate (leadership-only, gated by the route) ──
// Validates every assignment BEFORE any write (fail before touching the DB),
// then retires the prior active play (if any) and inserts the new one as
// active — the migration-131 partial unique index backstops this at the DB
// level regardless of how this function enforces the transition.
export async function publishPlay(
  service: SupabaseClient,
  input: PublishPlayInput,
  publishedBy: string
): Promise<{ play: Play; assignments: PlayAssignment[] }> {
  for (const assignment of input.assignments) {
    const result = validateAssignment(assignment)
    if (!result.valid) throw new Error(result.error)
  }

  const active = await loadActivePlay(service)
  const transition = buildPublishTransition(active?.play ?? null, input)

  if (transition.retireId) {
    const { error: retireError } = await service.from('plays').update({ status: 'retired' }).eq('id', transition.retireId)
    if (retireError) throw new Error(`Failed to retire prior active play: ${retireError.message}`)
  }

  const { data: newPlayRow, error: insertError } = await service
    .from('plays')
    .insert({
      title: transition.activate.title,
      note: transition.activate.note ?? null,
      status: 'active',
      published_by: publishedBy,
      published_at: new Date().toISOString(),
    })
    .select(PLAY_COLUMNS)
    .single()
  if (insertError) throw new Error(`Failed to publish play: ${insertError.message}`)

  const play = mapPlayRow(newPlayRow as PlayRow)

  const assignmentInserts = transition.activate.assignments.map((a, index) => ({
    play_id: play.id,
    kind: a.kind,
    title: a.title,
    note: a.note ?? null,
    health_band: a.healthBand ?? null,
    pipeline_stage_key: a.pipelineStageKey ?? null,
    link_url: a.linkUrl ?? null,
    attachment_url: a.attachmentUrl ?? null,
    content: a.content ?? null,
    sort_order: index,
  }))

  const { data: assignmentRows, error: assignmentsError } = await service
    .from('play_assignments')
    .insert(assignmentInserts)
    .select(ASSIGNMENT_COLUMNS)
  if (assignmentsError) throw new Error(`Failed to insert play assignments: ${assignmentsError.message}`)

  return {
    play,
    assignments: ((assignmentRows ?? []) as PlayAssignmentRow[]).map(mapAssignmentRow),
  }
}

// ─── markAssignmentComplete — the idempotent AE "mark done" write ─────────
export async function markAssignmentComplete(
  service: SupabaseClient,
  assignmentId: string,
  aeUserId: string,
  note?: string | null
): Promise<{ ok: boolean }> {
  const upsert = buildCompletionUpsert(assignmentId, aeUserId, note)
  const { error } = await service
    .from('play_assignment_completions')
    .upsert(upsert.values, { onConflict: upsert.onConflict, ignoreDuplicates: upsert.ignoreDuplicates })
  if (error) throw new Error(`Failed to mark assignment complete: ${error.message}`)
  return { ok: true }
}

// ─── loadCompletions — plan 09's leadership "who's acted" rollup ──────────
export async function loadCompletions(
  service: SupabaseClient,
  assignmentIds: string[]
): Promise<PlayAssignmentCompletion[]> {
  if (assignmentIds.length === 0) return []
  const { data, error } = await service.from('play_assignment_completions').select(COMPLETION_COLUMNS).in('assignment_id', assignmentIds)
  if (error) throw new Error(`Failed to load completions: ${error.message}`)
  return ((data ?? []) as PlayAssignmentCompletionRow[]).map(mapCompletionRow)
}
