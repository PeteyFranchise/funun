import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import {
  ContactCreateSchema,
  ContactPatchSchema,
  canAccessOrgContacts,
  createContact,
  deleteContact,
  listContacts,
  patchContact,
  setPrimaryContact,
} from '@/lib/client-partners/contacts'

// ─── /api/admin/client-partners/[orgId]/contacts (D-05/D-08/D-09) ─────────
// GET list / POST create / PATCH edit (incl. set-primary) / DELETE, all
// requireStaff()-gated and own-book-scoped (R5): leadership sees any org,
// ae/bd/anr only an org assigned to them (canAccessOrgContacts). Scope
// denial and a missing org both resolve to 404 — never 403 — so a staff
// caller who isn't assigned to this org cannot distinguish "not covered"
// from "doesn't exist" (mirrors app/(admin)/admin/client-partners/[orgId]/
// page.tsx and app/api/admin/buyer-orgs/[id]/route.ts's existing pattern).
//
// PATCH/DELETE target a specific contact via `id` in the JSON body (not a
// second dynamic route segment) since the collection route already owns
// [orgId] — every contact write additionally re-verifies the target
// contact belongs to THIS org before mutating it, so a contact id from a
// different org can never be edited/deleted/promoted through this route.

async function resolveScopedOrg(service: ReturnType<typeof createServiceClient>, orgId: string) {
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, ae_user_id')
    .eq('id', orgId)
    .maybeSingle()
  return orgRow as { id: string; ae_user_id: string | null } | null
}

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const data = await listContacts(service, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list contacts' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = ContactCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid contact.' },
      { status: 400 }
    )
  }

  try {
    const data = await createContact(service, orgId, parsed.data)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create contact' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const contactId = typeof body.id === 'string' ? body.id : ''
  if (!contactId) return NextResponse.json({ error: 'Contact id is required.' }, { status: 400 })

  // Re-verify the target contact belongs to THIS org before any mutation —
  // a contact id from a different org must 404, not silently no-op or
  // (worse) cross-write.
  const { data: existing } = await service
    .from('buyer_org_contacts')
    .select('id, buyer_org_id')
    .eq('id', contactId)
    .maybeSingle()
  if (!existing || existing.buyer_org_id !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    if (body.set_primary === true) {
      const data = await setPrimaryContact(service, orgId, contactId)
      return NextResponse.json({ data })
    }

    const parsed = ContactPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid contact edit.' },
        { status: 400 }
      )
    }
    const data = await patchContact(service, contactId, parsed.data)
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update contact' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const contactId = typeof body.id === 'string' ? body.id : ''
  if (!contactId) return NextResponse.json({ error: 'Contact id is required.' }, { status: 400 })

  const { data: existing } = await service
    .from('buyer_org_contacts')
    .select('id, buyer_org_id')
    .eq('id', contactId)
    .maybeSingle()
  if (!existing || existing.buyer_org_id !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await deleteContact(service, contactId)
    return NextResponse.json({ data: { id: contactId } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete contact' },
      { status: 500 }
    )
  }
}
