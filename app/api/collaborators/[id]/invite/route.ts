import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { sendCollaboratorInvite } from '@/lib/collaborators/invite'

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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // ── 2. Load collaborator — must be owned by the requesting user ──────
  // This ownership filter is what authorizes the token disclosure below:
  // the invite token is a signup capability, and it is only ever handed
  // back to the user who just proved they own this row.
  const { data: collaborator, error: collabError } = await supabase
    .from('collaborators')
    .select('id, user_id, name, email')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (collabError || !collaborator) {
    return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 })
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
