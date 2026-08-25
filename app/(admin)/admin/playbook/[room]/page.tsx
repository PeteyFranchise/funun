export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireRoomAccessPage } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'
import { isRoomLead, listEntries, type PlaybookEntryRow } from '@/lib/playbook/entries'
import { EntryEditor } from '@/components/playbook/EntryEditor'

// ─── app/(admin)/admin/playbook/[room]/page.tsx (31.2-08 Task 1, R9) ───────
// A room's content page: guards via requireRoomAccessPage(roomKey) as a
// fail-closed SELF-guard (Rail 2's nav omission is UX only, never the
// authority — Pitfall 6), lists that room's published SOP/Topic entries,
// and mounts EntryEditor so members with room access can draft/edit —
// publishing directly for leadership/room-leads, submitting for approval
// otherwise (D-31.2-05/06). isApprover is derived the SAME way the plan-04
// routes derive it (leadership OR isRoomLead) so the "Publish" vs "Submit
// for approval" copy always matches what the routes will actually do.

type PlaybookRoomRow = { id: string; key: string; label: string; sensitive: boolean; coming_soon: boolean }

export default async function PlaybookRoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room: roomKey } = await params
  const auth = await requireRoomAccessPage(roomKey)

  const service = createServiceClient()
  const { data: roomData, error: roomError } = await service
    .from('playbook_rooms')
    .select('id, key, label, sensitive, coming_soon')
    .eq('key', roomKey)
    .maybeSingle()
  if (roomError || !roomData) redirect('/admin/playbook')

  const room = roomData as PlaybookRoomRow
  const isApprover = auth.staffRole === 'leadership' || (await isRoomLead(service, room.id, auth.user.id))

  const { data: viewerEntries, error: entriesError } = await listEntries(service, {
    roomId: room.id,
    viewerId: auth.user.id,
  })
  if (entriesError) throw new Error(`Failed to load Playbook entries: ${entriesError}`)

  // Approvers need to see EVERY pending draft in the room (not just their
  // own) to approve/reject them — listEntries only returns the caller's own
  // drafts by design (it also backs the plan-04 GET route's viewer-scoped
  // response). This is a page-only concern, so it queries directly rather
  // than growing entries.ts's contract for a single caller.
  let entries = viewerEntries
  if (isApprover) {
    const { data: pendingDrafts } = await service
      .from('playbook_entries')
      .select('*')
      .eq('room_id', room.id)
      .eq('status', 'draft_pending')
      .order('created_at', { ascending: false })
    const byId = new Map(entries.map(e => [e.id, e]))
    for (const draft of (pendingDrafts ?? []) as PlaybookEntryRow[]) byId.set(draft.id, draft)
    entries = Array.from(byId.values())
  }

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">{room.label}</h1>
      <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
        SOPs &amp; Topics for this room.{' '}
        {isApprover
          ? 'You can publish directly and approve pending drafts.'
          : 'Your entries are submitted for a room-lead or leadership to approve.'}
      </p>
      <div className="mt-6 max-w-[720px]">
        <EntryEditor roomKey={room.key} isApprover={isApprover} initialEntries={entries} />
      </div>
    </div>
  )
}
