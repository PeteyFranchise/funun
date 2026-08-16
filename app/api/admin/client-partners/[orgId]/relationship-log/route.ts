import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import {
  appendRelationshipLog,
  canAccessOrgContacts,
  listRelationshipLog,
} from '@/lib/client-partners/contacts'

// ─── /api/admin/client-partners/[orgId]/relationship-log (D-05) ───────────
// GET reads the org's relationship log newest-first (optionally filtered by
// contact_id); POST appends a note/conversation entry. Own-book-scoped
// (R5), same canAccessOrgContacts predicate as the contacts route — a
// non-leadership caller not assigned to this org gets 404, never 403.
//
// Append-only (T-31-14): this file deliberately exposes no PATCH/DELETE
// handler. A logged entry is immutable once written; author_user_id is
// always the authenticated caller, never client-suppliable.

const RelationshipLogPostSchema = z
  .object({
    kind: z.enum(['note', 'conversation']),
    body: z.string().trim().min(1, 'A note cannot be empty.').max(5000),
    contact_id: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict()

async function resolveScopedOrg(service: ReturnType<typeof createServiceClient>, orgId: string) {
  const { data: orgRow } = await service
    .from('buyer_orgs')
    .select('id, ae_user_id')
    .eq('id', orgId)
    .maybeSingle()
  return orgRow as { id: string; ae_user_id: string | null } | null
}

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const auth = await requireStaff()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { orgId } = await params
  const service = createServiceClient()
  const org = await resolveScopedOrg(service, orgId)
  if (!org || !canAccessOrgContacts(auth.staffRole, org, auth.user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const contactId = url.searchParams.get('contact_id') ?? undefined

  try {
    const data = await listRelationshipLog(service, orgId, contactId ? { contactId } : undefined)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list relationship log' },
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
  const parsed = RelationshipLogPostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid relationship-log entry.' },
      { status: 400 }
    )
  }

  // A contact_id, if supplied, must belong to THIS org — otherwise a log
  // entry could be pointed at an unrelated org's contact.
  if (parsed.data.contact_id) {
    const { data: contact } = await service
      .from('buyer_org_contacts')
      .select('id, buyer_org_id')
      .eq('id', parsed.data.contact_id)
      .maybeSingle()
    if (!contact || contact.buyer_org_id !== orgId) {
      return NextResponse.json({ error: 'Contact not found for this org.' }, { status: 400 })
    }
  }

  try {
    const data = await appendRelationshipLog(service, {
      orgId,
      kind: parsed.data.kind,
      body: parsed.data.body,
      authorUserId: auth.user.id,
      contactId: parsed.data.contact_id ?? null,
    })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to append relationship log entry' },
      { status: 500 }
    )
  }
}
