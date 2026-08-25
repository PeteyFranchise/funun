import type { SupabaseClient } from '@supabase/supabase-js'
import { requireStaff, getStaffRoles, type StaffRole } from '@/lib/admin/gate'
import { createServiceClient } from '@/lib/supabase/server'

// ─── playbook_entries — SOP/Topic draft→publish store (31.2-04 Task 1) ────
// Generalizes the live Tips tip_draft→tip_approved flow
// (app/api/admin/tips/[itemKey]/route.ts, launchpad_checklist_items) into
// migration 130's per-room playbook_entries.content/draft_content/status
// shape (D-31.2-05/06). content/draft_content are JSONB — the shape differs
// by entry_type (sop checklist vs topic coaching bundle), so callers pass
// an opaque JSON-serializable value.
//
// isApprover is ALWAYS passed in pre-resolved — every function here trusts
// the caller (the ROUTE) to have derived it server-side from the session
// role + playbook_room_leads (leadership OR isRoomLead). Never derive it
// from a client-supplied flag (T-31.2-10, Pattern 2).

export type EntryType = 'sop' | 'topic'
export type EntryStatus = 'draft_pending' | 'published'
export type EntryContent = Record<string, unknown>

export type PlaybookEntryRow = {
  id: string
  room_id: string
  sub_group_id: string | null
  entry_type: EntryType
  title: string
  content: EntryContent
  draft_content: EntryContent | null
  status: EntryStatus
  author_id: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

// ─── Pure draft→publish transition helpers (the tested surface) ───────────

export type EntryWriteMutation =
  | { content: EntryContent; status: 'published' }
  | { draft_content: EntryContent; status: 'draft_pending' }

// An approver (leadership OR room-lead) writes directly to content with
// status='published' — no self-approval step. A non-approver's write lands
// as draft_content with status='draft_pending'; content is left untouched
// (the mutation object simply omits the content key).
export function resolveWrite(args: { isApprover: boolean; incoming: EntryContent }): EntryWriteMutation {
  if (args.isApprover) {
    return { content: args.incoming, status: 'published' }
  }
  return { draft_content: args.incoming, status: 'draft_pending' }
}

export type ApprovalMutation = { content: EntryContent; draft_content: null; status: 'published' }

// Promotes a pending draft to published content, clearing the draft.
export function applyApproval(row: { draft_content: EntryContent | null }): ApprovalMutation {
  return { content: row.draft_content ?? {}, draft_content: null, status: 'published' }
}

export type RejectMutation = { draft_content: null }

// Discards a pending draft without publishing — content/status untouched.
export function applyReject(): RejectMutation {
  return { draft_content: null }
}

// ─── isRoomLead — approval-authority resolver (D-31.2-02/06) ──────────────
// A member is an approver for a room if they are leadership (checked by the
// caller separately, cheaper, no DB read — structural) OR they hold a
// playbook_room_leads row for that room.
export async function isRoomLead(
  service: SupabaseClient,
  roomId: string,
  userId: string
): Promise<boolean> {
  const { data } = await service
    .from('playbook_room_leads')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

// ─── requireRoomAccess — room-scoped staff gate ────────────────────────────
// NOTE (31.2-04 deviation): 31.2-03 (a parallel wave-2 plan) is the intended
// canonical owner of lib/playbook/rooms.ts's requireRoomAccess/
// requireRoomAccessPage. Both plans execute in isolated worktrees within the
// same wave, so 31.2-03's file did not exist in this worktree when this plan
// ran. This is a minimal, spec-faithful local equivalent (composes
// requireStaff, leadership short-circuits with no extra DB read per
// Pitfall 5, otherwise checks playbook_room_role_grants for ANY of the
// caller's held roles) that unblocks this plan's routes now. It should be
// deleted and replaced with an import from '@/lib/playbook/rooms' once
// 31.2-03 merges — see 31.2-04-SUMMARY.md Deviations.
type StaffAuthResult = Awaited<ReturnType<typeof requireStaff>>
type StaffAuthFailure = Extract<StaffAuthResult, { error: string }>
type StaffAuthSuccess = Extract<StaffAuthResult, { staffRole: StaffRole }>

export async function requireRoomAccess(roomKey: string): Promise<StaffAuthFailure | StaffAuthSuccess> {
  const auth = await requireStaff()
  if ('error' in auth) return auth
  if (auth.staffRole === 'leadership') return auth // structural, never row-data (Pitfall 5)

  const service = createServiceClient()
  const { data: room } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', roomKey)
    .maybeSingle()
  if (!room) return { error: 'Forbidden', status: 403 }

  const roles = getStaffRoles(auth.user)
  const { data: grants } = await service
    .from('playbook_room_role_grants')
    .select('role')
    .eq('room_id', (room as { id: string }).id)
    .in('role', roles)

  if (!grants || grants.length === 0) return { error: 'Forbidden', status: 403 }

  return auth
}

// ─── Thin service-client CRUD ──────────────────────────────────────────────

export async function createEntry(
  service: SupabaseClient,
  args: {
    roomId: string
    subGroupId: string | null
    entryType: EntryType
    title: string
    incoming: EntryContent
    isApprover: boolean
    authorId: string
  }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const mutation = resolveWrite({ isApprover: args.isApprover, incoming: args.incoming })

  const insertRow: Record<string, unknown> = {
    room_id: args.roomId,
    sub_group_id: args.subGroupId,
    entry_type: args.entryType,
    title: args.title,
    author_id: args.authorId,
    status: mutation.status,
  }
  if ('content' in mutation) insertRow.content = mutation.content
  if ('draft_content' in mutation) insertRow.draft_content = mutation.draft_content

  const { data, error } = await service.from('playbook_entries').insert(insertRow).select().maybeSingle()

  return { data: (data as PlaybookEntryRow | null) ?? null, error: error?.message }
}

// Published entries are always visible; a caller's own drafts are also
// returned so an author can see their pending submission.
export async function listEntries(
  service: SupabaseClient,
  args: { roomId: string; viewerId: string }
): Promise<{ data: PlaybookEntryRow[]; error?: string }> {
  const { data: published, error: publishedError } = await service
    .from('playbook_entries')
    .select('*')
    .eq('room_id', args.roomId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (publishedError) return { data: [], error: publishedError.message }

  const { data: ownDrafts, error: draftsError } = await service
    .from('playbook_entries')
    .select('*')
    .eq('room_id', args.roomId)
    .eq('status', 'draft_pending')
    .eq('author_id', args.viewerId)
    .order('created_at', { ascending: false })
  if (draftsError) return { data: [], error: draftsError.message }

  return {
    data: [...((published as PlaybookEntryRow[] | null) ?? []), ...((ownDrafts as PlaybookEntryRow[] | null) ?? [])],
  }
}

export async function approveEntry(
  service: SupabaseClient,
  args: { id: string; approverId: string }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const { data: row, error: fetchError } = await service
    .from('playbook_entries')
    .select('draft_content')
    .eq('id', args.id)
    .maybeSingle()
  if (fetchError) return { data: null, error: fetchError.message }
  if (!row) return { data: null, error: 'Entry not found' }

  const mutation = applyApproval(row as { draft_content: EntryContent | null })

  const { data, error } = await service
    .from('playbook_entries')
    .update({ ...mutation, approved_by: args.approverId })
    .eq('id', args.id)
    .select()
    .maybeSingle()

  return { data: (data as PlaybookEntryRow | null) ?? null, error: error?.message }
}

export async function rejectEntry(
  service: SupabaseClient,
  args: { id: string }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const { data, error } = await service
    .from('playbook_entries')
    .update(applyReject())
    .eq('id', args.id)
    .select()
    .maybeSingle()

  return { data: (data as PlaybookEntryRow | null) ?? null, error: error?.message }
}

// A forward-only edit: an approver's edit updates content in place
// (status stays published); a non-approver's edit lands as a new
// draft_content awaiting approval — never a direct publish (R9).
export async function editEntry(
  service: SupabaseClient,
  args: { id: string; isApprover: boolean; incoming: EntryContent }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const mutation = resolveWrite({ isApprover: args.isApprover, incoming: args.incoming })

  const { data, error } = await service
    .from('playbook_entries')
    .update(mutation)
    .eq('id', args.id)
    .select()
    .maybeSingle()

  return { data: (data as PlaybookEntryRow | null) ?? null, error: error?.message }
}
