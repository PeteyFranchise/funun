import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { artistReopenedEmail } from '@/lib/email/artistReopened'
import { sendEmail } from '@/lib/email'

// ─── POST /api/admin/artist-invites/broadcast — Leadership-only reopen ───
// (Phase 27, D-13b/D-15) A one-shot bulk send to every eligible waitlister.
// Leadership-ONLY (T-27-06 — the highest-blast-radius action in this
// phase; unlike create/convert, which are open to any staff per D-06).
// Eligible = unsubscribed_at IS NULL (D-19 — opted-out rows are excluded
// from the broadcast; their personal-invite path via convert/ is
// untouched) AND notified_reopen_at IS NULL (idempotency — RESEARCH
// Pitfall 6 / T-27-14).
//
// (27-CODEX-REVIEW.md B3/M5) A bare /signup link is not enough — the
// signup gate (migration 099) only admits emails with an authorizing
// artist_invites row. Each recipient's own invite is minted/reused/rotated
// via the shared mintOrRotateInvite() claim (same helper the admin
// issue-invite and convert routes use) BEFORE the send, so the link is one
// the recipient is actually authorized to use. delivered/failed are
// tracked SEPARATELY (M5).
//
// (27-CODEX-REVIEW.md follow-up review — B3/M5 hardening) The original fix
// selected eligible rows, then stamped notified_reopen_at AFTER a
// successful send — not an atomic claim. Two overlapping broadcast runs
// (a retry racing a still-in-flight leadership click, or two leadership
// members triggering it near-simultaneously) could both select the SAME
// unnotified row and both mint+email it before either stamp landed,
// double-sending. Each row is now atomically CLAIMED (notified_reopen_at
// stamped) BEFORE any mint/send work, via a single conditional
// `UPDATE ... WHERE notified_reopen_at IS NULL` — Postgres executes that
// as one statement, so only one concurrent caller can ever win the claim
// for a given row. A mint or send failure RESETS the claim (sets
// notified_reopen_at back to NULL) so the row stays retryable on the next
// run instead of being silently marked delivered or permanently stuck.
export async function POST() {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()

  const { data: rows, error } = await service
    .from('artist_waitlist')
    .select('id, email, unsubscribe_token')
    .is('unsubscribed_at', null)
    .is('notified_reopen_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const eligible = (rows ?? []) as { id: string; email: string; unsubscribe_token: string }[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let delivered = 0
  let failed = 0

  for (const row of eligible) {
    // Atomically CLAIM this recipient BEFORE any mint/send work — the
    // claim IS the stamp. A single conditional UPDATE is one statement in
    // Postgres, so an overlapping broadcast run (or a retry racing this
    // one) cannot also claim the same row (follow-up review B3/M5
    // hardening). Checking the returned row (not just the error) is what
    // makes this a claim rather than a blind write: no row back means
    // someone else already owns it.
    const claim = await service
      .from('artist_waitlist')
      .update({ notified_reopen_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('notified_reopen_at', null)
      .select('id')
      .maybeSingle()

    if (claim.error) {
      failed += 1
      continue
    }
    if (!claim.data) {
      // Lost the claim race to a concurrent broadcast run — not this
      // request's row to send; don't double-count it as failed, the
      // request that won the claim is responsible for its outcome.
      continue
    }

    // Mint/reuse/rotate this recipient's own authorizing invite now that
    // we own the claim (B3).
    const mint = await mintOrRotateInvite(service, {
      email: row.email,
      source: 'staff',
      invitedByUserId: auth.user.id,
    })

    if (!mint.ok) {
      // Reset the claim so the row stays retryable on the next run
      // instead of being stuck permanently "notified" with nothing sent.
      await service.from('artist_waitlist').update({ notified_reopen_at: null }).eq('id', row.id)
      failed += 1
      continue
    }

    const actionLink = `${appUrl}/signup?invite=${mint.token}`
    const unsubscribeLink = `${appUrl}/unsubscribe?token=${row.unsubscribe_token}`
    const template = artistReopenedEmail({ actionLink, unsubscribeLink })

    const sendResult = await sendEmail({ to: row.email, subject: template.subject, html: template.html, text: template.text })

    if (!sendResult.ok) {
      // Send failed — reset the claim (M5: a send failure must stay
      // retryable, never silently marked delivered).
      await service.from('artist_waitlist').update({ notified_reopen_at: null }).eq('id', row.id)
      failed += 1
      continue
    }

    delivered += 1
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'artist_invite.broadcast',
    targetType: 'artist_waitlist',
    changes: { delivered, failed },
  })

  return NextResponse.json({ delivered, failed })
}
