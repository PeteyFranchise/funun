export const dynamic = 'force-dynamic'

import { ALL_STAFF_ROLES, getStaffRoles, type StaffRole } from '@/lib/admin/gate'
import { requireStaffPage } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { loadVisibleChangeBroadcasts } from '@/lib/playbook/change-broadcasts'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { ChangeBroadcastCenter } from '@/components/playbook/ChangeBroadcastCenter'

export default async function PlaybookUpdatesPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)])
  const grantedByRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) grantedByRoom.set(grant.room_id, [...(grantedByRoom.get(grant.room_id) ?? []), grant.role as StaffRole])
  const accessibleRoomIds = rooms.filter(room => canAccessRoom(roles, grantedByRoom.get(room.id) ?? [])).map(room => room.id)
  const updates = await loadVisibleChangeBroadcasts(service, { viewerId: auth.user.id, roles, accessibleRoomIds })
  if (updates.error) throw new Error(`Failed to load Playbook updates: ${updates.error}`)

  return (
    <main className="mx-auto w-full max-w-[1180px] px-6 py-[30px] pb-[60px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook · Internal</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-.02em] text-[color:var(--ink)]">What’s New</h1>
      <p className="mt-2 max-w-[72ch] text-[13px] leading-6 text-[color:var(--ink-3)]">The doctrine changes that apply to your Funūn work—what changed, why it matters, when it takes effect, and what you need to do.</p>
      <ChangeBroadcastCenter initialItems={updates.data} schemaReady={updates.schemaReady} />
    </main>
  )
}
