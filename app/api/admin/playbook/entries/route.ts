import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead, createEntry, listEntries } from '@/lib/playbook/entries'

// ─── /api/admin/playbook/entries — SOP/Topic authoring (31.2-04 Task 2) ────
// POST: room-scoped, role-tiered create. isApprover is derived SERVER-side
// (leadership OR isRoomLead) -- the client's body can never influence
// publish status (T-31.2-10, Pattern 2). GET: room-scoped list — published
// entries always, a caller's own drafts too.

const EntryCreateSchema = z
  .object({
    roomKey: z.string().trim().min(1),
    subGroupId: z.string().uuid().optional(),
    entryType: z.enum(['sop', 'topic']),
    title: z.string().trim().min(1).max(300),
    content: z.record(z.string(), z.unknown()),
  })
  .strict()

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = EntryCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid playbook entry payload' }, { status: 400 })
  }

  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const roomId = (room as { id: string }).id
  const isApprover = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))

  const { data, error } = await createEntry(service, {
    roomId,
    subGroupId: parsed.data.subGroupId ?? null,
    entryType: parsed.data.entryType,
    title: parsed.data.title,
    incoming: parsed.data.content,
    isApprover,
    authorId: auth.user.id,
  })

  if (error) return NextResponse.json({ error }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'create_playbook_entry',
    targetType: 'playbook_entry',
    targetId: (data as { id: string } | null)?.id ?? null,
    changes: {
      roomKey: parsed.data.roomKey,
      entryType: parsed.data.entryType,
      status: (data as { status?: string } | null)?.status,
    },
  })

  return NextResponse.json({ data })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const roomKey = (url.searchParams.get('roomKey') ?? '').trim()
  if (!roomKey) {
    return NextResponse.json({ error: 'roomKey is required' }, { status: 400 })
  }

  const auth = await requireRoomAccess(roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()

  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', roomKey)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const { data, error } = await listEntries(service, {
    roomId: (room as { id: string }).id,
    viewerId: auth.user.id,
  })
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ data })
}
