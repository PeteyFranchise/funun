import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
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
// Pitfall 6 / T-27-14; notified_reopen_at is the FINAL confirmed-delivered
// marker, see the claim-lease section below).
//
// (27-CODEX-REVIEW.md B3/M5) A bare /signup link is not enough — the
// signup gate (migration 099) only admits emails with an authorizing
// artist_invites row. Each recipient's own invite is minted/reused/rotated
// via the shared mintOrRotateInvite() claim (same helper the admin
// issue-invite and convert routes use) BEFORE the send, so the link is one
// the recipient is actually authorized to use.
//
// (27-CODEX-REVIEW.md follow-up review #1 — B3/M5 hardening) The original
// fix selected eligible rows, then stamped notified_reopen_at AFTER a
// successful send — not an atomic claim. Two overlapping broadcast runs
// could both select the SAME unnotified row and both mint+email it before
// either stamp landed. Fixed by atomically claiming each row (stamping
// notified_reopen_at itself) BEFORE any mint/send work.
//
// (27-CODEX-REVIEW.md follow-up review #2 MEDIUM — this fix) Using
// notified_reopen_at as BOTH the in-progress claim AND the final delivered
// marker is not durable against a process dying mid-send: the claim lands,
// the process never reaches the reset-on-failure code, and the row is
// stuck permanently "notified" with nothing ever delivered. Migration 102
// splits the two roles apart:
//   - claim_token/claimed_at (migration 102) — a PER-ATTEMPT lease. Claimed
//     with a fresh random token before any mint/send work; the claim UPDATE
//     is conditioned on the row being unclaimed OR its lease having expired
//     (CLAIM_LEASE_MS below), so an abandoned claim from a dead process is
//     reclaimable by a LATER run instead of blocking the recipient forever.
//   - notified_reopen_at — now stamped ONLY after a CONFIRMED send success,
//     via a compare-and-set on this attempt's own claim_token (so a stale/
//     superseded claim — e.g. one whose lease already expired and was
//     reclaimed by another run — can never finalize a delivery it no longer
//     owns).
// On any failure (mint or send), the claim is explicitly RELEASED
// (claim_token/claimed_at cleared) via the same claim_token compare-and-set,
// and the reset's result is checked rather than fired-and-forgotten.
//
// A STABLE, per-recipient Resend Idempotency-Key (`artist-reopen-{waitlist
// row id}-{day}`) is attached to every send. An ambiguous provider timeout
// (the request may have been accepted by Resend even though this process
// never saw the response, or died before it could) plus a later retry with
// the row's claim released reuses the SAME key for the SAME calendar day —
// Resend returns its cached result instead of dispatching a second email.
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
  // Claim lease — long enough to cover a normal mint+send round trip, short
  // enough that a claim orphaned by a dead process (or a lost response) is
  // reclaimable well within the same business day rather than blocking the
  // recipient indefinitely.
  const CLAIM_LEASE_MS = 10 * 60 * 1000
  // Day-scoped idempotency epoch — see header comment. Shared by every
  // recipient claimed in this run; a genuinely NEW reopen campaign the next
  // day gets a fresh key per recipient rather than being deduped forever.
  const reopenEpoch = new Date().toISOString().slice(0, 10)
  let delivered = 0
  let failed = 0

  for (const row of eligible) {
    const claimToken = randomUUID()
    const claimedAt = new Date()
    const leaseExpiredBefore = new Date(claimedAt.getTime() - CLAIM_LEASE_MS).toISOString()

    // Atomically CLAIM this recipient's lease BEFORE any mint/send work — a
    // single conditional UPDATE is one statement in Postgres, so an
    // overlapping broadcast run (or a retry racing this one) cannot also
    // claim the same row while our lease is live. Checking the returned row
    // (not just the error) is what makes this a claim rather than a blind
    // write: no row back means someone else currently owns an unexpired
    // lease on it.
    const claim = await service
      .from('artist_waitlist')
      .update({ claim_token: claimToken, claimed_at: claimedAt.toISOString() })
      .eq('id', row.id)
      .is('notified_reopen_at', null)
      .or(`claimed_at.is.null,claimed_at.lt.${leaseExpiredBefore}`)
      .select('id')
      .maybeSingle()

    if (claim.error) {
      failed += 1
      continue
    }
    if (!claim.data) {
      // Lost the claim race to a concurrent run (or its lease hasn't
      // expired yet) — not this request's row to send; don't double-count
      // it as failed, whoever holds the live lease is responsible for it.
      continue
    }

    // Mint/reuse/rotate this recipient's own authorizing invite now that we
    // own the claim (B3).
    const mint = await mintOrRotateInvite(service, {
      email: row.email,
      source: 'staff',
      invitedByUserId: auth.user.id,
    })

    if (!mint.ok) {
      // RELEASE the claim (compare-and-set on our own claim_token) so the
      // row stays retryable on the next run instead of being stuck
      // permanently leased with nothing sent. The CAS result is checked but
      // not further escalated on mismatch — if it no longer matches, our
      // lease already expired and another run has since reclaimed the row,
      // which is that run's responsibility now, not an error condition here.
      await service
        .from('artist_waitlist')
        .update({ claim_token: null, claimed_at: null })
        .eq('id', row.id)
        .eq('claim_token', claimToken)
        .select('id')
        .maybeSingle()
      failed += 1
      continue
    }

    const actionLink = `${appUrl}/signup?invite=${mint.token}`
    const unsubscribeLink = `${appUrl}/unsubscribe?token=${row.unsubscribe_token}`
    const template = artistReopenedEmail({ actionLink, unsubscribeLink })

    const sendResult = await sendEmail({
      to: row.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey: `artist-reopen-${row.id}-${reopenEpoch}`,
    })

    if (!sendResult.ok) {
      // Send failed — release the claim the same way a mint failure does
      // (M5: a send failure must stay retryable, never silently marked
      // delivered nor left permanently leased).
      await service
        .from('artist_waitlist')
        .update({ claim_token: null, claimed_at: null })
        .eq('id', row.id)
        .eq('claim_token', claimToken)
        .select('id')
        .maybeSingle()
      failed += 1
      continue
    }

    // Confirmed send — finalize: stamp the FINAL delivered marker and clear
    // the lease, still compare-and-set on our own claim_token. Only count
    // this as delivered when the CAS actually lands (we still owned the
    // row's lease at commit time) — the idempotency key above is what keeps
    // the recipient safe from a double email in the narrow window where
    // that CAS could lose to a lease that expired mid-send and was
    // reclaimed by another run.
    const finalize = await service
      .from('artist_waitlist')
      .update({ notified_reopen_at: new Date().toISOString(), claim_token: null, claimed_at: null })
      .eq('id', row.id)
      .eq('claim_token', claimToken)
      .select('id')
      .maybeSingle()

    if (finalize.error || !finalize.data) {
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
