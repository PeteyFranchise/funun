import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { isOrgInAeScope, createSelects } from '@/lib/selects/persistence'
import type { Selects } from '@/lib/selects/types'

const SELECTS_COLUMNS =
  'id, buyer_org_id, created_by, brief_id, name, cover_note, share_token, status, download_enabled, download_max_seconds, created_at, updated_at, sent_at'

const CreateSelectsBodySchema = z
  .object({
    orgId: z.string().uuid(),
    name: z.string().trim().min(1, 'name is required').max(200, 'name is too long'),
    coverNote: z.union([z.string().trim().max(4000, 'cover note is too long'), z.null()]).optional(),
    briefId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .strict()

// ─── GET /api/admin/selects ─────────────────────────────────────────────────
// Own-book-scoped list (Pitfall 4 — the read path is scoped exactly like the
// write path): leadership sees every Selects; AE/BD see only Selects whose
// buyer_org is assigned to them (mirrors app/(admin)/admin/my-client-partners/
// page.tsx's read pattern — resolve scoped org ids first, then filter).
export async function GET() {
  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  let orgIds: string[] | null = null
  if (auth.staffRole !== 'leadership') {
    const { data: orgRows } = await service.from('buyer_orgs').select('id').eq('ae_user_id', auth.user.id)
    orgIds = ((orgRows ?? []) as { id: string }[]).map(r => r.id)
    if (orgIds.length === 0) return NextResponse.json({ data: [] })
  }

  let query = service.from('selects').select(SELECTS_COLUMNS).order('created_at', { ascending: false })
  if (orgIds) query = query.in('buyer_org_id', orgIds)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []) as Selects[] })
}

// ─── POST /api/admin/selects ─────────────────────────────────────────────────
// Creates a Selects for one of the caller's own assigned clients (leadership
// may target any org). Scope denial returns 404 (notFound-style JSON) —
// never 403 — so a non-assigned org's existence is never leaked (T-31-07).
export async function POST(request: Request) {
  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = CreateSelectsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }
  const input = parsed.data

  const service = createServiceClient()
  const inScope = await isOrgInAeScope(service, input.orgId, auth.staffRole, auth.user.id)
  if (!inScope) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const created = await createSelects(service, {
      orgId: input.orgId,
      aeUserId: auth.user.id,
      name: input.name,
      coverNote: input.coverNote ?? null,
      briefId: input.briefId ?? null,
    })
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create Selects' },
      { status: 500 }
    )
  }
}
