import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'

// ─── POST /api/works/[workId]/blocks/reorder — one drag, one transaction ─
// Hands the whole new order to the atomic RPC in one call. Migration 127's
// launchpad-checklist reorder is the proven precedent this route follows:
// sequential per-row updates race under concurrent edits and can leave a
// shared document in an order nobody chose, whereas the RPC takes a SHARE
// ROW EXCLUSIVE table lock, validates completeness, uniqueness and
// contiguity, applies one set-based UPDATE, and raises a serialization
// failure if the block set changed mid-flight. The RPC is granted to
// `service_role` only — this route is the sole intended caller, and it only
// reaches the RPC after `resolveWorkAccess()` has already proven the
// caller's membership tier on this exact work above.

const ORDER_ENTRY_LIMIT = 200

const ReorderEntrySchema = z
  .object({
    id: z.string().uuid(),
    position: z.number().int().min(0).max(ORDER_ENTRY_LIMIT - 1),
  })
  .strict()

const ReorderSchema = z
  .object({
    order: z.array(ReorderEntrySchema).min(1).max(ORDER_ENTRY_LIMIT),
  })
  .strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(
    createWorkAccessDeps(supabase),
    workId,
    user.id,
    'contribute'
  )
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const body = await request.json().catch(() => null)
  const parsed = ReorderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'order must be a non-empty array of { id, position }' }, {
      status: 400,
    })
  }

  // Service role because the RPC is granted to no other role — authorization
  // already happened above, through the caller's own session.
  const service = createServiceClient()
  const { error } = await service.rpc('reorder_lyric_blocks', {
    p_work_id: workId,
    p_order: parsed.data.order,
  })

  if (error) {
    // 22023 (invalid_parameter_value): the payload was malformed, incomplete
    // or didn't name every current block exactly once.
    if (error.code === '22023') {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // 40001 (serialization_failure): the row count drifted between the
    // completeness check and the update — a real, expected outcome in a
    // shared pad, not an edge case. The caller should refetch and retry.
    if (error.code === '40001') {
      return NextResponse.json(
        { error: 'The song changed underneath you — refresh and try the reorder again.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // No diary row written here — the RPC emits exactly one reorder event for
  // the whole drag, from inside the same transaction that moved the rows.
  return NextResponse.json({ ok: true })
}
