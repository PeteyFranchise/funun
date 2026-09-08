import { NextResponse } from 'next/server'
import { ALL_STAFF_ROLES, getStaffRoles, type StaffRole } from '@/lib/admin/staff-role'
import { requireStaff } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { searchPlaybookEntries, type SearchablePlaybookEntry } from '@/lib/playbook/search'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const auth = await requireStaff(ALL_STAFF_ROLES)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (query.length < 2 || query.length > 120) return NextResponse.json({ error: 'Search must be between 2 and 120 characters' }, { status: 400 })

  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)])
  const grantedByRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) grantedByRoom.set(grant.room_id, [...(grantedByRoom.get(grant.room_id) ?? []), grant.role as StaffRole])
  const accessibleRooms = rooms.filter(room => canAccessRoom(roles, grantedByRoom.get(room.id) ?? []))
  if (accessibleRooms.length === 0) return NextResponse.json({ data: [] })

  const entries = await service.from('playbook_entries').select('id, room_id, entry_type, title, slug, content, revision_number, published_at, updated_at').in('room_id', accessibleRooms.map(room => room.id)).eq('status', 'published').limit(1000)
  if (entries.error) return NextResponse.json({ error: entries.error.message }, { status: 500 })
  const roomById = new Map(accessibleRooms.map(room => [room.id, room]))
  const searchable = (entries.data ?? []).flatMap(row => {
    const room = roomById.get(row.room_id as string)
    if (!room || !row.slug) return []
    return [{
      id: row.id as string, roomId: room.id, roomKey: room.key, roomLabel: room.label,
      entryType: row.entry_type, title: row.title, slug: row.slug, content: row.content,
      revisionNumber: Number(row.revision_number ?? 1), publishedAt: String(row.published_at ?? row.updated_at),
    } as SearchablePlaybookEntry]
  })
  return NextResponse.json({ data: searchPlaybookEntries(searchable, query) })
}
