export const dynamic = 'force-dynamic'

import { PlaybookMediaUploader } from '@/components/playbook/PlaybookMediaUploader'
import { ALL_STAFF_ROLES, getStaffRoles, requireStaffPage, type StaffRole } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

export default async function PlaybookMediaPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES); const roles = getStaffRoles(auth.user); const service = createServiceClient(); const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)]); const byRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) byRoom.set(grant.room_id, [...(byRoom.get(grant.room_id) ?? []), grant.role as StaffRole])
  const accessible = rooms.filter(room => canAccessRoom(roles, byRoom.get(room.id) ?? []))
  return <main className="mx-auto w-full max-w-[900px] px-6 py-[30px] lg:px-9"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook · Media</p><h1 className="mt-1 text-2xl font-extrabold">Training Media</h1><p className="mt-2 text-sm text-[color:var(--ink-3)]">Upload room-protected training video. Playback stays behind the same Playbook authorization checks as the doctrine.</p><PlaybookMediaUploader rooms={accessible.map(room => ({ key: room.key, label: room.label }))} /></main>
}
