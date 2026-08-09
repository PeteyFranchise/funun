import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { generateApprovalToken, APPROVAL_TOKEN_EXPIRY_DAYS } from '@/lib/split-sheets/approval'
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
// source='staff', tokened, mails template A, audited. Duplicate pending
// invite for the same email is idempotent — no second row is created.
export async function POST(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const service = createServiceClient()

  // Idempotency guard — an already-pending invite for this email is
  // returned as-is rather than duplicated.
  const { data: existing } = await service
    .from('artist_invites')
    .select('id')
    .ilike('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, data: { id: (existing as { id: string }).id, email }, duplicate: true })
  }

  const inviteToken = generateApprovalToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + APPROVAL_TOKEN_EXPIRY_DAYS)

  const { data: inserted, error: insertError } = await service
    .from('artist_invites')
    .insert({
      email,
      status: 'pending',
      source: 'staff',
      invite_token: inviteToken,
      token_expires_at: expiresAt.toISOString(),
      invited_by_user_id: auth.user.id,
    })
    .select('id')
    .maybeSingle()

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create invite.' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const actionLink = `${appUrl}/signup?invite=${inviteToken}`
  const inviterName = await resolveStaffDisplayName(service, auth.user.id)

  const template = artistInviteEmail({ inviterName, actionLink })
  // Best-effort — a send failure never blocks issuing the invite itself,
  // mirroring app/api/collaborators/[id]/invite/route.ts's convention.
  const emailResult = await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'artist_invite.create',
    targetType: 'artist_invite',
    targetId: (inserted as { id: string }).id,
    changes: { email },
  })

  return NextResponse.json(
    { ok: true, data: { id: (inserted as { id: string }).id, email }, emailSent: emailResult.ok },
    { status: 201 }
  )
}
