export const dynamic = 'force-dynamic'

import { ALL_STAFF_ROLES, getStaffRoles, type StaffRole } from '@/lib/admin/gate'
import { requireStaffPage } from '@/lib/admin/gate'
import { readRoomGrants } from '@/lib/playbook/access-grants'
import { isRoomLead } from '@/lib/playbook/entries'
import { isPlaybookEnablementSchemaMissing } from '@/lib/playbook/enablement'
import { canAccessRoom, loadRooms } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { FeedbackQueue, type FeedbackQueueItem } from '@/components/playbook/FeedbackQueue'

export default async function FeedbackPage() {
  const auth = await requireStaffPage(ALL_STAFF_ROLES); const roles = getStaffRoles(auth.user); const service = createServiceClient()
  const [rooms, grants] = await Promise.all([loadRooms(service), readRoomGrants(service)]); const byRoom = new Map<string, StaffRole[]>()
  for (const grant of grants) byRoom.set(grant.room_id, [...(byRoom.get(grant.room_id) ?? []), grant.role as StaffRole])
  const accessible = rooms.filter(room => canAccessRoom(roles, byRoom.get(room.id) ?? [])); const roomIds = accessible.map(room => room.id)
  const result = roomIds.length ? await service.from('playbook_reader_feedback').select('id, entry_id, room_id, revision_number, feedback_kind, body, status, created_by, created_at').in('room_id', roomIds).order('created_at', { ascending: false }).limit(500) : { data: [], error: null }
  const schemaReady = !result.error || !isPlaybookEnablementSchemaMissing(result.error)
  if (result.error && schemaReady) throw new Error(`Failed to load Playbook feedback: ${result.error.message}`)
  const rows = result.data ?? []; const entryIds = Array.from(new Set(rows.flatMap(row => row.entry_id ? [row.entry_id as string] : []))); const authorIds = Array.from(new Set(rows.map(row => row.created_by as string)))
  const [entries, authors, leadFlags] = await Promise.all([entryIds.length ? service.from('playbook_entries').select('id, title, slug').in('id', entryIds) : Promise.resolve({ data: [], error: null }), authorIds.length ? service.from('funun_staff').select('user_id, display_name').in('user_id', authorIds) : Promise.resolve({ data: [], error: null }), Promise.all(accessible.map(async room => [room.id, roles.includes('leadership') || await isRoomLead(service, room.id, auth.user.id)] as const))])
  const entryById = new Map((entries.data ?? []).map(row => [row.id as string, row])); const authorById = new Map((authors.data ?? []).map(row => [row.user_id as string, String(row.display_name || 'Team Member')])); const roomById = new Map(accessible.map(room => [room.id, room])); const manageByRoom = new Map(leadFlags)
  const items: FeedbackQueueItem[] = rows.flatMap(row => { const room = roomById.get(row.room_id as string); if (!room) return []; const entry = row.entry_id ? entryById.get(row.entry_id as string) : null; return [{ id: row.id as string, roomKey: room.key, roomLabel: room.label, entryTitle: entry ? String(entry.title) : null, entrySlug: entry?.slug ? String(entry.slug) : null, revision: row.revision_number as number | null, kind: String(row.feedback_kind), body: String(row.body), status: row.status, authorName: authorById.get(row.created_by as string) ?? 'Team Member', createdAt: String(row.created_at), canManage: manageByRoom.get(room.id) ?? false }] as FeedbackQueueItem[] })
  return <main className="mx-auto w-full max-w-[1100px] px-6 py-[30px] pb-[60px] lg:px-9"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[color:var(--indigo)]">The Playbook · Improvement loop</p><h1 className="mt-1 text-2xl font-extrabold text-[color:var(--ink)]">Reader Feedback</h1><p className="mt-2 text-[13px] text-[color:var(--ink-3)]">Questions, outdated guidance, suggestions, and missing doctrine—tracked until the right owner closes the loop.</p><FeedbackQueue initialItems={items} schemaReady={schemaReady} /></main>
}
