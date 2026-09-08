export const dynamic = 'force-dynamic'
import {
  DoctrineDependencyMap,
  type DoctrineDependencyCard,
} from '@/components/playbook/DoctrineDependencyMap'
import { FeatureGateNotice } from '@/components/playbook/FeatureGateNotice'
import {
  ALL_STAFF_ROLES,
  getStaffRoles,
  requireStaffPage,
  type StaffRole,
} from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { isRoomLead } from '@/lib/playbook/entries'
import { loadAvailablePlaybookFeatures } from '@/lib/playbook/feature-access'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
export default async function DependenciesPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES)
  const roles = getStaffRoles(auth.user)
  const service = createServiceClient()
  const feature = await loadAvailablePlaybookFeatures(service, auth.user.id)
  if (!feature.keys.has('dependency_map'))
    return (
      <main className="mx-auto w-full max-w-[1000px] px-6 py-[30px] lg:px-9">
        <h1 className="text-2xl font-extrabold">Doctrine Dependency Map</h1>
        <FeatureGateNotice
          schemaReady={feature.schemaReady}
          label="Doctrine Dependency Map"
        />
      </main>
    )
  const [rooms, grants] = await Promise.all([
    loadRooms(service),
    readRoomGrants(service),
  ])
  const byRoom = new Map<string, StaffRole[]>()
  for (const g of grants)
    byRoom.set(g.room_id, [
      ...(byRoom.get(g.room_id) ?? []),
      g.role as StaffRole,
    ])
  const accessible = rooms.filter((r) =>
    canAccessRoom(roles, byRoom.get(r.id) ?? [])
  )
  const roomById = new Map(accessible.map((r) => [r.id, r]))
  const entries = accessible.length
    ? await service
        .from('playbook_entries')
        .select('id,room_id,title,revision_number')
        .in(
          'room_id',
          accessible.map((r) => r.id)
        )
        .eq('status', 'published')
    : { data: [], error: null }
  const entryById = new Map(
    (entries.data ?? []).map((x) => [x.id as string, x])
  )
  const deps = entryById.size
    ? await service
        .from('playbook_doctrine_dependencies')
        .select(
          'id,source_entry_id,source_revision_number,dependency_kind,target_kind,target_label,target_href'
        )
        .in('source_entry_id', [...entryById.keys()])
        .eq('active', true)
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  const cards: DoctrineDependencyCard[] = (deps.data ?? []).flatMap((row) => {
    const entry = entryById.get(row.source_entry_id as string)
    const room = entry ? roomById.get(entry.room_id as string) : null
    return entry && room
      ? [
          {
            id: row.id as string,
            sourceTitle: String(entry.title),
            sourceRevision: Number(row.source_revision_number),
            roomKey: room.key,
            roomLabel: room.label,
            dependencyKind: String(row.dependency_kind),
            targetKind: String(row.target_kind),
            targetLabel: String(row.target_label),
            targetHref: row.target_href as string | null,
            stale:
              Number(entry.revision_number) >
              Number(row.source_revision_number),
          },
        ]
      : []
  })
  const leadRooms = new Set(
    (
      await Promise.all(
        accessible.map(
          async (r) =>
            [
              r.id,
              roles.includes('leadership') ||
                (await isRoomLead(service, r.id, auth.user.id)),
            ] as const
        )
      )
    )
      .filter((x) => x[1])
      .map((x) => x[0])
  )
  const sources = (entries.data ?? []).flatMap((x) => {
    const room = roomById.get(x.room_id as string)
    return room && leadRooms.has(room.id)
      ? [
          {
            id: x.id as string,
            title: String(x.title),
            revision: Number(x.revision_number),
            roomKey: room.key,
          },
        ]
      : []
  })
  return (
    <main className="mx-auto w-full max-w-[1050px] px-6 py-[30px] lg:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">
        The Playbook · Release 29
      </p>
      <h1 className="mt-1 text-2xl font-extrabold">Doctrine Dependency Map</h1>
      <p className="mt-2 text-sm text-[color:var(--ink-3)]">
        See which workflows, learning programs, simulations, and operating
        surfaces depend on a specific approved revision before changing it.
      </p>
      <DoctrineDependencyMap initialItems={cards} sources={sources} />
    </main>
  )
}
