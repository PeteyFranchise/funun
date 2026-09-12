import type { SupabaseClient } from '@supabase/supabase-js'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { issueMemberConsent } from '@/lib/workspaces/consent-service'
import {
  isStructurallyExcludedCapability,
  WORKSPACE_PERMISSION_VALUES,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── The ask (R-19 / WSR-28, migration 195) ───────────────────────────────
// I/O composition over `public.workspace_permission_requests`, in the same
// house shape as `lib/workspaces/consent-service.ts`: fetch the row, decide,
// mutate, return a tagged union, never throw.
//
// ─── A PERMISSION REQUEST IS NOT A GRANT ─────────────────────────────────
// Nothing in this module confers access on anybody. A row written here is a
// PROPOSAL — the sibling of R-08's proposed agreement evidence and D-05's
// proposed roster relationship — and it is not part of the grant lineage:
// it carries no `parent_grant_id`, `workspace_grant_lineage_live` never
// walks it, `workspace_project_permission` never reads it, and no
// authorization path anywhere in this codebase consults this table. If a
// future edit makes a read or a permission check ask this table a question,
// that edit is the defect, not the missing feature.
//
// THIS MODULE WRITES NO GRANT ROW. `decidePermissionRequest` delegates the
// entire grant half of an approval to `issueMemberConsent`, which remains
// the SOLE writer of `source = 'member_consent'` rows in the codebase. The
// only thing this module writes on approval is the request row's own
// decision fields — a record that the question was answered, beside the
// grant that answered it.
//
// WHY THE TABLE HAD TO EXIST (finding surfaced in plan 07, owner decision
// R-19). Migration 191's `workspace_grants_consent_root_or_lineage_check`
// requires every non-`member_consent` grant to carry a non-null
// `parent_grant_id`, so a workspace could not record an ask until a Member
// consent root already existed — a chicken-and-egg that made WSR-27's
// primary story ("{Workspace} wants access — approve or decline")
// unreachable. The ask lives outside the lineage precisely so that
// constraint can stay exactly as strict as it is.
//
// Every mutation here writes through `logWorkspaceAction` naming BOTH the
// acting identity and the subject Member (D-22, D-50) — an ask, a
// withdrawal and a decision are all things done to a named person, and the
// audit row says who did it and to whom.

const REQUEST_COLUMNS =
  'id, workspace_id, relationship_id, member_user_id, permission, project_id, requested_by, requested_at, state, decided_at, decided_by, note'

export const PERMISSION_REQUEST_STATE_VALUES = [
  'pending',
  'approved',
  'declined',
  'withdrawn',
] as const

export type PermissionRequestState = (typeof PERMISSION_REQUEST_STATE_VALUES)[number]

/** The two decisions that are the Member's to make. `withdrawn` is not one
 * of them — withdrawing is the asking workspace's act. */
export type PermissionRequestDecision = Extract<
  PermissionRequestState,
  'approved' | 'declined'
>

export type PermissionRequest = {
  id: string
  workspaceId: string
  relationshipId: string
  memberUserId: string
  permission: WorkspacePermission
  projectId: string | null
  requestedBy: string
  requestedAt: string
  state: PermissionRequestState
  decidedAt: string | null
  decidedBy: string | null
  note: string | null
}

type RequestRow = {
  id: string
  workspace_id: string
  relationship_id: string
  member_user_id: string
  permission: string
  project_id: string | null
  requested_by: string
  requested_at: string
  state: string
  decided_at: string | null
  decided_by: string | null
  note: string | null
}

export type CreateRequestResult =
  | { ok: true; request: PermissionRequest; created: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string }

export type WithdrawRequestResult =
  | { ok: true; request: PermissionRequest }
  | { ok: false; status: 404 | 409 | 500; error: string }

export type ListRequestsResult =
  | { ok: true; requests: PermissionRequest[] }
  | { ok: false; status: 500; error: string }

export type DecideRequestResult =
  | { ok: true; request: PermissionRequest; issued: WorkspacePermission[] }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string }

// A miss and a not-yours are ONE indistinguishable refusal on the Member
// side, so a caller can never use this module to discover whether a request
// id exists — the same posture
// `app/api/roster/relationships/[relationshipId]/consent/route.ts` takes for
// relationship ids.
const NOT_YOURS = 'This permission request does not name you.'

// A workspace may only ask against a relationship that is still live in the
// roster sense: 'proposed' (the workspace has named the Member and is
// asking alongside the proposal) or 'accepted'. A refused, blocked or ended
// relationship is over, and a new ask against it would put a question in
// front of a Member who has already closed that door (D-51).
const ASKABLE_RELATIONSHIP_STATES: ReadonlySet<RosterRelationshipState> = new Set([
  'proposed',
  'accepted',
])

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)

function isKnownWorkspacePermission(value: string): value is WorkspacePermission {
  return KNOWN_PERMISSIONS.has(value)
}

function isKnownState(value: string): value is PermissionRequestState {
  return (PERMISSION_REQUEST_STATE_VALUES as readonly string[]).includes(value)
}

/**
 * Maps a database row to the module's own shape. Returns null for a row
 * whose `permission` or `state` is not a value this module recognises —
 * migration 195's CHECK constraints make both unstorable, so a null here
 * means the schema drifted, and dropping the row is the fail-closed
 * response: an unrecognised permission must never be rendered to a Member
 * as something to approve.
 */
function toPermissionRequest(row: RequestRow): PermissionRequest | null {
  if (!isKnownWorkspacePermission(row.permission)) return null
  if (isStructurallyExcludedCapability(row.permission)) return null
  if (!isKnownState(row.state)) return null

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    relationshipId: row.relationship_id,
    memberUserId: row.member_user_id,
    permission: row.permission,
    projectId: row.project_id,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    state: row.state,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    note: row.note,
  }
}

function mapRows(rows: RequestRow[]): PermissionRequest[] {
  return rows
    .map(toPermissionRequest)
    .filter((request): request is PermissionRequest => request !== null)
}

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
}

async function loadRequest(
  service: SupabaseClient,
  requestId: string
): Promise<{ ok: true; row: RequestRow | null } | { ok: false; error: string }> {
  const { data, error } = await service
    .from('workspace_permission_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', requestId)
    .maybeSingle()

  if (error) return { ok: false, error: 'Could not load the permission request.' }
  return { ok: true, row: (data as RequestRow | null) ?? null }
}

/**
 * Records a workspace's ask for one permission against one roster
 * relationship.
 *
 * A non-null `projectId` is REFUSED with 400 for now — see the check below
 * for why, and for what would lift it. The parameter stays in the signature
 * because this is a temporary product limitation, not a shape change.
 *
 * THE BOOTSTRAP CASE THIS EXISTS FOR: this succeeds with ZERO pre-existing
 * grant rows, against a relationship that has never seen a consent root,
 * and the resulting row confers nothing. That is the whole point — the
 * workspace can now prompt, and the Member's answer is what creates access.
 *
 * `member_user_id` is denormalised from the relationship HERE and never
 * accepted from a caller, and migration 195's
 * `workspace_permission_request_member_matches_relationship` trigger
 * re-asserts the same equality in the database — two enforcement points,
 * as this codebase does everywhere else (D-49).
 *
 * Idempotent on the partial unique index: a second identical open ask
 * returns the existing row with `created: false` rather than erroring, so a
 * double-click cannot put the same question in front of a Member twice.
 * Never throws.
 */
export async function createPermissionRequest(
  service: SupabaseClient,
  args: {
    workspaceId: string
    relationshipId: string
    permission: string
    projectId?: string | null
    requestedBy: string
    note?: string | null
  }
): Promise<CreateRequestResult> {
  const projectId = args.projectId ?? null

  // The structural exclusion is checked FIRST and refused BY NAME, before
  // the catalogue check, so the error says what is actually wrong (D-42).
  // Neither value is a WorkspacePermission, so neither can reach the
  // insert below even if this check were removed — this is the readable
  // half of a guarantee the type system and migration 195's own
  // structural-exclusion constraint already make structural.
  if (isStructurallyExcludedCapability(args.permission)) {
    return {
      ok: false,
      status: 403,
      error: `${args.permission} is structurally excluded and can never be requested.`,
    }
  }

  if (!isKnownWorkspacePermission(args.permission)) {
    return { ok: false, status: 400, error: `${args.permission} is not a known permission.` }
  }

  // ─── PER-PROJECT ASKS ARE REFUSED FOR NOW (owner decision, 2026-09-07) ──
  // DO NOT ACCEPT AN ASK THAT CANNOT BE RENDERED. A project-scoped row is
  // storable — the `project_id` column and the partial unique index over
  // `coalesce(project_id, ...)` are migration 195's forward-compatible
  // shape, and they stay — but the Member-facing surface cannot show it:
  // `app/api/settings/permissions/route.ts` deliberately OMITS
  // project-scoped rows because its group carries no project, and
  // flattening one in would make the client issue a relationship-WIDE
  // consent, broader than what was asked. That omission is correct.
  //
  // Accepting the ask anyway would store a row that is invisible to the
  // Member, never approvable, and — via that same partial unique index —
  // blocking of any re-ask for the pair while it sits pending. A clear
  // refusal is the honest answer, and matches WSR-27 being explicitly
  // "minimal".
  //
  // WHAT LIFTS THIS: the Member-facing surface being able to render a
  // per-project row on its own terms — plan 12's endpoint returning it and
  // plan 13's UI showing which project it names. Delete this check then,
  // and nothing else has to change: the parameter, the column and the index
  // are all already the right shape.
  if (projectId !== null) {
    return {
      ok: false,
      status: 400,
      error:
        'Per-project permission requests are not supported yet. Ask for this permission across the whole relationship instead.',
    }
  }

  const { data: relationshipData, error: relationshipError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', args.relationshipId)
    .eq('workspace_id', args.workspaceId)
    .maybeSingle()

  if (relationshipError) {
    return { ok: false, status: 500, error: 'Could not load the roster relationship.' }
  }

  const relationship = relationshipData as RelationshipRow | null
  if (!relationship) {
    return { ok: false, status: 404, error: 'Roster relationship not found.' }
  }

  if (!ASKABLE_RELATIONSHIP_STATES.has(relationship.state)) {
    return {
      ok: false,
      status: 409,
      error: 'This roster relationship is no longer live, so nothing can be asked of it.',
    }
  }

  // Every column is NAMED explicitly, never spread from an object, so a
  // future edit cannot smuggle an extra column through this writer — the
  // same discipline `consent-service.ts` states for its own insert. Note
  // what is absent and stays absent: there is no `parent_grant_id` here,
  // and there is no column on this table for one.
  const { data: insertedData, error: insertError } = await service
    .from('workspace_permission_requests')
    .insert({
      workspace_id: args.workspaceId,
      relationship_id: relationship.id,
      member_user_id: relationship.member_user_id,
      permission: args.permission,
      project_id: projectId,
      requested_by: args.requestedBy,
      state: 'pending',
      decided_at: null,
      decided_by: null,
      note: args.note ?? null,
    })
    .select(REQUEST_COLUMNS)
    .maybeSingle()

  if (insertError) {
    // 23505 = the partial unique index on
    // (relationship_id, permission, coalesce(project_id, ...)) WHERE state
    // = 'pending'. An identical open ask already exists; return it.
    if (insertError.code === '23505') {
      const existing = await findOpenRequest(service, {
        relationshipId: relationship.id,
        permission: args.permission,
        projectId,
      })
      if (existing) return { ok: true, request: existing, created: false }
    }
    return { ok: false, status: 500, error: 'Permission request could not be created.' }
  }

  const request = insertedData ? toPermissionRequest(insertedData as RequestRow) : null
  if (!request) {
    return { ok: false, status: 500, error: 'The permission request could not be recorded.' }
  }

  await logWorkspaceAction(service, {
    workspaceId: args.workspaceId,
    actorId: args.requestedBy,
    subjectMemberId: relationship.member_user_id,
    action: 'workspace.permission_request.created',
    targetType: 'workspace_permission_requests',
    targetId: request.id,
    changes: { permission: request.permission, projectId: request.projectId },
  })

  return { ok: true, request, created: true }
}

/** The existing open ask for a scope, used only to make a duplicate insert
 * idempotent. Returns null on any error — the caller then surfaces the
 * original insert failure rather than a second, less informative one. */
async function findOpenRequest(
  service: SupabaseClient,
  args: { relationshipId: string; permission: string; projectId: string | null }
): Promise<PermissionRequest | null> {
  const { data, error } = await service
    .from('workspace_permission_requests')
    .select(REQUEST_COLUMNS)
    .eq('relationship_id', args.relationshipId)
    .eq('permission', args.permission)
    .eq('state', 'pending')

  if (error || !data) return null

  const rows = mapRows(data as RequestRow[])
  return rows.find((row) => row.projectId === args.projectId) ?? null
}

/**
 * The asking workspace retracts its own ask. `pending -> withdrawn` and
 * nothing else: this function cannot reach `approved` or `declined` from
 * any input, and there is no parameter through which a caller could ask it
 * to. Withdrawing records `decided_by` as the withdrawing admin, because
 * migration 195's decision-pair CHECK requires every non-pending row to
 * name who moved it and when. Never throws.
 */
export async function withdrawPermissionRequest(
  service: SupabaseClient,
  args: { workspaceId: string; requestId: string; actorId: string; now?: number }
): Promise<WithdrawRequestResult> {
  const loaded = await loadRequest(service, args.requestId)
  if (!loaded.ok) return { ok: false, status: 500, error: loaded.error }

  const row = loaded.row
  if (!row || row.workspace_id !== args.workspaceId) {
    return { ok: false, status: 404, error: 'Permission request not found.' }
  }

  if (row.state !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: `This permission request is already ${row.state} and cannot be withdrawn.`,
    }
  }

  const decidedAt = new Date(args.now ?? Date.now()).toISOString()

  const { data: updatedData, error: updateError } = await service
    .from('workspace_permission_requests')
    .update({ state: 'withdrawn', decided_at: decidedAt, decided_by: args.actorId })
    .eq('id', row.id)
    .eq('state', 'pending')
    .select(REQUEST_COLUMNS)
    .maybeSingle()

  if (updateError) return { ok: false, status: 500, error: 'Permission request could not be updated.' }

  const request = updatedData ? toPermissionRequest(updatedData as RequestRow) : null
  if (!request) {
    return {
      ok: false,
      status: 409,
      error: 'This permission request was decided before it could be withdrawn.',
    }
  }

  await logWorkspaceAction(service, {
    workspaceId: row.workspace_id,
    actorId: args.actorId,
    subjectMemberId: row.member_user_id,
    action: 'workspace.permission_request.withdrawn',
    targetType: 'workspace_permission_requests',
    targetId: request.id,
    changes: { permission: request.permission, projectId: request.projectId },
  })

  return { ok: true, request }
}

/**
 * Everything anyone is currently asking of one Member, newest first. This
 * is the read behind WSR-27's "{Workspace} wants access" prompt. It is
 * keyed on `member_user_id` alone — no join — which is exactly why
 * migration 195 denormalises that column and pins it with a trigger.
 * Never throws.
 */
export async function listRequestsForMember(
  service: SupabaseClient,
  args: { memberUserId: string; states?: readonly PermissionRequestState[] }
): Promise<ListRequestsResult> {
  let query = service
    .from('workspace_permission_requests')
    .select(REQUEST_COLUMNS)
    .eq('member_user_id', args.memberUserId)

  if (args.states && args.states.length > 0) {
    query = query.in('state', args.states as string[])
  }

  const { data, error } = await query.order('requested_at', { ascending: false })

  if (error) return { ok: false, status: 500, error: 'Could not load permission requests.' }
  return { ok: true, requests: mapRows((data ?? []) as RequestRow[]) }
}

/**
 * Everything one workspace has asked, newest first, optionally narrowed to
 * a single relationship. This is the workspace's own view of its outbox —
 * it says what has been asked and what came back, and it confers nothing.
 * Never throws.
 */
export async function listRequestsForWorkspace(
  service: SupabaseClient,
  args: {
    workspaceId: string
    relationshipId?: string | null
    states?: readonly PermissionRequestState[]
  }
): Promise<ListRequestsResult> {
  let query = service
    .from('workspace_permission_requests')
    .select(REQUEST_COLUMNS)
    .eq('workspace_id', args.workspaceId)

  if (args.relationshipId) {
    query = query.eq('relationship_id', args.relationshipId)
  }

  if (args.states && args.states.length > 0) {
    query = query.in('state', args.states as string[])
  }

  const { data, error } = await query.order('requested_at', { ascending: false })

  if (error) return { ok: false, status: 500, error: 'Could not load permission requests.' }
  return { ok: true, requests: mapRows((data ?? []) as RequestRow[]) }
}

/**
 * The Member answers. ONLY the request's own `member_user_id` may reach a
 * decision here, and the check is this function's first act after loading
 * the row — a miss and a mismatch return one indistinguishable 403.
 *
 * ─── ORDER OF OPERATIONS, AND WHY ────────────────────────────────────────
 * On approve, the CONSENT IS ISSUED FIRST, through `issueMemberConsent`,
 * and only then is the decision recorded on the request row. If the consent
 * write fails for any reason, this function returns that failure verbatim
 * and the request STAYS `pending` — nothing is recorded. A recorded
 * approval whose grant did not land is the one outcome that must never
 * occur: it would tell the Member and the workspace that access was granted
 * when no grant row exists, and migration 195's terminal-state trigger
 * would then refuse to let anyone correct it.
 *
 * The opposite residue — a consent row that landed while the request row
 * update failed — is recoverable and harmless: the access matches exactly
 * what the Member chose, the ask simply stays open, and re-approving is a
 * no-op success because `issueMemberConsent` skips permissions that are
 * already live.
 *
 * THIS FUNCTION WRITES NO GRANT ROW. It calls the one module that does.
 * Never throws.
 */
export async function decidePermissionRequest(
  service: SupabaseClient,
  args: {
    requestId: string
    decidingUserId: string
    decision: PermissionRequestDecision
    now?: number
  }
): Promise<DecideRequestResult> {
  if (args.decision !== 'approved' && args.decision !== 'declined') {
    return { ok: false, status: 400, error: 'A decision must be approved or declined.' }
  }

  const loaded = await loadRequest(service, args.requestId)
  if (!loaded.ok) return { ok: false, status: 500, error: loaded.error }

  const row = loaded.row
  if (!row || row.member_user_id !== args.decidingUserId) {
    return { ok: false, status: 403, error: NOT_YOURS }
  }

  if (row.state !== 'pending') {
    return {
      ok: false,
      status: 409,
      error: `This permission request is already ${row.state}.`,
    }
  }

  let issued: WorkspacePermission[] = []

  if (args.decision === 'approved') {
    const consent = await issueMemberConsent(service, {
      workspaceId: row.workspace_id,
      relationshipId: row.relationship_id,
      consentingUserId: args.decidingUserId,
      requested: [row.permission],
      projectId: row.project_id,
      now: args.now,
    })

    // The request stays pending. Nothing below this point runs.
    if (!consent.ok) return { ok: false, status: consent.status, error: consent.error }

    issued = consent.permissions
  }

  const decidedAt = new Date(args.now ?? Date.now()).toISOString()

  const { data: updatedData, error: updateError } = await service
    .from('workspace_permission_requests')
    .update({ state: args.decision, decided_at: decidedAt, decided_by: args.decidingUserId })
    .eq('id', row.id)
    .eq('state', 'pending')
    .select(REQUEST_COLUMNS)
    .maybeSingle()

  if (updateError) return { ok: false, status: 500, error: 'Permission request could not be updated.' }

  const request = updatedData ? toPermissionRequest(updatedData as RequestRow) : null
  if (!request) {
    return { ok: false, status: 409, error: 'This permission request was already decided.' }
  }

  await logWorkspaceAction(service, {
    workspaceId: row.workspace_id,
    actorId: args.decidingUserId,
    subjectMemberId: row.member_user_id,
    action: `workspace.permission_request.${args.decision}`,
    targetType: 'workspace_permission_requests',
    targetId: request.id,
    changes: {
      permission: request.permission,
      projectId: request.projectId,
      // What the consent writer actually wrote on this call — empty when
      // the Member had already consented to this permission, which is a
      // no-op success, not a failure.
      issued,
    },
  })

  return { ok: true, request, issued }
}
