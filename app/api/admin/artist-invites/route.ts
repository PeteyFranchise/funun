import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { mintOrRotateInvite } from '@/lib/invites/mintInvite'
import { artistInviteEmail } from '@/lib/email/artistInvite'
import { sendEmail } from '@/lib/email'

// ─── GET+POST /api/admin/artist-invites — Team Console list + issue ──────
// (Phase 27, D-06/D-07/D-14) Both handlers are open to ANY staff role —
// individual artist invites are low-risk (an invite only authorizes an
// email; the artist still self-serves, D-01) and unlimited (D-07, no
// per-inviter cap). Contrast with the Leadership-only reopen broadcast
// (./broadcast/route.ts, D-15) — T-27-06's privilege split lives across
// these two files, not within this one. createServiceClient() is only ever
// reached AFTER the requireStaff() gate passes (service-role-only tables,
// migration 097).

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_MAX_LENGTH = 120

const WAITLIST_COLUMNS =
  'id, email, name, note, unsubscribed_at, notified_reopen_at, converted_to_invite_at, created_at'
const INVITE_COLUMNS = 'id, email, status, source, invited_by_user_id, accepted_at, created_at'

// ─── GET — list waitlist + invites (any staff) ────────────────────────────
export async function GET() {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()

  const [{ data: waitlist, error: waitlistError }, { data: invites, error: invitesError }] =
    await Promise.all([
      service.from('artist_waitlist').select(WAITLIST_COLUMNS).order('created_at', { ascending: false }),
      service.from('artist_invites').select(INVITE_COLUMNS).order('created_at', { ascending: false }),
    ])

  if (waitlistError) return NextResponse.json({ error: waitlistError.message }, { status: 500 })
  if (invitesError) return NextResponse.json({ error: invitesError.message }, { status: 500 })

  return NextResponse.json({ waitlist: waitlist ?? [], invites: invites ?? [] })
}

// Best-effort display-name resolve for the "Invited by [name]" email line —
// staff have no user_profiles.artist_name row (that's the artist-side
// lookup used by /api/signup/invite/[token]); staff display names live in
// funun_staff instead. Never thrown — pure UX framing, not security-relevant.
async function resolveStaffDisplayName(service: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await service.from('funun_staff').select('display_name').eq('user_id', userId).maybeSingle()
    const name = (data as { display_name: string | null } | null)?.display_name ?? null
    return name && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

// ─── POST — issue a direct invite by email (any staff) ───────────────────
// source='staff', tokened, mails template A, audited. Uses the shared
// mintOrRotateInvite() claim (27-CODEX-REVIEW.md H1/B3): an already-active
// pending invite for the same email is idempotent — no second row, no
// resend (state === 'reused'). A PAST-EXPIRY pending invite is rotated in
// place and resent instead of being reported as a stale duplicate (H1 fix
// — was previously indistinguishable from an active duplicate).
export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if (name.length > NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `Artist name must be ${NAME_MAX_LENGTH} characters or fewer.` }, { status: 400 })
  }

  const service = createServiceClient()

  const mint = await mintOrRotateInvite(service, { email, source: 'staff', invitedByUserId: auth.user.id })
  if (!mint.ok) {
    return NextResponse.json({ error: mint.error }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const actionLink = `${appUrl}/signup?invite=${mint.token}`

  if (mint.state === 'reused') {
    return NextResponse.json({
      ok: true,
      data: { id: mint.id, email },
      duplicate: true,
      inviteLink: actionLink,
    })
  }

  const inviterName = await resolveStaffDisplayName(service, auth.user.id)

  const template = artistInviteEmail({ inviteeName: name || null, inviterName, actionLink })
  // Best-effort — a send failure never blocks issuing the invite itself,
  // mirroring app/api/collaborators/[id]/invite/route.ts's convention.
  const emailResult = await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: mint.state === 'rotated' ? 'artist_invite.reissue' : 'artist_invite.create',
    targetType: 'artist_invite',
    targetId: mint.id,
    changes: { email, ...(name ? { name } : {}) },
  })

  return NextResponse.json(
    { ok: true, data: { id: mint.id, email }, emailSent: emailResult.ok, inviteLink: actionLink },
    { status: 201 }
  )
}
