import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { canManageRoster } from '@/lib/workspaces/membership'
import {
  createPermissionRequest,
  listRequestsForWorkspace,
  withdrawPermissionRequest,
  PERMISSION_REQUEST_STATE_VALUES,
  type PermissionRequestState,
} from '@/lib/workspaces/request-service'

// ─── /api/workspaces/[workspaceId]/permission-requests ───────────────────
//     The workspace's side of the ask (R-19 / WSR-28).
//
// THIS ROUTE CAN ASK AND IT CAN STOP ASKING. IT CANNOT ANSWER.
// There are exactly three verbs here — POST creates an ask, GET lists this
// workspace's own asks, DELETE withdraws one — and NONE of them can reach
// `approved` or `declined` from any input:
//   * `decidePermissionRequest` is NOT IMPORTED by this file. Deliberately.
//     The strongest available statement that a workspace cannot decide is
//     that the deciding function is not in scope here at all.
//   * `withdrawPermissionRequest` writes exactly one state, `withdrawn`,
//     and takes no parameter through which a caller could name another.
//   * Both request schemas are `.strict()` and neither admits a `state`
//     key, so no body can carry a state into this route.
//   * Migration 195's own RLS policies say the same thing declaratively,
//     and its BEFORE UPDATE trigger enforces terminality against the
//     service-role path this route actually uses.
// Approving and declining live ONLY on the Member-side consent surface,
// which is outside `/api/workspaces/**` entirely because the deciding
// Member is not a member of the asking workspace and must never have to
// enter its context to answer.
//
// AN ASK CONFERS NOTHING. A row written by this route is a proposal — the
// sibling of R-08's proposed agreement evidence and D-05's proposed roster
// relationship. It carries no `parent_grant_id`, no authorization path
// reads it, and the workspace's access does not change by one byte as a
// result of any request this route can create. What it buys is the ability
// to PROMPT: without it, migration 191's consent-root-or-lineage constraint
// means a workspace cannot record an ask until a Member consent root
// already exists, and WSR-27's "{Workspace} wants access" story is
// unreachable.
//
// THE D-56 KILL SWITCH IS CONSULTED FIRST, and it fails closed with 503.
// That consultation is `requireWorkspaceAccess`'s own first statement (the
// F7 hotfix, 2026-09-06) — every verb below opens with that gate before it
// reads a body, touches a service client, or looks at a role, so this route
// inherits the platform-wide control rather than restating it. It is NOT
// re-implemented here: a second, independent kill-switch read in this file
// would be a second thing to keep correct, and the whole point of routing
// every `/api/workspaces/**` verb through one gate is that there is exactly
// one.
//
// `workspaceId` comes from this route's OWN PATH SEGMENT only, never from a
// request body (D-31), and both schemas below are `.strict()` — neither
// admits a `workspaceId`, a `memberUserId` or a `state`, so nothing in a
// body can redirect a write to another workspace's relationship or to
// another Member.

const CreateRequestSchema = z
  .object({
    relationshipId: z.string().uuid(),
    // Deliberately `z.string()`, not `z.enum`. The recognised /
    // structurally-excluded decision belongs to `request-service.ts`, which
    // refuses each case BY NAME (403 for a D-42 capability, 400 for an
    // unknown value); a `z.enum` here would collapse both into one generic
    // Zod message and move a security decision into a request schema. Same
    // reasoning `app/api/roster/relationships/[relationshipId]/consent/
    // route.ts` records for its own permission array.
    permission: z.string().trim().min(1, 'A permission is required.'),
    projectId: z.string().uuid().nullable().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict()

const WithdrawRequestSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

const KNOWN_STATES: ReadonlySet<string> = new Set(PERMISSION_REQUEST_STATE_VALUES)

/** Parses the optional `?state=` filter. An unrecognised value is dropped
 * rather than errored — a filter is a view preference, and failing the
 * whole read over one would be the wrong trade. */
function parseStateFilter(raw: string | null): PermissionRequestState[] | undefined {
  if (!raw) return undefined
  const states = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is PermissionRequestState => KNOWN_STATES.has(value))
  return states.length > 0 ? states : undefined
}

/**
 * The shared opening of all three verbs: the D-56 kill switch (inside
 * `requireWorkspaceAccess`, first), then the owner/admin role gate.
 *
 * Owner/admin only, on every verb including GET — matching migration 195's
 * `workspace_permission_requests_workspace_select` policy exactly. Who a
 * workspace has asked for what is roster-management material, not general
 * workspace chrome: ordinary members, contractors and guests get nothing
 * here, the same posture R-12 takes for proposed relationships.
 */
async function openWorkspaceContext(workspaceId: string, action: string) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  return requireWorkspaceRole(access, canManageRoster, `Only owners and admins can ${action}.`)
}

// ─── POST — the workspace asks ────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params

  const gated = await openWorkspaceContext(workspaceId, 'request permissions')
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = CreateRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const result = await createPermissionRequest(createServiceClient(), {
    workspaceId,
    relationshipId: parsed.data.relationshipId,
    permission: parsed.data.permission,
    projectId: parsed.data.projectId ?? null,
    requestedBy: gated.userId,
    note: parsed.data.note ?? null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // 200 rather than 201 when the ask already existed: nothing was created,
  // and the Member is not asked twice.
  return NextResponse.json({ data: result.request }, { status: result.created ? 201 : 200 })
}

// ─── GET — this workspace's own outbox ────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params

  const gated = await openWorkspaceContext(workspaceId, 'view permission requests')
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const url = new URL(request.url)

  const result = await listRequestsForWorkspace(createServiceClient(), {
    workspaceId,
    relationshipId: url.searchParams.get('relationshipId'),
    states: parseStateFilter(url.searchParams.get('state')),
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ data: result.requests })
}

// ─── DELETE — the workspace stops asking ──────────────────────────────────
// Withdraws the ask. It does not delete the row: the record that a
// workspace asked, and that it later retracted, survives — the same
// supersede-never-remove posture the evidence route takes for D-46.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params

  const gated = await openWorkspaceContext(workspaceId, 'withdraw permission requests')
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = WithdrawRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const result = await withdrawPermissionRequest(createServiceClient(), {
    workspaceId,
    requestId: parsed.data.requestId,
    actorId: gated.userId,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ data: result.request })
}
