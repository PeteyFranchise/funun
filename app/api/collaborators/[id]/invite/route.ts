import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { sendCollaboratorInvite } from '@/lib/collaborators/invite'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  mustBlockActionBetween,
  mustBlockActionForEmail,
  BLOCKED_ACTION_ERROR,
  BLOCKED_ACTION_STATUS,
} from '@/lib/trust-safety/block-check'

// ─── POST /api/collaborators/[id]/invite ─────────────────────────────────
// Sends an educational IPI-invite email to the collaborator with a tokenized
// link to /signup?invite=[token]. Enforces a 60s cooldown per collaborator+
// inviting user pair to prevent duplicate emails (T-01-15, Pitfall 4).
//
// This route is a thin wrapper: it owns auth + ownership, then delegates the
// send mechanics (cooldown, token insert, email build/send) to the shared
// lib/collaborators/invite.ts helper (260825-i4i Task 1) — the same helper
// the quick-invite route uses, so there is exactly one invite implementation.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── 1. Auth gate ─────────────────────────────────────────────────────
  const supabase = await createApiClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const member = await requireMemberApiAccount(supabase, authUser)
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status })
  const { user } = member

  const { id } = await params

  // ── 2. Load collaborator — must be owned by the requesting user ──────
  // This ownership filter is what authorizes the token disclosure below:
  // the invite token is a signup capability, and it is only ever handed
  // back to the user who just proved they own this row.
  const { data: collaborator, error: collabError } = await supabase
    .from('collaborators')
    .select('id, user_id, name, email, claimed_by')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (collabError || !collaborator) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
  }

  // ── 2b. Block gate — before ANY branch that behaves differently ──────
  //
  // `alreadyMember: true` below is a membership disclosure, and on this route
  // it is a read, not a write: `claim_collaborators()` stamped `claimed_by` at
  // the member's signup, when no block could yet exist, and a block placed
  // afterwards was never applied to the stamped row. PR #96 gated every write
  // path; there is no write left here to gate.
  //
  // The gate covers BOTH branches on purpose. Gating only the claimed one
  // would leave claimed-and-blocked (a generic 400) distinguishable from
  // unclaimed-and-blocked (a 200 and a sent email) — which is the very
  // inference this closes. Checking the email first covers both with one
  // lookup, exactly as POST /api/collaborators does; the claimed_by check
  // behind it catches a row whose email was changed or cleared after the
  // claim, where the stamped account is the only remaining evidence.
  //
  // The refusal is the shared, block-state-agnostic BLOCKED_ACTION_ERROR used
  // by follows, connections, endorsements, wall posts, release comments,
  // quick-invite and POST /api/collaborators (13-03), so a block here looks
  // exactly like any other generic failure of the same action — and identical
  // to the refusal the sibling invite route already returns for this pair.
  const service = createServiceClient()
  const mustRefuse =
    (await mustBlockActionForEmail(service, user.id, collaborator.email)) ||
    (typeof collaborator.claimed_by === 'string' &&
      collaborator.claimed_by.length > 0 &&
      (await mustBlockActionBetween(service, user.id, collaborator.claimed_by)))

  if (mustRefuse) {
    return NextResponse.json({ error: BLOCKED_ACTION_ERROR }, { status: BLOCKED_ACTION_STATUS })
  }

  // claimed_by is populated only through verified account-email claiming.
  // Existing members need no signup capability and must not receive one.
  //
  // This still fires for an UNBLOCKED member, hidden or not. Whether a hidden
  // member's membership may be confirmed is Phase 41's D-01a, an open owner
  // decision, and nothing here settles it.
  if (collaborator.claimed_by) {
    return NextResponse.json({
      ok: true,
      alreadyMember: true,
      emailSent: false,
      skipped: true,
    })
  }

  // ── 3. Delegate to the shared invite mechanics ────────────────────────
  const result = await sendCollaboratorInvite(supabase, {
    collaborator: { id: collaborator.id, name: collaborator.name, email: collaborator.email },
    invitingUserId: user.id,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Token disclosed only to the owning user — the query above already
  // proved ownership before this response is built (same posture as
  // app/api/admin/staff/[id]/resend/route.ts's inviteLink return).
  return NextResponse.json({
    ok: true,
    emailSent: result.emailSent,
    ...(result.skipped ? { skipped: true } : {}),
    inviteLink: result.inviteLink,
  })
}
