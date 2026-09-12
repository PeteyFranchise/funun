import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { slugifyPlaybookTitle, type PlaybookEntryType } from '@/lib/playbook/content'

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

export type EntryType = PlaybookEntryType
export type EntryStatus = 'draft_pending' | 'published' | 'archived' | 'superseded'
export type EntryContent = Record<string, unknown>

export type PlaybookEntryRow = {
  id: string
  room_id: string
  sub_group_id: string | null
  entry_type: EntryType
  title: string
  slug?: string | null
  content: EntryContent
  draft_content: EntryContent | null
  draft_author_id?: string | null
  draft_updated_at?: string | null
  draft_version?: number
  status: EntryStatus
  author_id: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
  published_at?: string | null
  revision_number?: number
  owner_id?: string | null
  review_due_at?: string | null
  review_interval_days?: number | null
  last_reviewed_at?: string | null
  last_reviewed_by?: string | null
  source_kind?: 'native' | 'adopted_markdown'
  source_path?: string | null
  source_hash?: string | null
  draft_source_hash?: string | null
  adopted_at?: string | null
  game_plan_links?: Array<{
    member_template_id: string
    relationship_kind: 'reference' | 'required_reading'
  }>
}

// ─── Pure draft→publish transition helpers (the tested surface) ───────────

export type EntryWriteMutation =
  | { content: EntryContent; draft_content: null; status: 'published' }
  | { draft_content: EntryContent; status: 'draft_pending' | 'published' }

// An approver (leadership OR room-lead) writes directly to content with
// status='published' — no self-approval step. A non-approver's write lands
// as draft_content with status='draft_pending'; content is left untouched
// (the mutation object simply omits the content key).
export function resolveWrite(args: {
  isApprover: boolean
  incoming: EntryContent
  publishRequested?: boolean
  currentStatus?: EntryStatus
}): EntryWriteMutation {
  if (args.isApprover && args.publishRequested !== false) {
    return { content: args.incoming, draft_content: null, status: 'published' }
  }
  return {
    draft_content: args.incoming,
    status: args.currentStatus === 'published' ? 'published' : 'draft_pending',
  }
}

export type ApprovalMutation = { content: EntryContent; draft_content: null; status: 'published' }

// Promotes a pending draft to published content, clearing the draft.
export function applyApproval(row: { draft_content: EntryContent | null }): ApprovalMutation {
  if (!row.draft_content) throw new Error('Entry has no pending draft to approve')
  return { content: row.draft_content, draft_content: null, status: 'published' }
}

export type RejectMutation = { draft_content: null; status?: 'archived' }

// Discards a pending draft without publishing — content/status untouched.
export function applyReject(currentStatus: EntryStatus = 'published'): RejectMutation {
  return currentStatus === 'draft_pending'
    ? { draft_content: null, status: 'archived' }
    : { draft_content: null }
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
    publishRequested?: boolean
    authorId: string
    source?: {
      kind: 'adopted_markdown'
      path: string
      hash: string
      adoptedAt: string
    }
  }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const mutation = resolveWrite({
    isApprover: args.isApprover,
    incoming: args.incoming,
    publishRequested: args.publishRequested,
  })

  const insertRow: Record<string, unknown> = {
    room_id: args.roomId,
    sub_group_id: args.subGroupId,
    entry_type: args.entryType,
    title: args.title,
    slug: `${slugifyPlaybookTitle(args.title)}-${randomUUID().slice(0, 8)}`,
    author_id: args.authorId,
    status: mutation.status,
    owner_id: args.authorId,
  }
  if ('content' in mutation) insertRow.content = mutation.content
  if (mutation.draft_content) {
    insertRow.draft_content = mutation.draft_content
    insertRow.draft_author_id = args.authorId
    insertRow.draft_updated_at = new Date().toISOString()
    insertRow.draft_version = 1
  }
  if (args.source) {
    insertRow.source_kind = args.source.kind
    insertRow.source_path = args.source.path
    insertRow.source_hash = args.source.hash
    insertRow.adopted_at = args.source.adoptedAt
  }

  const { data, error } = await service.from('playbook_entries').insert(insertRow).select().maybeSingle()

  return { data: (data as PlaybookEntryRow | null) ?? null, error: error?.message }
}

// Published entries are always visible; a caller's own drafts are also
// returned so an author can see their pending submission.
export async function listEntries(
  service: SupabaseClient,
  args: { roomId: string; viewerId: string; canReviewAll?: boolean }
): Promise<{ data: PlaybookEntryRow[]; error?: string }> {
  const { data: published, error: publishedError } = await service
    .from('playbook_entries')
    .select('*')
    .eq('room_id', args.roomId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (publishedError) return { data: [], error: 'Playbook entries could not be loaded.' }

  let draftsQuery = service
    .from('playbook_entries')
    .select('*')
    .eq('room_id', args.roomId)
    .not('draft_content', 'is', null)
    .order('created_at', { ascending: false })
  if (!args.canReviewAll) draftsQuery = draftsQuery.eq('draft_author_id', args.viewerId)
  const { data: visibleDrafts, error: draftsError } = await draftsQuery
  if (draftsError) return { data: [], error: 'Playbook entries could not be loaded.' }

  let retired: PlaybookEntryRow[] = []
  if (args.canReviewAll) {
    const { data: retiredData, error: retiredError } = await service
      .from('playbook_entries')
      .select('*')
      .eq('room_id', args.roomId)
      .in('status', ['archived', 'superseded'])
      .order('updated_at', { ascending: false })
    if (retiredError) return { data: [], error: 'Playbook entries could not be loaded.' }
    retired = (retiredData as PlaybookEntryRow[] | null) ?? []
  }

  return {
    data: [
      ...mergeVisibleEntries(
        (published as PlaybookEntryRow[] | null) ?? [],
        (visibleDrafts as PlaybookEntryRow[] | null) ?? []
      ),
      ...retired,
    ],
  }
}

export async function setEntryLifecycle(
  service: SupabaseClient,
  args: {
    id: string
    action: 'archive' | 'supersede' | 'restore'
    expectedRevision: number
    expectedDraftVersion: number
  }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const status: EntryStatus =
    args.action === 'archive' ? 'archived' : args.action === 'supersede' ? 'superseded' : 'published'
  let query = service
    .from('playbook_entries')
    .update({ status })
    .eq('id', args.id)
    .eq('revision_number', args.expectedRevision)
    .eq('draft_version', args.expectedDraftVersion)
    .is('draft_content', null)
  query = args.action === 'restore'
    ? query.in('status', ['archived', 'superseded']).not('published_at', 'is', null)
    : query.eq('status', 'published')
  const { data, error } = await query
    .select()
    .maybeSingle()
  if (error) return { data: null, error: 'Playbook entry could not be loaded.' }
  if (!data) {
    return {
      data: null,
      error: 'This entry changed, has a pending draft, or cannot make that lifecycle transition. Refresh and try again.',
    }
  }
  return { data: data as PlaybookEntryRow }
}

/**
 * Published rows are fetched with the service role, so their pending draft
 * fields must be removed before they cross the API boundary. A second,
 * viewer-scoped query supplies only drafts that this caller may review.
 */
export function mergeVisibleEntries(
  published: PlaybookEntryRow[],
  visibleDrafts: PlaybookEntryRow[]
): PlaybookEntryRow[] {
  const byId = new Map<string, PlaybookEntryRow>()
  for (const row of published) {
    byId.set(row.id, {
      ...row,
      draft_content: null,
      draft_author_id: null,
      draft_updated_at: null,
      draft_version: 0,
      draft_source_hash: null,
    })
  }
  for (const row of visibleDrafts) byId.set(row.id, row)
  return Array.from(byId.values())
}

export async function approveEntry(
  service: SupabaseClient,
  args: { id: string; approverId: string; expectedRevision?: number; expectedDraftVersion?: number }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const { data: row, error: fetchError } = await service
    .from('playbook_entries')
    .select('draft_content, revision_number, draft_version, source_hash, draft_source_hash')
    .eq('id', args.id)
    .maybeSingle()
  if (fetchError) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!row) return { data: null, error: 'Entry not found' }

  let mutation: ApprovalMutation
  try {
    mutation = applyApproval(row as { draft_content: EntryContent | null })
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Entry has no pending draft to approve' }
  }

  const currentRevision = Number((row as { revision_number?: number }).revision_number ?? 1)
  const expectedRevision = args.expectedRevision ?? currentRevision
  const currentDraftVersion = Number((row as { draft_version?: number }).draft_version ?? 0)
  const expectedDraftVersion = args.expectedDraftVersion ?? currentDraftVersion
  const sourceHash = (row as { source_hash?: string | null; draft_source_hash?: string | null }).draft_source_hash
    ?? (row as { source_hash?: string | null }).source_hash

  const { data, error } = await service
    .from('playbook_entries')
    .update({
      ...mutation,
      draft_author_id: null,
      draft_updated_at: null,
      draft_version: 0,
      approved_by: args.approverId,
      source_hash: sourceHash,
      draft_source_hash: null,
    })
    .eq('id', args.id)
    .eq('revision_number', expectedRevision)
    .eq('draft_version', expectedDraftVersion)
    .select()
    .maybeSingle()

  if (error) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!data) return { data: null, error: 'This entry changed in another session. Refresh before approving.' }
  return { data: data as PlaybookEntryRow }
}

export async function rejectEntry(
  service: SupabaseClient,
  args: { id: string; expectedRevision?: number; expectedDraftVersion?: number }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const { data: row, error: fetchError } = await service
    .from('playbook_entries')
    .select('status, revision_number, draft_version, draft_content')
    .eq('id', args.id)
    .maybeSingle()
  if (fetchError) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!row) return { data: null, error: 'Entry not found' }
  if (!(row as { draft_content: EntryContent | null }).draft_content) {
    return { data: null, error: 'Entry has no pending draft to reject' }
  }

  const currentRevision = Number((row as { revision_number?: number }).revision_number ?? 1)
  const currentDraftVersion = Number((row as { draft_version?: number }).draft_version ?? 0)
  const { data, error } = await service
    .from('playbook_entries')
    .update({
      ...applyReject((row as { status: EntryStatus }).status),
      draft_author_id: null,
      draft_updated_at: null,
      draft_version: 0,
      draft_source_hash: null,
    })
    .eq('id', args.id)
    .eq('revision_number', args.expectedRevision ?? currentRevision)
    .eq('draft_version', args.expectedDraftVersion ?? currentDraftVersion)
    .select()
    .maybeSingle()

  if (error) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!data) return { data: null, error: 'This entry changed in another session. Refresh before rejecting.' }
  return { data: data as PlaybookEntryRow }
}

// A forward-only edit: an approver's edit updates content in place
// (status stays published); a non-approver's edit lands as a new
// draft_content awaiting approval — never a direct publish (R9).
export async function editEntry(
  service: SupabaseClient,
  args: {
    id: string
    isApprover: boolean
    incoming: EntryContent
    publishRequested?: boolean
    editorId: string
    expectedRevision?: number
    expectedDraftVersion?: number
    draftSourceHash?: string
  }
): Promise<{ data: PlaybookEntryRow | null; error?: string }> {
  const { data: current, error: fetchError } = await service
    .from('playbook_entries')
    .select('status, revision_number, draft_version')
    .eq('id', args.id)
    .maybeSingle()
  if (fetchError) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!current) return { data: null, error: 'Entry not found' }

  const mutation = resolveWrite({
    isApprover: args.isApprover,
    incoming: args.incoming,
    publishRequested: args.publishRequested,
    currentStatus: (current as { status: EntryStatus }).status,
  })

  const update: Record<string, unknown> = { ...mutation }
  const currentDraftVersion = Number((current as { draft_version?: number }).draft_version ?? 0)
  if (mutation.draft_content) {
    update.draft_author_id = args.editorId
    update.draft_updated_at = new Date().toISOString()
    update.draft_version = currentDraftVersion + 1
    if (args.draftSourceHash) update.draft_source_hash = args.draftSourceHash
  } else {
    update.draft_author_id = null
    update.draft_updated_at = null
    update.draft_version = 0
    update.approved_by = args.editorId
    if (args.draftSourceHash) update.source_hash = args.draftSourceHash
    update.draft_source_hash = null
  }

  const currentRevision = Number((current as { revision_number?: number }).revision_number ?? 1)

  const { data, error } = await service
    .from('playbook_entries')
    .update(update)
    .eq('id', args.id)
    .eq('revision_number', args.expectedRevision ?? currentRevision)
    .eq('draft_version', args.expectedDraftVersion ?? currentDraftVersion)
    .select()
    .maybeSingle()

  if (error) return { data: null, error: 'Playbook entry could not be updated.' }
  if (!data) return { data: null, error: 'This entry changed in another session. Refresh before saving.' }
  return { data: data as PlaybookEntryRow }
}
