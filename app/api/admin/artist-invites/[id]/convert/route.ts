import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
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
// the requireStaff() gate passes.
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

  // Idempotency guard — an already-converted row is not converted twice.
  if (row.converted_to_invite_at) {
    const { data: existingInvite } = await service
      .from('artist_invites')
      .select('id')
      .ilike('email', row.email)
      .eq('source', 'waitlist_conversion')
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      data: { id: (existingInvite as { id: string } | null)?.id ?? null, email: row.email },
      duplicate: true,
    })
  }

  const inviteToken = generateApprovalToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

  const { data: inserted, error: insertError } = await service
    .from('artist_invites')
    .insert({
      email: row.email,
      status: 'pending',
      source: 'waitlist_conversion',
      invite_token: inviteToken,
      token_expires_at: expiresAt.toISOString(),
      invited_by_user_id: auth.user.id,
    })
    .select('id')
    .maybeSingle()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create invite.' }, { status: 500 })
  }

  await service
    .from('artist_waitlist')
    .update({ converted_to_invite_at: new Date().toISOString() })
    .eq('id', id)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const actionLink = `${appUrl}/signup?invite=${inviteToken}`
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
    { ok: true, data: { id: (inserted as { id: string }).id, email: row.email }, emailSent: emailResult.ok },
    { status: 201 }
  )
}
