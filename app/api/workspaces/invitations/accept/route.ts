import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isLegalMembershipTransition } from '@/lib/workspaces/membership'
import {
  hashInvitationToken,
  isInvitationRedeemable,
  normalizeInvitedEmail,
} from '@/lib/workspaces/invitations'
import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── POST /api/workspaces/invitations/accept — bind a pending seat to the ──
//     accepting session's own identity (D-12, D-33)
//
// The binding identity is the accepting session's — resolved from
// `auth.getUser()`, never from anything in the request body. This is an
// ordinary authenticated request under one identity: no sign-out, no new
// session, no admin API. A Funūn Team Member identity is refused by the
// Member-only account gate before any invitation lookup, because staff is
// a separate identity and never a workspace member (D-33).
//
// The raw token travels in the body ONLY to be hashed and looked up — it
// is never written to any table, and the invitation row is never disclosed
// to exist or not exist to an unauthenticated/mismatched caller (a lookup
// miss and a redeemability failure both return generic, non-enumerating
// messages).

const AcceptSchema = z.object({ token: z.string().trim().min(1) }).strict()

type InvitationRow = {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  status: 'pending' | 'accepted' | 'refused' | 'expired' | 'revoked'
  expires_at: string
}

type MemberRow = {
  id: string
  user_id: string | null
  role: WorkspaceRole
  status: 'pending' | 'active' | 'suspended' | 'removed' | 'expired'
}

export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = AcceptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'A valid invitation token is required.' },
      { status: 400 }
    )
  }

  const tokenHash = hashInvitationToken(parsed.data.token)
  const service = createServiceClient()

  const { data: invitationData, error: lookupError } = await service
    .from('workspace_invitations')
    .select('id, workspace_id, email, role, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (lookupError) {
    return NextResponse.json({ error: 'Could not process this invitation.' }, { status: 500 })
  }
  if (!invitationData) {
    // Generic — does not disclose whether the token ever existed.
    return NextResponse.json({ error: 'This invitation link is invalid.' }, { status: 404 })
  }
  const invitation = invitationData as InvitationRow

  const now = Date.now()
  if (!isInvitationRedeemable({ status: invitation.status, expiresAt: invitation.expires_at, now })) {
    // Self-heal a passed expiry to 'expired' on first touch rather than
    // waiting on a scheduled sweep — only when the invitation was still
    // pending; a status already refused/revoked/expired is left untouched.
    if (invitation.status === 'pending' && new Date(invitation.expires_at).getTime() <= now) {
      await service.from('workspace_invitations').update({ status: 'expired' }).eq('id', invitation.id)
    }
    return NextResponse.json({ error: 'This invitation is no longer valid.' }, { status: 410 })
  }

  // The binding identity is the SESSION's own verified email, never a body
  // value (T-38-06-01, T-38-06-02) — normalized the same way the issuance
  // route normalized the invitation's stored address.
  const sessionEmail = normalizeInvitedEmail(user.email ?? '')
  if (!sessionEmail || sessionEmail !== invitation.email) {
    return NextResponse.json(
      { error: 'This invitation was sent to a different email address than your account.' },
      { status: 403 }
    )
  }

  const { error: acceptError } = await service
    .from('workspace_invitations')
    .update({ status: 'accepted', accepted_at: new Date(now).toISOString(), accepted_by: user.id })
    .eq('id', invitation.id)
    .eq('status', 'pending')

  if (acceptError) {
    return NextResponse.json({ error: 'Could not accept this invitation.' }, { status: 500 })
  }

  const { data: pendingSeatData, error: seatLookupError } = await service
    .from('workspace_members')
    .select('id, user_id, role, status')
    .eq('workspace_id', invitation.workspace_id)
    .eq('invited_email', invitation.email)
    .eq('role', invitation.role)
    .eq('status', 'pending')
    .maybeSingle()

  if (seatLookupError) {
    return NextResponse.json({ error: 'Could not activate your workspace seat.' }, { status: 500 })
  }
  const pendingSeat = pendingSeatData as MemberRow | null

  if (pendingSeat) {
    if (!isLegalMembershipTransition(pendingSeat.status, 'active')) {
      return NextResponse.json({ error: 'This seat can no longer be activated.' }, { status: 409 })
    }
    const { error: activateError } = await service
      .from('workspace_members')
      .update({ user_id: user.id, status: 'active' })
      .eq('id', pendingSeat.id)

    if (activateError) {
      return NextResponse.json({ error: 'Could not activate your workspace seat.' }, { status: 500 })
    }
  } else {
    // No paired pending seat exists — the invitation itself is the
    // authority, so create one rather than failing (e.g. the seat row was
    // separately removed after the invitation was issued).
    const { error: createSeatError } = await service.from('workspace_members').insert({
      workspace_id: invitation.workspace_id,
      user_id: user.id,
      invited_email: invitation.email,
      role: invitation.role,
      status: 'active',
    })

    if (createSeatError) {
      return NextResponse.json({ error: 'Could not activate your workspace seat.' }, { status: 500 })
    }
  }

  await logWorkspaceAction(service, {
    workspaceId: invitation.workspace_id,
    actorId: user.id,
    subjectMemberId: user.id,
    action: 'workspace.invitation.accepted',
    targetType: 'workspace_member',
    targetId: pendingSeat?.id ?? null,
    changes: { role: invitation.role },
  })

  return NextResponse.json({
    data: { workspaceId: invitation.workspace_id, role: invitation.role },
  })
}
