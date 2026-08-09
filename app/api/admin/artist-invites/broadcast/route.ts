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
// tracked SEPARATELY (M5): notified_reopen_at is stamped ONLY after a
// successful send, so a mint or send failure leaves the row untouched and
// retryable on the next broadcast run — never silently marked delivered.
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
    // Mint/reuse/rotate this recipient's own authorizing invite BEFORE
    // sending (B3) — a mint failure is recorded as failed and the row is
    // left untouched (stays eligible for retry), never stamped.
    const mint = await mintOrRotateInvite(service, {
      email: row.email,
      source: 'staff',
      invitedByUserId: auth.user.id,
    })

    if (!mint.ok) {
      failed += 1
      continue
    }

    const actionLink = `${appUrl}/signup?invite=${mint.token}`
    const unsubscribeLink = `${appUrl}/unsubscribe?token=${row.unsubscribe_token}`
    const template = artistReopenedEmail({ actionLink, unsubscribeLink })

    const sendResult = await sendEmail({ to: row.email, subject: template.subject, html: template.html, text: template.text })

    if (!sendResult.ok) {
      // Send failed — leave notified_reopen_at unset (M5: a send failure
      // must stay retryable, never silently marked delivered).
      failed += 1
      continue
    }

    await service
      .from('artist_waitlist')
      .update({ notified_reopen_at: new Date().toISOString() })
      .eq('id', row.id)

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
