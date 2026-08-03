import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { createBuyerAccount, DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ORG_COLUMNS = 'id, name, is_personal, verified, created_at'

// ─── GET /api/admin/buyer-orgs ─────────────────────────────────────────────
// Column-explicit select (never select star — migration 080's column-grant
// lockdown convention). Attaches a per-org member count, mirroring the
// getUserById per-row email attach in app/api/admin/members/route.ts.
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orgs = await Promise.all(
    (data ?? []).map(async row => {
      const { count } = await service
        .from('buyer_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', row.id)
      return { ...row, memberCount: count ?? 0 }
    })
  )

  return NextResponse.json({ data: orgs })
}

// ─── POST /api/admin/buyer-orgs ────────────────────────────────────────────
// D-12: platform admins create the company record AND invite its first org
// admin in the same request — org admins are approvers with member
// management (D-13). Validates strictly against an explicit allowlist (org
// name, admin email, admin display name only) — never spreads the request
// body into an insert.
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const orgName = typeof body.org_name === 'string' ? body.org_name.trim() : ''
  if (!orgName) {
    return NextResponse.json({ error: 'Company name is required.' }, { status: 400 })
  }

  const adminEmail =
    typeof body.admin_email === 'string' ? body.admin_email.trim().toLowerCase() : ''
  if (!adminEmail || !EMAIL_REGEX.test(adminEmail)) {
    return NextResponse.json({ error: 'A valid admin email is required.' }, { status: 400 })
  }

  const adminDisplayName =
    typeof body.admin_display_name === 'string' ? body.admin_display_name.trim() : ''
  if (!adminDisplayName) {
    return NextResponse.json({ error: 'Admin display name is required.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: org, error: orgError } = await service
    .from('buyer_orgs')
    .insert({ name: orgName, created_by: auth.user.id })
    .select(ORG_COLUMNS)
    .single()

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? 'Failed to create company.' },
      { status: 500 }
    )
  }

  try {
    const { userId, emailSent } = await createBuyerAccount({
      email: adminEmail,
      displayName: adminDisplayName,
      orgId: org.id,
      buyerRole: 'approver',
      isOrgAdmin: true,
      invitedBy: auth.user.id,
    })

    return NextResponse.json(
      {
        data: { org: { ...org, memberCount: 1 }, adminUserId: userId, adminEmail },
        emailSent,
      },
      { status: 201 }
    )
  } catch (err) {
    // The org row already exists at this point — a failed first-admin invite
    // still leaves a real (if member-less) company an admin can retry from
    // the UI (the members route). Never silently roll back a successful
    // insert on a downstream failure.
    if (err instanceof DuplicateBuyerAccountError) {
      return NextResponse.json(
        {
          error: 'This email has already been invited.',
          data: { org: { ...org, memberCount: 0 } },
        },
        { status: 409 }
      )
    }
    return NextResponse.json(
      {
        error: 'Company created, but the first org admin invite failed — please try again.',
        data: { org: { ...org, memberCount: 0 } },
      },
      { status: 500 }
    )
  }
}
