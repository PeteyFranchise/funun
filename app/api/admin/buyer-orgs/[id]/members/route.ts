import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { createBuyerAccount, DuplicateBuyerAccountError } from '@/lib/buyers/createBuyerAccount'
import { normalizeBuyerRole } from '@/lib/buyers/org'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MEMBER_COLUMNS = 'id, org_id, user_id, buyer_role, is_org_admin, created_at'

// ─── GET /api/admin/buyer-orgs/[id]/members ────────────────────────────────
// Lists a single org's members for the admin per-org member list panel.
// Column-explicit select, admin-gated, email attached per row (artist
// admin/members precedent — buyer_members has no email column either).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id: orgId } = await params
  const service = createServiceClient()
  const { data, error } = await service
    .from('buyer_members')
    .select(MEMBER_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = await Promise.all(
    (data ?? []).map(async row => {
      const { data: userData } = await service.auth.admin.getUserById(row.user_id)
      return { ...row, email: userData?.user?.email ?? '' }
    })
  )

  return NextResponse.json({ data: members })
}

// ─── POST /api/admin/buyer-orgs/[id]/members ───────────────────────────────
// Admin fallback path for adding a member to an existing org (org admins
// invite their own employees via /api/buyer/members). org_id comes from the
// route param, never the body. Tier coerced through normalizeBuyerRole so an
// unknown value fails closed to requester.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdmin()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id: orgId } = await params
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
  const isOrgAdmin = body.is_org_admin === true

  try {
    const { userId, emailSent } = await createBuyerAccount({
      email,
      displayName,
      orgId,
      buyerRole,
      isOrgAdmin,
      invitedBy: auth.user.id,
    })

    return NextResponse.json(
      {
        data: {
          id: userId,
          org_id: orgId,
          user_id: userId,
          buyer_role: buyerRole,
          is_org_admin: isOrgAdmin,
          created_at: new Date().toISOString(),
          email,
        },
        emailSent,
      },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof DuplicateBuyerAccountError) {
      return NextResponse.json({ error: 'This email has already been invited.' }, { status: 409 })
    }
    return NextResponse.json(
      { error: 'Something went wrong — please try again.' },
      { status: 500 }
    )
  }
}
