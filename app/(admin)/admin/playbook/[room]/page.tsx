export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { canAccessRoom, requireRoomAccessPage } from '@/lib/playbook/rooms'
import type { StaffRole } from '@/lib/admin/staff-role'
import { createServiceClient } from '@/lib/supabase/server'
import { isRoomLead, listEntries } from '@/lib/playbook/entries'
import { EntryEditor } from '@/components/playbook/EntryEditor'
import { isReviewSchemaMissing } from '@/lib/playbook/reviews'

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
type PlaybookSubGroupRow = { id: string; key: string; label: string; sort_order: number }
type StaffRow = { user_id: string; display_name: string | null; staff_role: StaffRole; staff_roles: StaffRole[] | null }
type GamePlanTemplateRow = { id: string; title: string; beta_only: boolean }
type GamePlanLinkRow = {
  entry_id: string
  member_template_id: string
  relationship_kind: 'reference' | 'required_reading'
}

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

  const { data: subgroupData, error: subgroupError } = await service
    .from('playbook_sub_groups')
    .select('id, key, label, sort_order')
    .eq('room_id', room.id)
    .order('sort_order', { ascending: true })
  if (subgroupError) throw new Error(`Failed to load Playbook subgroups: ${subgroupError.message}`)
  const subgroups = (subgroupData ?? []) as PlaybookSubGroupRow[]

  const { data: viewerEntries, error: entriesError } = await listEntries(service, {
    roomId: room.id,
    viewerId: auth.user.id,
    canReviewAll: isApprover,
  })
  if (entriesError) throw new Error(`Failed to load Playbook entries: ${entriesError}`)

  // A tagged Team Member must be able to open the pending entry that contains
  // their review thread, without widening every room member's draft access.
  let entriesVisibleToViewer = viewerEntries
  if (!isApprover) {
    const mentionResult = await service
      .from('playbook_review_mentions')
      .select('message_id')
      .eq('user_id', auth.user.id)
    if (mentionResult.error && !isReviewSchemaMissing(mentionResult.error)) {
      throw new Error(`Failed to load tagged Playbook reviews: ${mentionResult.error.message}`)
    }
    const messageIds = (mentionResult.data ?? []).map(row => row.message_id as string)
    const messageResult = messageIds.length
      ? await service.from('playbook_review_messages').select('thread_id').in('id', messageIds)
      : { data: [], error: null }
    if (messageResult.error) throw new Error(`Failed to load tagged Playbook review messages: ${messageResult.error.message}`)
    const threadIds = Array.from(new Set((messageResult.data ?? []).map(row => row.thread_id as string)))
    const threadResult = threadIds.length
      ? await service.from('playbook_review_threads').select('entry_id').in('id', threadIds).eq('room_id', room.id)
      : { data: [], error: null }
    if (threadResult.error) throw new Error(`Failed to load tagged Playbook review threads: ${threadResult.error.message}`)
    const taggedEntryIds = Array.from(new Set((threadResult.data ?? []).map(row => row.entry_id as string)))
      .filter(id => !viewerEntries.some(entry => entry.id === id))
    if (taggedEntryIds.length) {
      const taggedEntries = await service.from('playbook_entries').select('*').in('id', taggedEntryIds).eq('room_id', room.id)
      if (taggedEntries.error) throw new Error(`Failed to load tagged Playbook entries: ${taggedEntries.error.message}`)
      entriesVisibleToViewer = [...viewerEntries, ...((taggedEntries.data ?? []) as typeof viewerEntries)]
    }
  }

  const entryIds = entriesVisibleToViewer.map(entry => entry.id)
  const [{ data: staffData, error: staffError }, { data: templateData, error: templateError }, linksResult, grantsResult] =
    await Promise.all([
      service.from('funun_staff').select('user_id, display_name, staff_role, staff_roles').order('display_name'),
      service.from('member_game_plan_templates').select('id, title, beta_only').eq('active', true).order('title'),
      entryIds.length > 0
        ? service
            .from('playbook_entry_game_plan_links')
            .select('entry_id, member_template_id, relationship_kind')
            .in('entry_id', entryIds)
        : Promise.resolve({ data: [], error: null }),
      service.from('playbook_room_role_grants').select('role').eq('room_id', room.id),
    ])
  if (staffError) throw new Error(`Failed to load Playbook owners: ${staffError.message}`)
  if (templateError) throw new Error(`Failed to load Gameplan templates: ${templateError.message}`)
  if (linksResult.error) throw new Error(`Failed to load Playbook Gameplan links: ${linksResult.error.message}`)
  if (grantsResult.error) throw new Error(`Failed to load Playbook room grants: ${grantsResult.error.message}`)

  const linksByEntry = new Map<string, GamePlanLinkRow[]>()
  for (const link of (linksResult.data ?? []) as GamePlanLinkRow[]) {
    linksByEntry.set(link.entry_id, [...(linksByEntry.get(link.entry_id) ?? []), link])
  }
  const entries = entriesVisibleToViewer.map(entry => ({
    ...entry,
    game_plan_links: (linksByEntry.get(entry.id) ?? []).map(link => ({
      member_template_id: link.member_template_id,
      relationship_kind: link.relationship_kind,
    })),
  }))

  const staffById = new Map<string, string>()
  const grantedRoles = (grantsResult.data ?? []).map(row => row.role as StaffRole)
  for (const row of (staffData ?? []) as StaffRow[]) {
    const roles = row.staff_roles?.length ? row.staff_roles : [row.staff_role]
    if (!canAccessRoom(roles, grantedRoles)) continue
    if (!staffById.has(row.user_id)) staffById.set(row.user_id, row.display_name?.trim() || 'Team Member')
  }
  const staff = Array.from(staffById, ([userId, label]) => ({ userId, label }))
  const gamePlans = ((templateData ?? []) as GamePlanTemplateRow[]).map(template => ({
    id: template.id,
    title: template.title,
    betaOnly: template.beta_only,
  }))

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-[color:var(--ink)]">{room.label}</h1>
      <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
        SOPs, Topics &amp; Documents for this room.{' '}
        {isApprover
          ? 'You can publish directly and approve pending drafts.'
          : 'Your entries are submitted for a room-lead or leadership to approve.'}
      </p>
      <div className="mt-6 max-w-[1100px]">
        <EntryEditor
          viewerId={auth.user.id}
          roomKey={room.key}
          roomLabel={room.label}
          isApprover={isApprover}
          initialEntries={entries}
          subgroups={subgroups}
          staff={staff}
          gamePlans={gamePlans}
        />
      </div>
    </div>
  )
}
