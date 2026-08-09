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
//
// (27-CODEX-REVIEW.md follow-up review — MEDIUM) The original fix stamped
// converted_to_invite_at with a fire-and-forget UPDATE whose result was
// never checked, decided from a stale read of the row fetched at the top
// of this handler. Two concurrent first-time convert calls for the SAME
// row could both read converted_to_invite_at as null, both pass
// mintOrRotateInvite (migration 101 makes THAT half atomic — one gets
// 'created', the other 'reused'), and the 'reused' caller's duplicate
// check (`row.converted_to_invite_at && state === 'reused'`) was still
// false against its own stale read, so it sent anyway — double email. A
// first-time conversion now requires winning an atomic
// `UPDATE ... WHERE converted_to_invite_at IS NULL` claim BEFORE any mint/
// send work; losing that race is treated as already-converted (no email).
// A row that was already converted at some point in the past skips the
// claim entirely (H1's re-issue-on-expiry path still applies, decided by
// mintOrRotateInvite's own atomic state) and instead re-stamps with a
// checked, result-verified update right before the resend.
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

  let ownsFirstConversion = false

  if (!row.converted_to_invite_at) {
    // Atomic first-time claim BEFORE any mint/send work — a single
    // conditional UPDATE is one statement in Postgres, so two concurrent
    // first-time converts for the same row can no longer both pass a
    // stale read and both send. Checking the returned row (not just the
    // error) is what makes this a claim rather than a blind write.
    const claim = await service
      .from('artist_waitlist')
      .update({ converted_to_invite_at: new Date().toISOString() })
      .eq('id', id)
      .is('converted_to_invite_at', null)
      .select('id')
      .maybeSingle()

    if (claim.error) {
      return NextResponse.json({ error: 'Failed to record conversion.' }, { status: 500 })
    }
    if (!claim.data) {
      // Lost the claim race to a concurrent convert call for this same
      // row — treat as already-converted; no duplicate email.
      return NextResponse.json({ ok: true, data: { id, email: row.email }, duplicate: true })
    }
    ownsFirstConversion = true
  }

  // Shared mint/rotate/reuse claim (27-CODEX-REVIEW.md H1/B3, follow-up
  // review atomicity hardening via migration 101) — replaces the old
  // "converted_to_invite_at set => always duplicate" check, which could
  // never re-issue a PAST-EXPIRY invite for a row already converted once
  // (H1).
  const mint = await mintOrRotateInvite(service, {
    email: row.email,
    source: 'waitlist_conversion',
    invitedByUserId: auth.user.id,
  })

  if (!mint.ok) {
    return NextResponse.json({ error: mint.error }, { status: 500 })
  }

  // True duplicate only when this row was converted before (we did NOT
  // just win the first-time claim above) AND its invite is still active
  // (state 'reused') — nothing to (re)send. An expired previously-
  // converted invite instead falls through with state 'rotated' (H1 fix)
  // so it gets resent below.
  if (!ownsFirstConversion && mint.state === 'reused') {
    return NextResponse.json({
      ok: true,
      data: { id: mint.id, email: row.email },
      duplicate: true,
    })
  }

  if (!ownsFirstConversion) {
    // Re-issue path (H1) — this row was already converted before, but the
    // invite has since been rotated/recreated. Re-stamp
    // converted_to_invite_at to reflect the most recent send, checking the
    // write's result (previously ignored) rather than firing-and-forgetting
    // it. Not a CAS: this row is legitimately expected to already have a
    // non-null converted_to_invite_at at this point.
    const restamp = await service
      .from('artist_waitlist')
      .update({ converted_to_invite_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (restamp.error || !restamp.data) {
      return NextResponse.json({ error: 'Failed to record conversion.' }, { status: 500 })
    }
  }

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
