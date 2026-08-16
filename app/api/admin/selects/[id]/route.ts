import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { loadSelectsInScope, patchSelects, softDeleteSelects } from '@/lib/selects/persistence'

// SELECTS_EDITABLE_FIELDS' shape, validated here (route layer) BEFORE
// patchSelects' own allowlist loop applies it a second time (defense in
// depth — mirrors app/api/admin/deals/[id]/route.ts's zod-then-allowlist
// convention). Includes download_enabled/download_max_seconds (D-02).
const PatchSelectsBodySchema = z
  .object({
    name: z.string().trim().min(1, 'name cannot be empty').max(200, 'name is too long').optional(),
    cover_note: z.union([z.string().trim().max(4000, 'cover note is too long'), z.null()]).optional(),
    download_enabled: z.boolean().optional(),
    download_max_seconds: z.union([z.number().int().min(0), z.null()]).optional(),
  })
  .strict()

// ─── PATCH /api/admin/selects/[id] ─────────────────────────────────────────
// Own-book-scoped edit (leadership bypasses). Scope denial and a genuine
// nonexistent id both resolve to the SAME 404 (T-31-07, no existence leak).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const existing = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = PatchSelectsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const updated = await patchSelects(service, id, parsed.data)
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update Selects' },
      { status: 500 }
    )
  }
}

// ─── DELETE /api/admin/selects/[id] ────────────────────────────────────────
// Discards a still-draft Selects (see lib/selects/persistence.ts's
// softDeleteSelects doc comment — migration 111 has no deleted_at column on
// `selects`, so a Selects that has ever been sent can never be deleted
// through this path; 409 if attempted).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const auth = await requireStaff(['leadership', 'ae', 'bd'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const existing = await loadSelectsInScope(service, id, auth.staffRole, auth.user.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await softDeleteSelects(service, id)
    if (!result.ok) {
      if (result.reason === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json(
        { error: 'A Selects that has already been sent cannot be deleted.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete Selects' },
      { status: 500 }
    )
  }
}
