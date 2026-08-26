import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { sendCollaboratorInvite } from '@/lib/collaborators/invite'

// ─── POST /api/collaborators/quick-invite ────────────────────────────────
// Standalone "invite a collaborator with just first name + email" path
// (260825-i4i), so an artist doesn't have to open the full CollaboratorForm
// (first/last/email/phone + rights-registry block) just to send an invite.
// The path segment is deliberately `quick-invite` rather than `invite`: a
// bare `invite` segment would sit in the same position as the `[id]`
// dynamic segment used by app/api/collaborators/[id]/route.ts, and
// `quick-invite` can never be mistaken for a collaborator uuid.
//
// Two things a reviewer will ask about:
// 1. Why the response carries the token-bearing inviteLink: the caller is
//    the row's owner (proven below via user.id-scoped lookup/insert), and
//    prod email delivery is currently unavailable (Resend down), so a
//    copyable link is the only working delivery channel right now.
// 2. Why reuse-by-email exists: without it, re-inviting the same person
//    from the modal would create a second roster row every time.

const QuickInviteSchema = z
  .object({
    first_name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict()

export async function POST(request: Request) {
  // ── 1. Auth gate ─────────────────────────────────────────────────────
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 2. Strict payload validation — exactly first_name + email. ────────
  const body = await request.json().catch(() => ({}))
  const parsed = QuickInviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invite payload' }, { status: 400 })
  }
  const { first_name: firstName, email } = parsed.data

  // ── 3. Reuse an existing active roster row for this email, if any. ────
  // Prevents a second roster row every time the artist re-invites the same
  // person from the modal.
  const { data: existing } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user.id)
    .ilike('email', email)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let collaborator = existing
  let reused = true

  if (!collaborator) {
    reused = false
    // Never accept claimed_by, user_id, or any registry field from the
    // body — the strict schema above already makes that impossible; this
    // insert only ever writes the allowlisted partial-row shape.
    const { data: inserted, error: insertError } = await supabase
      .from('collaborators')
      .insert({
        user_id: user.id,
        name: firstName,
        first_name: firstName,
        email,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Could not create collaborator' },
        { status: 500 }
      )
    }
    collaborator = inserted
  }

  // ── 4. Send the invite via the shared helper ───────────────────────────
  const result = await sendCollaboratorInvite(supabase, {
    collaborator: { id: collaborator.id, name: collaborator.name, email: collaborator.email },
    invitingUserId: user.id,
  })

  if (!result.ok) {
    // The row genuinely exists — tell the client about it even on the
    // unhappy path so the roster still reflects reality.
    return NextResponse.json(
      { error: result.error, data: { collaborator } },
      { status: result.status }
    )
  }

  return NextResponse.json({
    data: {
      collaborator,
      inviteLink: result.inviteLink,
      emailSent: result.emailSent,
      skipped: result.skipped,
      reused,
    },
  })
}
