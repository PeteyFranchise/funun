import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  requireWorkspaceAccess,
  requireWorkspaceRole,
  WORKSPACE_ACCESS_DISABLED,
} from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageWorkspaceMembers, isTimeBoxedRole } from '@/lib/workspaces/membership'
import { WORKSPACE_ROLE_VALUES, type WorkspaceRole } from '@/lib/workspaces/types'
import {
  createInvitationToken,
  INVITATION_RATE_LIMIT,
  normalizeInvitedEmail,
  resolveInvitationExpiry,
} from '@/lib/workspaces/invitations'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { sendEmail } from '@/lib/email'
import { workspaceSeatInviteEmail } from '@/lib/email/workspaceSeatInvite'

// ─── /api/workspaces/[workspaceId]/invitations — issue, list, revoke seats ─
// (D-12, D-13, D-49, D-50, D-51). `workspaceId` is taken from the route's
// own path segment ONLY, mirroring app/api/workspaces/[workspaceId]/
// members/route.ts's gate-then-mutate-then-log shape exactly — every
// handler re-derives the caller's live membership from the database via
// requireWorkspaceAccess before touching a row.
//
// A pending invitation and its paired pending seat grant NOTHING (D-12).
// Reconciling an existing Member's identity is SERVICE-ROLE ONLY, via the
// already-live service-only identity lookup RPC (migration 177) — this file
// never accepts a user id from the request body, and never redefines or
// re-grants that function. An unregistered address simply leaves its
// invitation waiting; this route never calls a user-creation API and never
// touches the signup trigger (Phase 27 invite-only gate).
//
// ─── WSR-19 / R-13 — NOTHING RESTRICTED GOES IN `changes` ─────────────────
// `workspace_audit_log.changes` is a BROADLY READABLE column: migration
// 186's audit-visibility helper makes it reachable by every active seat on
// the workspace, guests included. No handler in this file may put a
// restricted key in it — email, phone, contact details, address, tax id,
// token, token hash, IPI or ISNI — at any depth.
//
// THIS RULE IS ENFORCED, NOT MERELY CONVENTIONAL. Migration 197 section (f)
// installs `guard_workspace_audit_log_no_restricted_pii` as a BEFORE INSERT
// trigger that refuses those key names at ANY depth via a recursive
// `jsonb_path_exists` walk — so reintroducing one does not leak quietly, it
// makes the insert RAISE and the request fail. Where a restricted value
// legitimately belongs is on its own row, reachable from the audit row
// through `target_id`, behind that table's own policy.
//
// Role 'owner' is refused outright at issuance — ownership transfer is
// promote-then-step-down (D-13), never an invitation. Because only an
// owner or admin may reach this route at all (canManageWorkspaceMembers)
// and 'owner' itself can never be the invited role, an inviter can never
// confer authority above what a workspace's top non-owner tier already
// implies (D-49's "no grant may exceed what the granter holds", read for
// workspace roles rather than permission bundles).

const INVITABLE_ROLE_VALUES = WORKSPACE_ROLE_VALUES.filter(role => role !== 'owner') as Exclude<
  WorkspaceRole,
  'owner'
>[]

const InviteSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    role: z.enum(WORKSPACE_ROLE_VALUES),
  })
  .strict()

const INVITATION_LIST_COLUMNS = 'id, email, role, status, expires_at, created_at'

function buildAcceptLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
  const params = new URLSearchParams({ token })
  return `${base}/workspaces/invitations/accept?${params.toString()}`
}

export async function POST(
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
    'Only owners and admins can invite workspace members.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  // F10 hotfix (2026-09-06): checkRateLimit()/check_rate_limit (migration
  // 116) returns TRUE at/over the limit. This previously named that result
  // `withinLimit` and guarded with `if (!withinLimit)`, inverting the
  // polarity — attempts 1-20 were refused while accumulating hits, and
  // attempt 21 onward passed unbounded for the rest of the window. `limited`
  // matches the name and guard app/api/workspaces/[workspaceId]/roster/
  // route.ts already uses for the same RPC.
  const limited = await checkRateLimit(`workspace-invite:${workspaceId}`, INVITATION_RATE_LIMIT)
  if (limited) {
    return NextResponse.json(
      { error: 'Too many invitations issued for this workspace. Try again later.' },
      { status: 429 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = InviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  if (parsed.data.role === 'owner') {
    return NextResponse.json(
      { error: 'Ownership is transferred by promoting an existing member, never by invitation.' },
      { status: 400 }
    )
  }
  const role = parsed.data.role as (typeof INVITABLE_ROLE_VALUES)[number]

  const normalizedEmail = normalizeInvitedEmail(parsed.data.email)
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Service-role-only identity reconciliation (migration 177). Never
  // accept a user id from the request body; never expose the resolved id
  // to the client beyond the boolean fact folded into the response below.
  const { data: resolvedUserId, error: resolveError } = await service.rpc(
    'find_auth_user_id_by_email',
    { p_email: normalizedEmail }
  )
  if (resolveError) {
    return NextResponse.json({ error: 'Could not process the invitation.' }, { status: 500 })
  }

  const now = Date.now()
  const expiresAt = resolveInvitationExpiry({ role, now })
  const { token, tokenHash } = createInvitationToken()

  const { data: invitation, error: insertInvitationError } = await service
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      email: normalizedEmail,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      invited_by: gated.userId,
    })
    .select('id')
    .single()

  if (insertInvitationError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  // Never create an auth.users row and never call an admin user-creation
  // API — an unregistered address leaves this pending seat waiting until
  // the person signs up themselves through the ordinary Phase 27 flow.
  const { error: insertSeatError } = await service.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: (resolvedUserId as string | null) ?? null,
    invited_email: normalizedEmail,
    role,
    status: 'pending',
    invited_by: gated.userId,
    expires_at: isTimeBoxedRole(role) ? expiresAt.toISOString() : null,
  })

  if (insertSeatError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  // Best-effort display niceties for the email — a missing workspace name
  // or inviter profile never blocks the invitation, it just falls back to
  // a generic label.
  const [{ data: workspaceRow }, { data: inviterProfile }] = await Promise.all([
    service.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
    service.from('user_profiles').select('display_name').eq('id', gated.userId).maybeSingle(),
  ])

  const emailContent = workspaceSeatInviteEmail({
    workspaceName: (workspaceRow?.name as string | undefined) ?? 'a Funūn workspace',
    inviterName: (inviterProfile?.display_name as string | undefined) ?? 'A Funūn teammate',
    role,
    actionLink: buildAcceptLink(token),
  })
  // Best-effort send — a delivery failure never blocks the invitation from
  // existing; the invited address can still be told out-of-band, and the
  // pending seat/invitation rows are already durable.
  await sendEmail({
    to: normalizedEmail,
    subject: emailContent.subject,
    html: emailContent.html,
    text: emailContent.text,
  })

  // WSR-19 / R-13 — `changes` CARRIES THE ROLE AND NOTHING ELSE. It used to
  // carry `email: normalizedEmail`, and `changes` is a BROADLY READABLE
  // column: migration 186's audit-visibility helper makes it reachable by
  // every active seat on this workspace, including a guest, so an invited
  // person's address was in front of all of them.
  //
  // The address has not been lost, only narrowed to the people entitled to
  // it. It lives on `workspace_invitations.email`, whose SELECT policy
  // (migration 182) is owner/admin-only, and THIS AUDIT ROW ALREADY POINTS AT
  // THAT ROW through `target_id` — so an owner or admin reading the trail can
  // still resolve who was invited, and nobody else can.
  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: (resolvedUserId as string | null) ?? null,
    action: 'workspace.invitation.issued',
    targetType: 'workspace_invitation',
    targetId: invitation?.id ?? null,
    changes: { role },
  })

  return NextResponse.json({
    data: {
      id: invitation?.id,
      email: normalizedEmail,
      role,
      expiresAt: expiresAt.toISOString(),
      existingAccount: Boolean(resolvedUserId),
    },
  })
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
  const gated = requireWorkspaceRole(
    access,
    canManageWorkspaceMembers,
    'Only owners and admins can view workspace invitations.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('workspace_invitations')
    .select(INVITATION_LIST_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

const RevokeInvitationSchema = z.object({ invitationId: z.string().uuid() }).strict()

// ─── REVOCATION IS ONE TRANSACTION — public.workspace_revoke_invitation ────
//
// This handler used to issue THREE PostgREST calls, which are THREE
// transactions: `.update({ status: 'revoked' })` on the invitation, then
// `.update({ status: 'removed' })` on the paired pending seat, then one
// `logWorkspaceAction`. Migration 197's `assert_workspace_change_is_audited`
// is a DEFERRED constraint trigger that demands, at COMMIT, an audit row
// whose `target_id` is the mutated row's own id and whose `created_at`
// equals `now()` — and `NOW()` is `transaction_timestamp()`, one value per
// transaction. So the single audit row landed in the THIRD transaction and
// could never match the FIRST one's `now()`, and the seat update had no
// audit row at all. Once 197 applies, BOTH mutations abort at COMMIT and
// invitation revocation stops working outright.
//
// Migration 198 section (j) does all of it in one transaction: it locks in
// LO-1 order (rank 1 `workspaces`, rank 2 the paired pending seats, rank 4
// the invitation), revalidates every precondition under those locks,
// re-derives the caller's authority from the database rather than trusting a
// parameter (R-21), sweeps the seats one row per statement, and writes an
// audit row per mutated row. Those two `.update()` calls were the LAST
// route-side consequential writers outside the RPC family; this handler
// writes nothing directly, and it no longer calls `logWorkspaceAction`.
//
// The read below is KEPT, in the shape
// `app/api/workspaces/[workspaceId]/members/route.ts` uses: it produces the
// friendly pre-refusals this route can make cheaply and supplies the
// compare-and-set token the RPC checks against the LOCKED row. It writes
// nothing — and it no longer selects `email` or `role`, because the pairing
// is the RPC's business now and this route has no reason to hold a second
// copy of somebody's address (WSR-19).
//
// The vocabulary below is migration 198 section (j)'s, in full:
// ok, not_found, forbidden, not_pending, stale.
const REVOKE_OUTCOMES: Record<string, { error: string; status: number }> = {
  not_found: { error: 'Invitation not found.', status: 404 },
  forbidden: {
    error: 'Only owners and admins can revoke workspace invitations.',
    status: 403,
  },
  // The sentence and status this handler has always returned for a
  // non-pending invitation, preserved exactly.
  not_pending: { error: 'Only a pending invitation can be revoked.', status: 400 },
  stale: {
    error: 'This invitation changed while you were viewing it. Reload and try again.',
    status: 409,
  },
}

const UNRECOGNISED_REVOKE_OUTCOME = {
  error: 'That invitation could not be revoked.',
  status: 400,
}

type RevokeInvitationOutcome = {
  outcome: string
  invitation_id: string | null
  seats_removed: number | null
  invitation_audit_id: string | null
  member_audit_id: string | null
}

// ─── Postgres error code → response ─────────────────────────────────────────
// Migration 198 sets `SET LOCAL lock_timeout = '3s'` in every RPC precisely so
// that a blocked row lock becomes a bounded, retryable failure rather than a
// hung request. `55P03` (lock not available) is that timeout arriving, and
// `40P01` (deadlock detected) is the other bounded outcome; both mean "nothing
// was written, ask again", which is a 409 the caller can act on — never a 500.
//
// `42501` is the RPC's own refusal when the D-56 control is off.
// `requireWorkspaceAccess` above already answers that with a 503, so this
// entry exists for the window where the switch flips BETWEEN the gate and the
// RPC: the second layer must give the SAME answer as the first — and the same
// sentence, which is why `WORKSPACE_ACCESS_DISABLED` is imported rather than
// retyped.
type PostgresLikeError = { message: string; code?: string }

const RETRYABLE_LOCK_CODES: ReadonlySet<string> = new Set(['40P01', '55P03'])
const ACCESS_DISABLED_CODE = '42501'

const LOCK_CONTENTION_MESSAGE =
  'This workspace was being changed by someone else. Nothing was saved — please try again.'

function respondToPostgresError(error: PostgresLikeError): NextResponse {
  if (error.code === ACCESS_DISABLED_CODE) {
    return NextResponse.json({ error: WORKSPACE_ACCESS_DISABLED }, { status: 503 })
  }
  if (error.code && RETRYABLE_LOCK_CODES.has(error.code)) {
    return NextResponse.json({ error: LOCK_CONTENTION_MESSAGE }, { status: 409 })
  }
  return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
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
    'Only owners and admins can revoke workspace invitations.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RevokeInvitationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid invitationId is required.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // The read-only pre-refusal layer. It writes nothing, and it reads only the
  // two columns it needs: the id it was given back, and the status that
  // becomes the RPC's compare-and-set token.
  const { data: target, error: targetError } = await service
    .from('workspace_invitations')
    .select('id, status')
    .eq('id', parsed.data.invitationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (targetError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })

  if (target.status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending invitation can be revoked.' }, { status: 400 })
  }

  // ─── THE ONE WRITE ───────────────────────────────────────────────────────
  // `p_actor_id` is the identity `requireWorkspaceAccess` already proved; the
  // RPC re-derives that actor's authority itself and accepts no role
  // parameter (R-21). `p_expected_status` is the status this route just read,
  // so an invitation that moved between this read and the RPC's lock comes
  // back as `'stale'` rather than overwriting somebody else's change. The
  // paired pending seats are found, locked, swept and audited inside the same
  // transaction — this route neither names them nor writes them.
  const { data: rpcData, error: rpcError } = await service
    .rpc('workspace_revoke_invitation', {
      p_actor_id: gated.userId,
      p_workspace_id: workspaceId,
      p_invitation_id: target.id,
      p_expected_status: target.status,
    })
    .single()

  if (rpcError) return respondToPostgresError(rpcError as PostgresLikeError)

  const result = (rpcData as RevokeInvitationOutcome | null) ?? null
  if (!result || result.outcome !== 'ok') {
    const mapped = REVOKE_OUTCOMES[result?.outcome ?? ''] ?? UNRECOGNISED_REVOKE_OUTCOME
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  // The existing response shape, unchanged, so no client change is needed.
  return NextResponse.json({ data: { id: result.invitation_id, status: 'revoked' } })
}
