import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, type StaffRole } from '@/lib/admin/gate'
import { staffInviteEmail } from '@/lib/email/staffInvite'
import { sendEmail } from '@/lib/email'
import { logStaffAction } from '@/lib/staff/audit'

// Team management is leadership + TMS (people ops).
const MANAGE_ROLES: StaffRole[] = ['leadership', 'tms']

// ─── POST /api/admin/staff/[id]/resend — re-send a member's invite ──────────
// Leadership + TMS. Generates a fresh magic link and re-sends the staff invite
// email. Best-effort delivery (surfaced via emailSent), audited unconditionally.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireStaff(MANAGE_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  const { data: userData } = await service.auth.admin.getUserById(id)
  const email = userData?.user?.email
  if (!email) return NextResponse.json({ error: 'Team member not found.' }, { status: 404 })

  const { data: staff } = await service
    .from('funun_staff')
    .select('display_name')
    .eq('user_id', id)
    .maybeSingle()
  const displayName =
    (staff as { display_name?: string } | null)?.display_name ??
    (userData?.user?.user_metadata?.display_name as string | undefined) ??
    email

  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr || !link?.properties?.action_link) {
    return NextResponse.json(
      { error: linkErr?.message ?? 'Could not generate an invite link.' },
      { status: 500 }
    )
  }

  const { subject, html, text } = staffInviteEmail({ displayName, actionLink: link.properties.action_link })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html, text })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'resend_staff_invite',
    targetType: 'funun_staff',
    targetId: id,
    changes: {},
  })

  // Return the fresh sign-in link so leadership/TMS can copy + hand it to the
  // member directly when email delivery is down (resilience). This endpoint is
  // already gated to MANAGE_ROLES, so only authorized managers receive it.
  return NextResponse.json({ data: { emailSent, inviteLink: link.properties.action_link } })
}
