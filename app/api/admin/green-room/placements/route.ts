import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { validatePlacementCreate, isDestinationVisible } from '@/lib/green-room/placements-admin'

// ─── GET /api/admin/green-room/placements ────────────────────────────────
// Lists ALL placements (every status/window) for the admin table. The
// service client is used only after verifyAdmin() passes.
export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('green_room_placements')
    .select('*')
    .order('status', { ascending: true })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── POST /api/admin/green-room/placements ───────────────────────────────
// Creates a placement. If created directly as `active`, the destination must
// be confirmed public/visible first (adversarial-review requirement).
export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const validated = validatePlacementCreate(body)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const insert = validated.value
  const service = createServiceClient()

  if (insert.status === 'active') {
    const visible = await isDestinationVisible(
      service,
      insert.destination_type,
      insert.destination_id,
      insert.destination_url
    )
    if (!visible) {
      return NextResponse.json(
        { error: 'Destination is not public/visible — cannot activate this placement' },
        { status: 409 }
      )
    }
  }

  const { data, error } = await service
    .from('green_room_placements')
    .insert({ ...insert, created_by: auth.user.id })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
