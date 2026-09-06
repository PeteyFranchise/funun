import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
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
    return NextResponse.json({ error: insertInvitationError.message }, { status: 500 })
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
    return NextResponse.json({ error: insertSeatError.message }, { status: 500 })
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

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: (resolvedUserId as string | null) ?? null,
    action: 'workspace.invitation.issued',
    targetType: 'workspace_invitation',
    targetId: invitation?.id ?? null,
    changes: { role, email: normalizedEmail },
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

const RevokeInvitationSchema = z.object({ invitationId: z.string().uuid() }).strict()

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
  const { data: target, error: targetError } = await service
    .from('workspace_invitations')
    .select('id, status, email, role')
    .eq('id', parsed.data.invitationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 })
  if (!target) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })

  if (target.status !== 'pending') {
    return NextResponse.json({ error: 'Only a pending invitation can be revoked.' }, { status: 400 })
  }

  const { error: updateError } = await service
    .from('workspace_invitations')
    .update({ status: 'revoked' })
    .eq('id', target.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Set the paired pending seat's status to 'removed' too — a revoked
  // invitation must not leave a dangling pending seat behind (D-14: status
  // update only, never a DELETE against workspace_members).
  await service
    .from('workspace_members')
    .update({ status: 'removed' })
    .eq('workspace_id', workspaceId)
    .eq('invited_email', target.email)
    .eq('role', target.role)
    .eq('status', 'pending')

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: gated.userId,
    subjectMemberId: null,
    action: 'workspace.invitation.revoked',
    targetType: 'workspace_invitation',
    targetId: target.id,
    changes: { status: { before: 'pending', after: 'revoked' } },
  })

  return NextResponse.json({ data: { id: target.id, status: 'revoked' } })
}
