import { z } from 'zod'
import type { EntryContent, EntryType } from '@/lib/playbook/entries'
import { readDocumentBody } from '@/lib/playbook/content'

export const REVIEW_SCHEMA_UNAVAILABLE = 'Playbook review notes are not available until migration 204 is applied.'

export type ReviewAnchor = {
  kind: 'overall' | 'heading' | 'list_item'
  index: number | null
  label: string | null
}

export type PlaybookReviewThread = {
  id: string
  entry_id: string
  room_id: string
  review_round_id: string
  target_kind: 'draft' | 'published'
  target_revision_number: number
  target_draft_version: number | null
  anchor_kind: ReviewAnchor['kind']
  anchor_index: number | null
  anchor_label: string | null
  feedback_kind: 'suggestion' | 'requested_change'
  status: 'open' | 'addressed' | 'resolved'
  created_by: string
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  addressed_by: string | null
  addressed_at: string | null
  round_status: PlaybookReviewRoundStatus
  content_snapshot: EntryContent
  messages: PlaybookReviewMessage[]
}

export type PlaybookReviewRoundStatus =
  | 'awaiting_review'
  | 'changes_requested'
  | 'ready_for_rereview'
  | 'approved'
  | 'declined'
  | 'superseded'

export type PlaybookReviewRound = {
  id: string
  entry_id: string
  room_id: string
  target_kind: 'draft' | 'published'
  target_revision_number: number
  target_draft_version: number | null
  content_snapshot: EntryContent
  status: PlaybookReviewRoundStatus
  submitted_by: string
  previous_round_id: string | null
  created_at: string
  decided_by: string | null
  decided_at: string | null
  decision_summary?: string | null
}

export type PlaybookReviewMessage = {
  id: string
  thread_id: string
  body: string
  created_by: string
  created_at: string
  mentions: string[]
}

export const ReviewCreateSchema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  targetKind: z.enum(['draft', 'published']),
  expectedRevision: z.number().int().positive(),
  expectedDraftVersion: z.number().int().positive().nullable(),
  anchorKind: z.enum(['overall', 'heading', 'list_item']),
  anchorIndex: z.number().int().nonnegative().nullable(),
  anchorLabel: z.string().trim().max(240).nullable(),
  feedbackKind: z.enum(['suggestion', 'requested_change']),
  body: z.string().trim().min(1).max(4000),
  mentionedUserIds: z.array(z.string().uuid()).max(20).default([]),
}).strict()

export const ReviewReplySchema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(4000),
  mentionedUserIds: z.array(z.string().uuid()).max(20).default([]),
}).strict()

export const ReviewResubmitSchema = z.object({
  roomKey: z.string().trim().min(1).max(80),
  previousRoundId: z.string().uuid(),
  expectedDraftVersion: z.number().int().positive(),
}).strict()

export function reviewAnchors(entryType: EntryType, content: EntryContent): ReviewAnchor[] {
  const anchors: ReviewAnchor[] = [{ kind: 'overall', index: null, label: null }]
  if (entryType === 'document') {
    const body = readDocumentBody(content) ?? ''
    for (const match of body.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
      const label = match[1]?.trim()
      if (label) anchors.push({ kind: 'heading', index: anchors.length - 1, label: label.slice(0, 240) })
    }
    return anchors
  }
  const key = entryType === 'sop' ? 'items' : 'questions'
  const values = Array.isArray(content[key]) ? content[key] : []
  values.forEach((value, index) => {
    if (typeof value === 'string' && value.trim()) {
      anchors.push({ kind: 'list_item', index, label: value.trim().slice(0, 240) })
    }
  })
  return anchors
}

export function isValidReviewAnchor(anchor: ReviewAnchor, anchors: readonly ReviewAnchor[]): boolean {
  return anchors.some(candidate =>
    candidate.kind === anchor.kind && candidate.index === anchor.index && candidate.label === anchor.label
  )
}

export function isReviewSchemaMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')
    || /playbook_review_(threads|messages|mentions)|playbook_review_thread/i.test(error.message ?? '')
}

export function canReplyToReview(args: {
  viewerId: string
  isApprover: boolean
  entryAuthorId: string | null
  draftAuthorId: string | null
  threadCreatorId: string
  mentionedUserIds: readonly string[]
}): boolean {
  return args.isApprover || [args.entryAuthorId, args.draftAuthorId, args.threadCreatorId].includes(args.viewerId) || args.mentionedUserIds.includes(args.viewerId)
}

export function canAddressReview(args: {
  viewerId: string
  entryAuthorId: string | null
  draftAuthorId: string | null
  feedbackKind: PlaybookReviewThread['feedback_kind']
  status: PlaybookReviewThread['status']
}): boolean {
  return args.feedbackKind === 'requested_change'
    && args.status === 'open'
    && [args.entryAuthorId, args.draftAuthorId].includes(args.viewerId)
}

export function canResubmitReview(args: {
  currentDraftVersion: number
  previousDraftVersion: number | null
  requestedThreadStatuses: readonly PlaybookReviewThread['status'][]
}): boolean {
  return args.previousDraftVersion !== null
    && args.currentDraftVersion > args.previousDraftVersion
    && args.requestedThreadStatuses.every(status => status !== 'open')
}
