import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { artistSpotOpenedEmail } from '@/lib/email/artistSpotOpened'
import { sendEmail } from '@/lib/email'

// ─── POST /api/admin/artist-invites/[id]/convert — waitlist → invite ─────
// (Phase 27, D-13a) Any staff role (D-06) converts a single artist_waitlist
// row into a tokened artist_invites row (source='waitlist_conversion') and
// sends the "spot opened" email (template B). Sends EVEN IF the row is
// unsubscribed — D-19: a Team-Member conversion is a personal,
// transactional/relationship-based send, distinct from the bulk reopen
// broadcast (template C, ../broadcast/route.ts), which is the only send
// unsubscribe suppresses. createServiceClient() is only ever reached AFTER
// the requireStaff() gate passes. Invite claim/rotation goes through the
// shared mintOrRotateInvite() (27-CODEX-REVIEW.md H1) so a previously-
// converted row whose invite has since expired can be re-issued rather
// than reported as a stale duplicate.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: waitlistRow, error: waitlistError } = await service
    .from('artist_waitlist')
    .select('id, email, converted_to_invite_at')
    .eq('id', id)
    .maybeSingle()

  if (waitlistError || !waitlistRow) {
    return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 })
  }

  const row = waitlistRow as { id: string; email: string; converted_to_invite_at: string | null }

  // Shared mint/rotate/reuse claim (27-CODEX-REVIEW.md H1/B3) — replaces
  // the old "converted_to_invite_at set => always duplicate" check, which
  // could never re-issue a PAST-EXPIRY invite for a row already converted
  // once (H1).
  const mint = await mintOrRotateInvite(service, {
    email: row.email,
    source: 'waitlist_conversion',
    invitedByUserId: auth.user.id,
  })

  if (!mint.ok) {
    return NextResponse.json({ error: mint.error }, { status: 500 })
  }

  // True duplicate only when this row was already converted AND its invite
  // is still active (state 'reused') — nothing to (re)send. An expired
  // previously-converted invite instead falls through with state 'rotated'
  // (H1 fix) so it gets resent below.
  if (row.converted_to_invite_at && mint.state === 'reused') {
    return NextResponse.json({
      ok: true,
      data: { id: mint.id, email: row.email },
      duplicate: true,
    })
  }

  await service
    .from('artist_waitlist')
    .update({ converted_to_invite_at: new Date().toISOString() })
    .eq('id', id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const actionLink = `${appUrl}/signup?invite=${mint.token}`
  const template = artistSpotOpenedEmail({ actionLink })
  // Best-effort — sent EVEN IF the row is unsubscribed (D-19). Unsubscribe
  // is broadcast-scoped only; this route never reads unsubscribed_at.
  const emailResult = await sendEmail({ to: row.email, subject: template.subject, html: template.html, text: template.text })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'artist_invite.convert',
    targetType: 'artist_waitlist',
    targetId: id,
    changes: { email: row.email },
  })

  return NextResponse.json(
    { ok: true, data: { id: mint.id, email: row.email }, emailSent: emailResult.ok },
    { status: 201 }
  )
}
