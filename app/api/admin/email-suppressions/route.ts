import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStaff } from '@/lib/admin/gate'
import { normalizeEmailAddress } from '@/lib/email/suppression'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logStaffAction } from '@/lib/staff/audit'
import { createServiceClient } from '@/lib/supabase/server'

const BodySchema = z.object({ email: z.string().trim().min(3).max(320) }).strict()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── DELETE /api/admin/email-suppressions ──────────────────────────────────
// Removes ONE address from public.email_suppressions (GH #190), so sendEmail()
// delivers to it again. This is the only supported way back from a suppression:
// the table is service-role only, so there is no other path.
//
// Leadership-only: re-enabling mail to an address that hard-bounced or
// complained costs sender reputation, so it is not open to every staff role.
// Rate limited and fail-closed like the other leadership write routes.
//
// The address travels in the JSON body, not the URL, so it stays out of access
// logs. The audit entry records THAT an address was removed but not which one
// (third-party PII); the row's own history is the suppression it replaced.
export async function DELETE(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (
    await checkRateLimit(`email-suppression-remove:${auth.user.id}`, {
      windowMs: 60_000,
      maxAttempts: 20,
      failClosed: true,
    })
  ) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 })
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'An email address is required.' }, { status: 400 })
  }

  // Same normalization sendEmail() and the Resend webhook use, so "Name <A@B.c>"
  // and " A@B.C " both land on the stored row.
  const email = normalizeEmailAddress(parsed.data.email)
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('email_suppressions')
    .delete()
    .eq('email', email)
    .select('email')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'That address is not suppressed.' }, { status: 404 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'email_suppression.remove',
    targetType: 'email_suppression',
    changes: { removed: 1 },
  })

  return NextResponse.json({ ok: true })
}
