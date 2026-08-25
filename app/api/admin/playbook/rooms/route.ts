import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdmin } from '@/lib/admin/gate'
import { loadRooms } from '@/lib/playbook/rooms'
import {
  buildGrantMatrix,
  isGrantableRole,
  readRoomGrants,
  removeRoomGrant,
  setRoomGrant,
} from '@/lib/playbook/access-grants'

// ─── GET/PATCH /api/admin/playbook/rooms — leadership-only room×role matrix ─
// (31.2-03 Task 3, D-31.2-01/03). GET returns the full access-editor matrix;
// PATCH toggles one (room, role) grant. Leadership-only via verifyAdmin —
// authority always derives from the session, never a client-supplied flag.
// role='leadership' is never a grantable target: rejected here with 400
// AND rejected again inside setRoomGrant/removeRoomGrant via
// isGrantableRole (belt-and-suspenders, Pitfall 5/T-31.2-07).

const RoomGrantPatchSchema = z
  .object({
    roomId: z.string().uuid(),
    role: z.string(),
    granted: z.boolean(),
  })
  .strict()

export async function GET() {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const rooms = await loadRooms(service)
  const grantRows = await readRoomGrants(service)

  return NextResponse.json({ data: buildGrantMatrix(rooms, grantRows) })
}

export async function PATCH(request: Request) {
  const auth = await verifyAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RoomGrantPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid grant payload' }, { status: 400 })
  }

  const { roomId, role, granted } = parsed.data

  // 'leadership' is never a grantable target — structural, never row-data
  // (Pitfall 5). Checked here up front (fast 400, no service round-trip)
  // and again inside setRoomGrant/removeRoomGrant (defense in depth).
  if (!isGrantableRole(role)) {
    return NextResponse.json({ error: "role 'leadership' is not a grantable target" }, { status: 400 })
  }

  const service = createServiceClient()
  const write = granted
    ? await setRoomGrant(service, { roomId, role, actorId: auth.user.id })
    : await removeRoomGrant(service, { roomId, role, actorId: auth.user.id })

  if (!write.ok) {
    return NextResponse.json({ error: write.error ?? 'Failed to update grant' }, { status: 500 })
  }

  const rooms = await loadRooms(service)
  const grantRows = await readRoomGrants(service)

  return NextResponse.json({ data: buildGrantMatrix(rooms, grantRows) })
}
