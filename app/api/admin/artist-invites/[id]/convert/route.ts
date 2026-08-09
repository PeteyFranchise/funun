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
// (27-CODEX-REVIEW.md follow-up review #1 — MEDIUM) The original fix
// stamped converted_to_invite_at with a fire-and-forget UPDATE whose result
// was never checked, decided from a stale read of the row fetched at the
// top of this handler. Two concurrent first-time convert calls for the SAME
// row could both read converted_to_invite_at as null, both pass
// mintOrRotateInvite (migration 101 makes THAT half atomic — one gets
// 'created', the other 'reused'), and the 'reused' caller's duplicate
// check (`row.converted_to_invite_at && state === 'reused'`) was still
// false against its own stale read, so it sent anyway — double email. A
// first-time conversion now requires winning an atomic
// `UPDATE ... WHERE converted_to_invite_at IS NULL` claim BEFORE any mint/
// send work; losing that race is treated as already-converted (no email).
//
// (27-CODEX-REVIEW.md follow-up review #2 MEDIUM — this fix) The follow-up
// #1 fix's duplicate check (`!ownsFirstConversion && mint.state ===
// 'reused'`) was keyed on converted_to_invite_at/mint state alone, not on
// whether an email had actually, confirmedly gone out. If the WINNING
// caller's process died (or its response was lost) after
// mintOrRotateInvite() committed but before sendEmail() ran, a later retry
// reads converted_to_invite_at as already set, mintOrRotateInvite()
// correctly returns the SAME still-active invite (state: 'reused'), and the
// old check fired on that combination alone — reporting duplicate:true and
// silently never sending, even though no email had ever been delivered.
// Migration 102's invite_email_sent_at is a marker DISTINCT from
// converted_to_invite_at, stamped only after a confirmed sendEmail()
// success; duplicate-suppression below is now keyed on THAT column, so a
// retry after a lost mint response correctly falls through and (re)sends
// using the reused invite instead of reporting a silent duplicate. A mint
// failure also now RELEASES the first-time claim (compare-and-set on the
// exact timestamp this request wrote) so a retry re-attempts a first-time
// conversion instead of forever treating the row as already-claimed.
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
    .select('id, email, converted_to_invite_at, invite_email_sent_at')
    .eq('id', id)
    .maybeSingle()

  if (waitlistError || !waitlistRow) {
    return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 })
  }

  const row = waitlistRow as {
    id: string
    email: string
    converted_to_invite_at: string | null
    invite_email_sent_at: string | null
  }

  let ownsFirstConversion = false
  let firstClaimStamp: string | null = null

  if (!row.converted_to_invite_at) {
    // Atomic first-time claim BEFORE any mint/send work — a single
    // conditional UPDATE is one statement in Postgres, so two concurrent
    // first-time converts for the same row can no longer both pass a
    // stale read and both send. Checking the returned row (not just the
    // error) is what makes this a claim rather than a blind write.
    firstClaimStamp = new Date().toISOString()
    const claim = await service
      .from('artist_waitlist')
      .update({ converted_to_invite_at: firstClaimStamp })
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
    if (ownsFirstConversion && firstClaimStamp) {
      // RELEASE the first-time claim (compare-and-set on the exact
      // timestamp this request wrote — nothing else can have touched
      // converted_to_invite_at while we held it, since a concurrent caller
      // that lost the claim race above never reaches a write to this
      // column) so a retry re-attempts a genuine first-time conversion
      // instead of finding a permanently "already converted" row with
      // nothing ever minted or sent.
      await service
        .from('artist_waitlist')
        .update({ converted_to_invite_at: null })
        .eq('id', id)
        .eq('converted_to_invite_at', firstClaimStamp)
        .select('id')
        .maybeSingle()
    }
    return NextResponse.json({ error: mint.error }, { status: 500 })
  }

  // Duplicate-suppression is keyed on invite_email_sent_at — a marker
  // DISTINCT from converted_to_invite_at, stamped only after a CONFIRMED
  // sendEmail() success (see header comment, follow-up review #2). A
  // first-time conversion (ownsFirstConversion) never has a prior
  // invite_email_sent_at and always proceeds to send. A row that was
  // already converted before is a true duplicate only when its invite is
  // STILL active (state 'reused') AND a previous attempt actually,
  // confirmedly sent the email — a lost-response retry (invite reused, but
  // invite_email_sent_at still null because nothing was ever confirmed
  // sent) correctly falls through to (re)send instead. An expired
  // previously-converted invite always falls through with state 'rotated'
  // (H1 fix) regardless of invite_email_sent_at, since the link itself has
  // changed and must be resent.
  const alreadyConfirmedSent = Boolean(row.invite_email_sent_at)
  if (!ownsFirstConversion && mint.state === 'reused' && alreadyConfirmedSent) {
    return NextResponse.json({
      ok: true,
      data: { id: mint.id, email: row.email },
      duplicate: true,
    })
  }

  if (!ownsFirstConversion) {
    // Re-issue path (H1) — this row was already converted before, but is
    // now about to (re)send: either the invite was rotated/recreated, or a
    // previous attempt never confirmed a send. Re-stamp
    // converted_to_invite_at to reflect the most recent attempt, checking
    // the write's result (previously ignored) rather than
    // firing-and-forgetting it. Not a CAS: this row is legitimately
    // expected to already have a non-null converted_to_invite_at at this
    // point.
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
  // is broadcast-scoped only; this route never reads unsubscribed_at. A
  // stable idempotency key, keyed on this row + the EXACT invite token
  // being sent, protects an ambiguous-timeout retry from double-sending the
  // same link (a rotated/re-minted token naturally gets a fresh key, since
  // that is genuinely different content).
  const emailResult = await sendEmail({
    to: row.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `artist-convert-${id}-${mint.token}`,
  })

  if (emailResult.ok) {
    // Confirmed-sent marker (follow-up review #2) — best-effort, not
    // gating the response: the email has already, genuinely gone out by
    // this point, so a failure to persist this marker should never turn a
    // successful send into a 500. Worst case on a failed write here is a
    // future retry re-sending (safe, and further guarded by the
    // idempotency key above), never a silent skip.
    await service.from('artist_waitlist').update({ invite_email_sent_at: new Date().toISOString() }).eq('id', id)
  }

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
