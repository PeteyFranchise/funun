import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff, primaryStaffRole, ALL_STAFF_ROLES, type StaffRole } from '@/lib/admin/gate'
import { createStaffAccount, DuplicateStaffAccountError } from '@/lib/staff/createStaffAccount'
import { logStaffAction } from '@/lib/staff/audit'
import { formatPhone, isValidPhone } from '@/lib/staff/phone'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Team management is leadership + TMS (people ops) — Team Members redesign.
const MANAGE_ROLES: StaffRole[] = ['leadership', 'tms']

const STAFF_COLUMNS =
  'id, user_id, staff_role, staff_roles, display_name, first_name, last_name, title, phone, avatar_url, created_at'

// ─── GET /api/admin/staff ───────────────────────────────────────────────────
// Leadership + TMS. Column-explicit select (never select star), per-row email
// attached via admin.getUserById (mirrors app/api/admin/members/route.ts).
export async function GET() {
  const auth = await requireStaff(MANAGE_ROLES)
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
// Leadership + TMS. Validates strictly against an explicit allowlist (email,
// display_name, a non-empty staff_roles array against the closed StaffRole enum,
// optional phone), delegates account creation to createStaffAccount() (never
// admin.createUser() inline), then logs the action unconditionally (D-04).
export async function POST(request: Request) {
  const auth = await requireStaff(MANAGE_ROLES)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const firstName = typeof body.first_name === 'string' ? body.first_name.trim() : ''
  const lastName = typeof body.last_name === 'string' ? body.last_name.trim() : ''
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'First and last name are required.' }, { status: 400 })
  }
  // Display name is optional — defaults to "First Last" (a nickname/alias otherwise).
  const displayNameInput = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const displayName = displayNameInput || `${firstName} ${lastName}`

  const rawRoles = body.staff_roles
  if (
    !Array.isArray(rawRoles) ||
    rawRoles.length === 0 ||
    !rawRoles.every(r => (ALL_STAFF_ROLES as string[]).includes(r as string))
  ) {
    return NextResponse.json({ error: 'Select at least one valid role.' }, { status: 400 })
  }
  const staffRoles = Array.from(new Set(rawRoles as StaffRole[]))

  // Phone is optional, but a provided value must be a full 10-digit number.
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : ''
  if (phoneRaw && !isValidPhone(phoneRaw)) {
    return NextResponse.json({ error: 'Enter a 10-digit phone number.' }, { status: 400 })
  }
  const phone = phoneRaw ? formatPhone(phoneRaw) : ''

  try {
    const { userId, emailSent } = await createStaffAccount({
      email,
      displayName,
      firstName,
      lastName,
      staffRoles,
      phone: phone || undefined,
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
      changes: { email, display_name: displayName, staff_roles: staffRoles },
    })

    return NextResponse.json(
      {
        data: {
          id: userId,
          user_id: userId,
          staff_role: primaryStaffRole(staffRoles),
          staff_roles: staffRoles,
          display_name: displayName,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
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
