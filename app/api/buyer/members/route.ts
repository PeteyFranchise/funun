import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import {
  addClientPartnerMember,
  IncompatibleClientPartnerIdentityError,
} from '@/lib/buyers/addClientPartnerMember'
import { DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { canManageMembers } from '@/lib/buyers/permissions'
import { normalizeBuyerRole } from '@/lib/buyers/org'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── POST /api/buyer/members ────────────────────────────────────────────────
// Buyer-facing member invite (D-13). Gated by ORG MEMBERSHIP, not platform
// admin: resolves the caller's own buyer_members row via the session client
// (RLS's buyer_members_select_own_org policy permits a caller to read their
// own row) and requires canManageMembers() (lib/buyers/permissions.ts) to be
// true before adding the Client Partner relationship. org_id is forced to the caller's
// own membership row — never read from the request body — so an org admin
// cannot inject members into a different company (T-16-09). The requested
// tier is coerced through normalizeBuyerRole, failing closed to requester;
// is_org_admin is never client-settable on this route.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id, is_org_admin')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member || !canManageMembers(member)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  const buyerRole = normalizeBuyerRole(body.buyer_role)
  const orgId = member.org_id
  const { data: organization, error: organizationError } = await supabase
    .from('buyer_orgs')
    .select('name')
    .eq('id', orgId)
    .maybeSingle()
  if (organizationError) {
    return NextResponse.json({ error: organizationError.message }, { status: 500 })
  }
  if (!organization) {
    return NextResponse.json({ error: 'Client Partner organization not found.' }, { status: 404 })
  }

  try {
    const { userId, emailSent, existingAccount } = await addClientPartnerMember({
      email,
      displayName,
      organizationName: organization.name,
      orgId,
      buyerRole,
      isOrgAdmin: false,
      invitedBy: user.id,
    })

    return NextResponse.json(
      {
        data: {
          id: userId,
          org_id: orgId,
          user_id: userId,
          buyer_role: buyerRole,
          is_org_admin: false,
          created_at: new Date().toISOString(),
          email,
        },
        emailSent,
        existingAccount,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof DuplicateBuyerAccountError) {
      return NextResponse.json({ error: 'This email has already been invited.' }, { status: 409 })
    }
    if (err instanceof IncompatibleClientPartnerIdentityError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json(
      { error: 'Something went wrong — please try again.' },
      { status: 500 }
    )
  }
}
