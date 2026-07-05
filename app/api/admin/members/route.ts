import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { createIndustryMember, DuplicateIndustryMemberError } from '@/lib/industry/createIndustryMember'
import { isValidRoleSlugList, mapSlugsToProfileRoles } from '@/lib/industry/roleMapping'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MEMBER_COLUMNS = 'id, artist_name, member_type, industry_roles, roles, created_at'

// ─── GET /api/admin/members ──────────────────────────────────────────────
// Column-explicit select against member_type='industry' rows only — never
// touches artist_profiles' private columns, so this is unaffected by the
// migration-040 column-privilege lockdown (D-02).
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('artist_profiles')
    .select(MEMBER_COLUMNS)
    .eq('member_type', 'industry')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // artist_profiles has no email column (it lives on auth.users) — attach it
  // per-row via the admin API so the list can render "{email} · Joined {date}"
  // per the 08-UI-SPEC list-item contract.
  const members = await Promise.all(
    (data ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.id)
      return { ...row, email: userData?.user?.email ?? '' }
    })
  )

  return NextResponse.json({ data: members })
}

// ─── POST /api/admin/members ─────────────────────────────────────────────
// Re-verifies is_admin, validates strictly against an allowlist (email +
// display_name + role_slugs only), then delegates account creation to
// createIndustryMember() (D-05) — never calls admin.createUser() inline here.
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  }

  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required.' }, { status: 400 })
  }

  const roleSlugs = body.role_slugs
  if (!isValidRoleSlugList(roleSlugs)) {
    return NextResponse.json({ error: 'Select at least one role.' }, { status: 400 })
  }

  try {
    const { userId } = await createIndustryMember({
      email,
      displayName,
      roleSlugs,
      invitedBy: auth.user.id,
    })

    const service = createServiceClient()
    const { data: profile } = await service
      .from('artist_profiles')
      .select(MEMBER_COLUMNS)
      .eq('id', userId)
      .maybeSingle()

    const data = profile
      ? { ...profile, email }
      : {
          id: userId,
          artist_name: displayName,
          member_type: 'industry',
          industry_roles: roleSlugs,
          roles: mapSlugsToProfileRoles(roleSlugs),
          created_at: new Date().toISOString(),
          email,
        }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicateIndustryMemberError) {
      return NextResponse.json({ error: 'This email has already been invited.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  }
}
