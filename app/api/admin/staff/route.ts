import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, type StaffRole } from '@/lib/admin/gate'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'
import { logStaffAction } from '@/lib/staff/audit'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const STAFF_ROLE_VALUES: StaffRole[] = ['leadership', 'ae', 'bd']

const STAFF_COLUMNS = 'id, user_id, staff_role, display_name, title, phone, avatar_url, created_at'

// ─── GET /api/admin/staff ───────────────────────────────────────────────────
// Leadership-only (D-02, no self-serve — AE/BD do not create/list staff).
// Column-explicit select (never select star), per-row email attached via
// admin.getUserById (mirrors app/api/admin/members/route.ts).
export async function GET() {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('funun_staff')
    .select(STAFF_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const staff = await Promise.all(
    (data ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return { ...row, email: userData?.user?.email ?? '' }
    })
  )

  return NextResponse.json({ data: staff })
}

// ─── POST /api/admin/staff ──────────────────────────────────────────────────
// Leadership-only. Validates strictly against an explicit allowlist (email,
// display_name, staff_role against the closed StaffRole enum), delegates
// account creation to createStaffAccount() (never calls admin.createUser()
// inline here), then logs the action unconditionally (D-04).
export async function POST(request: Request) {
  const auth = await requireStaff(['leadership'])
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required.' }, { status: 400 })
  }

  const staffRole = body.staff_role
  if (typeof staffRole !== 'string' || !STAFF_ROLE_VALUES.includes(staffRole as StaffRole)) {
    return NextResponse.json({ error: 'Select a valid staff role.' }, { status: 400 })
  }

  try {
    const { userId, emailSent } = await createStaffAccount({
      email,
      displayName,
      staffRoles: [staffRole as StaffRole],
      invitedBy: auth.user.id,
    })

    const service = createServiceClient()

    // Unconditional — D-04, mirrors grantOrRevokeVerification's "log even
    // idempotent actions" rule. Never blocks the response on a log failure.
    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'create_staff',
      targetType: 'funun_staff',
      targetId: userId,
      changes: { email, display_name: displayName, staff_role: staffRole },
    })

    return NextResponse.json(
      {
        data: {
          id: userId,
          user_id: userId,
          staff_role: staffRole,
          display_name: displayName,
          email,
        },
        emailSent,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof DuplicateStaffAccountError) {
      return NextResponse.json({ error: 'This email has already been invited.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
}
