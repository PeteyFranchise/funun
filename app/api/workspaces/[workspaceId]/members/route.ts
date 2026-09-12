import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import {
  canManageOwners,
  canManageWorkspaceMembers,
  isLegalMembershipTransition,
  WORKSPACE_OWNER_FLOOR_MESSAGE,
} from '@/lib/workspaces/membership'
import {
  WORKSPACE_MEMBERSHIP_STATE_VALUES,
  WORKSPACE_ROLE_VALUES,
  type WorkspaceMembershipState,
  type WorkspaceRole,
} from '@/lib/workspaces/types'

// ─── /api/workspaces/[workspaceId]/members — list, re-role, suspend, remove ─
// (D-11, D-13, D-14, D-31, D-50). `workspaceId` is taken from the route's own
// path segment ONLY — every handler re-derives the caller's live membership
// from the database via requireWorkspaceAccess before touching a row, and
// never trusts a workspace id supplied in a request body (D-31).
//
// THE SINGLE WRITER IS THE RPC (R-06 / WSR-11 / F15). Every mutating handler
// here performs exactly ONE write call:
// `workspace_change_member_role_or_status` (migration 198 section (c)). That
// function takes the row lock, revalidates every precondition after the lock,
// mutates, and writes its own audit row — all in ONE transaction. This route
// therefore issues no `.update()` against `workspace_members`, and invokes
// the shared workspace-audit helper on no path the RPC owns: a route-side
// audit write beside the RPC's would be a second writer, and the stale copy
// is where drift lives (RESEARCH §11.3 — keep every predicate, delete every
// mutation sequence).
//
// THE OWNER FLOOR IS NOW COUNTED INSIDE THE WRITE TRANSACTION. It used to be
// counted by a route-local helper, in a supabase-js call separate from the
// UPDATE — two transactions, which is finding F15: two concurrent
// demotions of two DIFFERENT owners each counted one remaining owner and each
// concluded the floor held. The count now happens after the row lock, inside
// the same transaction as the write, and reaches this route as the outcome
// code `'floor'`. `guard_workspace_never_zero_owners` goes back to being the
// backstop it was meant to be rather than the primary control.
//
// R-21 OPTION A — WHAT THIS ROUTE SUPPLIES AND WHAT IT DOES NOT. The route
// passes the actor id it has ALREADY PROVED via `requireWorkspaceAccess`. The
// RPC re-derives that actor's AUTHORITY — role, active status, live
// `expires_at` — from the database under the lock. There is deliberately no
// `p_actor_role` parameter and there never will be: a caller that could
// assert its own role would make every check inside the RPC decorative. R-05's
// "enforced in the database, never route logic" is therefore only PARTIALLY
// satisfied, deliberately and on the record — the authority half is in the
// database, the identity half is here.
//
// TWO PREDICATES, DELIBERATELY DISAGREEING ON `admin` (R-05 / WSR-07).
// `canManageWorkspaceMembers` still admits admins, because ordinary member
// management is still an admin's job and no decision takes that away.
// `canManageOwners` admits owners only, and gates the owner-touching paths
// BESIDE it, never instead of it. A handler that touches an owner row, or is
// asked to produce one, checks BOTH. That disagreement is the whole of WSR-07.
//
// DELETE never deletes a workspace_members row — it calls the RPC with
// `p_new_status = 'removed'` so contributions, approvals, signatures, and
// audit entries stay attributed (D-14).

const MEMBER_COLUMNS = 'id, user_id, role, status, expires_at, created_at'

type WorkspaceMemberRow = {
  id: string
  workspace_id: string
  user_id: string | null
  role: WorkspaceRole
  status: WorkspaceMembershipState
}

type MemberChangeOutcome = {
  outcome: string
  member_id: string | null
  subject_user_id: string | null
  audit_id: string | null
}

const PatchMemberSchema = z
  .object({
    memberId: z.string().uuid(),
    role: z.enum(WORKSPACE_ROLE_VALUES).optional(),
    status: z.enum(WORKSPACE_MEMBERSHIP_STATE_VALUES).optional(),
  })
  .strict()
  .refine(data => data.role !== undefined || data.status !== undefined, {
    message: 'Provide a role or a status to update.',
  })

const DeleteMemberSchema = z.object({ memberId: z.string().uuid() }).strict()

// ─── Outcome → HTTP, in the shape of ────────────────────────────────────────
// `app/api/antenna/opportunities/[opportunityId]/apply/route.ts`: a
// `Record<string, { error, status }>` with a fallback for a code this route
// does not recognise, so an unmapped outcome degrades to a 400 with a
// sentence rather than a 500 with a stack trace.
//
// THE `'floor'` ENTRY REPLACES A STRING MATCH ON A POSTGRES ERROR MESSAGE.
// Until this rewrite, THREE files were coupled to one English sentence:
// migration 182's `RAISE`, `WORKSPACE_OWNER_FLOOR_MESSAGE`, and a route-local
// sniffer that tested whether the database error message contained a
// substring of that sentence. Rewording the RAISE would have silently turned
// every owner-floor refusal into a 500. The RPC now returns the code
// `'floor'` and the sniffer is deleted;
// `WORKSPACE_OWNER_FLOOR_MESSAGE` remains the single place that sentence
// lives, and it is IMPORTED here rather than repeated.
//
// The vocabulary below is migration 198 section (c)'s, in full:
// ok, not_found, forbidden, forbidden_owner_row, promotion_requires_transfer,
// no_self_role_change, stale, illegal_transition, floor.
const MEMBER_CHANGE_OUTCOMES: Record<string, { error: string; status: number }> = {
  not_found: { error: 'Member not found.', status: 404 },
  forbidden: {
    error: 'Only owners and admins can manage workspace members.',
    status: 403,
  },
  forbidden_owner_row: {
    error:
      'Only an owner can change an owner’s seat — an admin cannot edit or remove an owner (R-05).',
    status: 403,
  },
  promotion_requires_transfer: {
    error:
      'Ownership moves only as a two-sided transfer: nominate a successor at POST /api/workspaces/{workspaceId}/ownership and have them accept it. Nobody is promoted straight to owner.',
    status: 409,
  },
  no_self_role_change: {
    error: 'You cannot change your own role on this workspace.',
    status: 403,
  },
  stale: {
    error: 'This member changed while you were editing. Reload the roster and try again.',
    status: 409,
  },
  illegal_transition: {
    error: 'That is not a legal move for this member’s current status.',
    status: 400,
  },
  floor: { error: WORKSPACE_OWNER_FLOOR_MESSAGE, status: 409 },
}

const UNRECOGNISED_OUTCOME = {
  error: 'That change to this member could not be applied.',
  status: 400,
}

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely so
// that a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving, and
// `40P01` (deadlock detected) is the other bounded outcome; both mean "nothing
// was written, ask again", which is a 409 the caller can act on — never a 500.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])

const LOCK_CONTENTION_MESSAGE =
  'This workspace was being changed by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
}

// A read, kept: it produces the friendly pre-refusals this route can make
// cheaply (not found, an illegal status edge named in words, the owner-row
// gate) before the RPC is reached, and it supplies the compare-and-set tokens
// the RPC checks against the LOCKED row. It writes nothing.
async function loadTargetMember(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  memberId: string
): Promise<{ row: WorkspaceMemberRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_members')
    .select('id, workspace_id, user_id, role, status')
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) return { row: null, error: 'Request could not be completed.' }
  return { row: (data as WorkspaceMemberRow | null) ?? null }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // The gate above already proved active membership; the service client
  // reads the full roster because ordinary members (not just owner/admin)
  // may list it, which the workspace_members_select RLS policy does not by
  // itself permit.
  const service = createServiceClient()
  const { data, error } = await service
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageWorkspaceMembers,
    'Only owners and admins can manage workspace members.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { memberId, role, status } = parsed.data
  const service = createServiceClient()
  const { row: target, error: targetError } = await loadTargetMember(service, workspaceId, memberId)
  if (targetError) return NextResponse.json({ error: 'Workspace member could not be loaded.' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  if (status !== undefined && status !== target.status) {
    if (!isLegalMembershipTransition(target.status, status)) {
      return NextResponse.json(
        { error: `Cannot move a member from ${target.status} to ${status}.` },
        { status: 400 }
      )
    }
  }

  // R-05 / WSR-07, at the route: the owner paths gate on `canManageOwners`
  // BESIDE `canManageWorkspaceMembers` above, never instead of it. This is
  // the FIRST of three layers — the RPC's own post-lock `forbidden_owner_row`
  // and `promotion_requires_transfer` checks are the second, and migration
  // 197's `guard_workspace_owner_role_change` is the third.
  if (target.role === 'owner' || role === 'owner') {
    const ownerGate = requireWorkspaceRole(
      access,
      canManageOwners,
      'Only an owner can change an owner’s seat, and ownership moves only as a two-sided transfer (R-05).'
    )
    if (!ownerGate.ok) {
      return NextResponse.json({ error: ownerGate.error }, { status: ownerGate.status })
    }
  }

  // NULL means "leave this column unchanged" to the RPC, so a value equal to
  // what the row already holds is passed as NULL rather than as a no-op write
  // that would still fire every row trigger and still write an audit row.
  const nextRole = role !== undefined && role !== target.role ? role : null
  const nextStatus = status !== undefined && status !== target.status ? status : null

  if (nextRole === null && nextStatus === null) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  // THE ONE WRITE. `p_actor_id` is the identity `requireWorkspaceAccess`
  // already proved; the RPC re-derives that actor's authority itself and
  // accepts no role parameter (R-21). The target's currently-loaded role and
  // status travel as the compare-and-set tokens, so a roster that moved
  // between this route's read and the RPC's lock comes back as `'stale'`
  // rather than overwriting somebody else's change.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_change_member_role_or_status', {
      p_actor_id: gated.userId,
      p_workspace_id: workspaceId,
      p_member_id: target.id,
      p_new_role: nextRole,
      p_new_status: nextStatus,
      p_expected_role: target.role,
      p_expected_status: target.status,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as MemberChangeOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = MEMBER_CHANGE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const { data: updated, error: readError } = await service
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('id', target.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: updated })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageWorkspaceMembers,
    'Only owners and admins can remove workspace members.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = DeleteMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid memberId is required.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { row: target, error: targetError } = await loadTargetMember(
    service,
    workspaceId,
    parsed.data.memberId
  )
  if (targetError) return NextResponse.json({ error: 'Workspace member could not be loaded.' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  // `removed` is terminal (D-14), so this refusal is the route's own and is
  // reached before the RPC — the RPC would return `illegal_transition` for the
  // same request, but this sentence names the actual situation.
  if (target.status === 'removed') {
    return NextResponse.json({ error: 'Member has already been removed.' }, { status: 400 })
  }

  if (target.role === 'owner') {
    const ownerGate = requireWorkspaceRole(
      access,
      canManageOwners,
      'Only an owner can remove an owner’s seat (R-05).'
    )
    if (!ownerGate.ok) {
      return NextResponse.json({ error: ownerGate.error }, { status: ownerGate.status })
    }
  }

  // Status change only — this handler never issues a DELETE against
  // workspace_members, and neither does the RPC it calls (D-14). Removal ends
  // future access; contributions, approvals, signatures and audit rows stay
  // attributed.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_change_member_role_or_status', {
      p_actor_id: gated.userId,
      p_workspace_id: workspaceId,
      p_member_id: target.id,
      p_new_role: null,
      p_new_status: 'removed',
      p_expected_role: target.role,
      p_expected_status: target.status,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as MemberChangeOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = MEMBER_CHANGE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const { data: updated, error: readError } = await service
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('id', target.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: updated })
}
