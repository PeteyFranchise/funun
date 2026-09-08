import type { SupabaseClient } from '@supabase/supabase-js'
import type { StaffRole } from '@/lib/admin/staff-role'

export type ChangeBroadcastPriority = 'standard' | 'important' | 'urgent'
export type ChangeBroadcastAudience = 'all_team' | 'role' | 'user'

export type ChangeBroadcastRow = {
  id: string
  entry_id: string
  room_id: string
  revision_number: number
  headline: string
  change_summary: string
  why_it_matters: string
  action_required: string | null
  priority: ChangeBroadcastPriority
  audience_kind: ChangeBroadcastAudience
  target_role: StaffRole | null
  target_user_id: string | null
  effective_at: string
  reading_required: boolean
  reading_due_at: string | null
  published_by: string
  published_at: string
}

export type ChangeBroadcastItem = ChangeBroadcastRow & {
  entryTitle: string
  entrySlug: string
  roomKey: string
  roomLabel: string
  publisherName: string
  isRead: boolean
}

export function isChangeBroadcastSchemaMissing(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  const message = (value?.message ?? '').toLowerCase()
  return value?.code === '42P01' || value?.code === 'PGRST205' || message.includes('playbook_change_broadcast')
}

export function changeBroadcastAppliesToViewer(
  broadcast: Pick<ChangeBroadcastRow, 'audience_kind' | 'target_role' | 'target_user_id'>,
  viewerId: string,
  roles: readonly StaffRole[]
): boolean {
  if (broadcast.audience_kind === 'all_team') return true
  if (broadcast.audience_kind === 'user') return broadcast.target_user_id === viewerId
  return broadcast.target_role !== null && roles.includes(broadcast.target_role)
}

const PRIORITY_RANK: Record<ChangeBroadcastPriority, number> = { urgent: 0, important: 1, standard: 2 }

export function sortChangeBroadcasts(items: readonly ChangeBroadcastItem[]): ChangeBroadcastItem[] {
  return [...items].sort((left, right) => {
    if (left.isRead !== right.isRead) return left.isRead ? 1 : -1
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    if (priority !== 0) return priority
    return Date.parse(right.published_at) - Date.parse(left.published_at)
  })
}

export async function loadVisibleChangeBroadcasts(
  service: SupabaseClient,
  args: { viewerId: string; roles: readonly StaffRole[]; accessibleRoomIds: readonly string[]; limit?: number }
): Promise<{ schemaReady: boolean; data: ChangeBroadcastItem[]; error?: string }> {
  if (args.accessibleRoomIds.length === 0) return { schemaReady: true, data: [] }

  const result = await service
    .from('playbook_change_broadcasts')
    .select('*')
    .in('room_id', [...args.accessibleRoomIds])
    .order('published_at', { ascending: false })
    .limit(Math.max(1, Math.min(args.limit ?? 200, 500)))
  if (result.error) {
    if (isChangeBroadcastSchemaMissing(result.error)) return { schemaReady: false, data: [] }
    return { schemaReady: true, data: [], error: result.error.message }
  }

  const broadcasts = ((result.data ?? []) as ChangeBroadcastRow[]).filter(item =>
    changeBroadcastAppliesToViewer(item, args.viewerId, args.roles)
  )
  if (broadcasts.length === 0) return { schemaReady: true, data: [] }

  const entryIds = Array.from(new Set(broadcasts.map(item => item.entry_id)))
  const roomIds = Array.from(new Set(broadcasts.map(item => item.room_id)))
  const publisherIds = Array.from(new Set(broadcasts.map(item => item.published_by)))
  const [entries, rooms, publishers, reads] = await Promise.all([
    service.from('playbook_entries').select('id, title, slug, status').in('id', entryIds),
    service.from('playbook_rooms').select('id, key, label').in('id', roomIds),
    service.from('funun_staff').select('user_id, display_name').in('user_id', publisherIds),
    service.from('playbook_change_broadcast_reads').select('broadcast_id').eq('user_id', args.viewerId).in('broadcast_id', broadcasts.map(item => item.id)),
  ])
  const firstError = entries.error ?? rooms.error ?? publishers.error ?? reads.error
  if (firstError) {
    if (isChangeBroadcastSchemaMissing(firstError)) return { schemaReady: false, data: [] }
    return { schemaReady: true, data: [], error: firstError.message }
  }

  const entryById = new Map((entries.data ?? []).map(row => [row.id as string, row]))
  const roomById = new Map((rooms.data ?? []).map(row => [row.id as string, row]))
  const publisherById = new Map((publishers.data ?? []).map(row => [row.user_id as string, String(row.display_name || 'Team Member')]))
  const readIds = new Set((reads.data ?? []).map(row => row.broadcast_id as string))

  return {
    schemaReady: true,
    data: sortChangeBroadcasts(broadcasts.flatMap(item => {
      const entry = entryById.get(item.entry_id)
      const room = roomById.get(item.room_id)
      if (!entry || !room || entry.status !== 'published' || !entry.slug) return []
      return [{
        ...item,
        entryTitle: String(entry.title),
        entrySlug: String(entry.slug),
        roomKey: String(room.key),
        roomLabel: String(room.label),
        publisherName: publisherById.get(item.published_by) ?? 'Team Member',
        isRead: readIds.has(item.id),
      }]
    })),
  }
}
