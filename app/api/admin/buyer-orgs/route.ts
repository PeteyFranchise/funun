import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import {
  addClientPartnerMember,
  IncompatibleClientPartnerIdentityError,
} from '@/lib/buyers/addClientPartnerMember'
import { DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { logStaffAction } from '@/lib/staff/audit'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ORG_COLUMNS = 'id, name, is_personal, verified, created_at, status'

// ─── GET /api/admin/buyer-orgs ─────────────────────────────────────────────
// Column-explicit select (never select star — migration 080's column-grant
// lockdown convention). Attaches a per-org member count, mirroring the
// getUserById per-row email attach in app/api/admin/members/route.ts.
// Staff-gated (widened from leadership-only verifyAdmin); non-leadership
// callers (AE/BD) are scoped to their assigned companies only — the read
// path is scoped exactly like the write path (Pitfall 4: never widen GET
// without also adding the ae_user_id filter).
//
// 23-06: `?unassigned=1` adds leadership's unassigned-lead queue —
// buyer_orgs WHERE ae_user_id IS NULL — reusing this same GET rather than a
// parallel queue table/route (RESEARCH anti-pattern warning). The param is
// silently ignored for non-leadership callers: they are already scoped to
// their own assigned companies (an AE/BD has no "unassigned" view to ask
// for), so the existing .eq('ae_user_id', ...) branch below still wins.
export async function GET(request: Request) {
  const auth = await requireStaff()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const unassignedOnly = new URL(request.url).searchParams.get('unassigned') === '1'

  const service = createServiceClient()
  let query = service
    .from('buyer_orgs')
    .select(ORG_COLUMNS)
    .order('created_at', { ascending: false })
  if (auth.staffRole !== 'leadership') {
    query = query.eq('ae_user_id', auth.user.id)
  } else if (unassignedOnly) {
    query = query.is('ae_user_id', null)
  }
  const { data, error } = await query

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
// D-12: staff create the company record AND invite its first org admin in
// the same request — org admins are approvers with member management
// (D-13). Widened from leadership-only to any permissioned staff (D-03:
// leadership/AE/BD can all create Client Partner accounts on the client's
// behalf). Validates strictly against an explicit allowlist (org name,
// admin email, admin display name only) — never spreads the request body
// into an insert.
export async function POST(request: Request) {
  const auth = await requireStaff(['leadership', 'ae', 'bd'])
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
  // review #12: an AE/BD who creates a Client Partner is auto-assigned to it, so
  // it appears in their own scoped GET (otherwise ae_user_id stays null and the
  // company vanishes from the creator's queue the moment they refresh). Leadership
  // sees every org and assigns an AE via the dedicated /ae route, so leave it
  // unassigned for them.
  const selfAssignedAe = auth.staffRole !== 'leadership' ? auth.user.id : null
  const { data: org, error: orgError } = await service
    .from('buyer_orgs')
    .insert({
      name: orgName,
      created_by: auth.user.id,
      ...(selfAssignedAe ? { ae_user_id: selfAssignedAe } : {}),
    })
    .select(ORG_COLUMNS)
    .single()

  if (orgError || !org) {
    return NextResponse.json(
      { error: orgError?.message ?? 'Failed to create company.' },
      { status: 500 }
    )
  }

  // Audit the company creation immediately (review #9): record it even if the
  // first-admin invite below fails, so a buyer_org that exists is never unaudited.
  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'create_buyer_org',
    targetType: 'buyer_org',
    targetId: org.id,
    changes: { name: orgName, ae_user_id: selfAssignedAe },
  })

  try {
    const { userId, emailSent, existingAccount } = await addClientPartnerMember({
      email: adminEmail,
      displayName: adminDisplayName,
      organizationName: orgName,
      orgId: org.id,
      buyerRole: 'approver',
      isOrgAdmin: true,
      invitedBy: auth.user.id,
      service,
    })

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'create_buyer_account',
      targetType: 'buyer_org',
      targetId: org.id,
    })

    return NextResponse.json(
      {
        data: { org: { ...org, memberCount: 1 }, adminUserId: userId, adminEmail },
        emailSent,
        existingAccount,
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
    if (err instanceof IncompatibleClientPartnerIdentityError) {
      return NextResponse.json(
        {
          error: err.message,
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
