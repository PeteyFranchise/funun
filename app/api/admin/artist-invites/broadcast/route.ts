import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { artistReopenedEmail } from '@/lib/email/artistReopened'
import { sendEmail } from '@/lib/email'

// ─── POST /api/admin/artist-invites/broadcast — Leadership-only reopen ───
// (Phase 27, D-13b/D-15) A one-shot bulk send to every eligible waitlister.
// Leadership-ONLY (T-27-06 — the highest-blast-radius action in this
// phase; unlike create/convert, which are open to any staff per D-06).
// Eligible = unsubscribed_at IS NULL (D-19 — opted-out rows are excluded
// from the broadcast; their personal-invite path via convert/ is
// untouched) AND notified_reopen_at IS NULL (idempotency — RESEARCH
// Pitfall 6 / T-27-14). Each recipient's notified_reopen_at is stamped
// immediately after its send is attempted, so a retry or double-click
// never re-sends the same person (at-most-once semantics — accepted per
// RESEARCH over strict at-least-once for a bulk send).
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
  let sent = 0

  for (const row of eligible) {
    const actionLink = `${appUrl}/signup`
    const unsubscribeLink = `${appUrl}/unsubscribe?token=${row.unsubscribe_token}`
    const template = artistReopenedEmail({ actionLink, unsubscribeLink })

    // Best-effort — a single send failure must not abort the batch (mirrors
    // app/api/sync/register/route.ts's routeLead best-effort side-effect
    // pattern, scaled to a loop). The row is stamped regardless of send
    // outcome so a retry never re-attempts a recipient already processed.
    await sendEmail({ to: row.email, subject: template.subject, html: template.html, text: template.text })

    await service
      .from('artist_waitlist')
      .update({ notified_reopen_at: new Date().toISOString() })
      .eq('id', row.id)

    sent += 1
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'artist_invite.broadcast',
    targetType: 'artist_waitlist',
    changes: { count: sent },
  })

  return NextResponse.json({ sent })
}
