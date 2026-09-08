import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { logStaffAction } from '@/lib/staff/audit'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead, approveEntry, rejectEntry, editEntry } from '@/lib/playbook/entries'
import { safeParsePlaybookContent, type PlaybookEntryType } from '@/lib/playbook/content'
import { isReviewSchemaMissing } from '@/lib/playbook/reviews'
import { dependencyImpact, isOperationalV1SchemaMissing } from '@/lib/playbook/operational-v1'

// ─── /api/admin/playbook/entries/[id] — approve/reject/edit (31.2-04 Task 3) ─
// Mirrors the Tips approve/reject PATCH shape (app/api/admin/tips/[itemKey]/
// route.ts). approve/reject require server-derived approval authority
// (leadership OR isRoomLead) -- 403 otherwise. edit is forward-only: an
// approver's edit updates content in place (status stays published); a
// non-approver's edit lands as a new draft_content, never a direct publish
// (R9, T-31.2-10). Every branch audits via logStaffAction.

const EntryPatchSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'edit']),
    content: z.unknown().optional(),
    publish: z.boolean().optional(),
    expectedRevision: z.number().int().positive().optional(),
    expectedDraftVersion: z.number().int().nonnegative().optional(),
    reviewSummary: z.string().trim().min(1).max(2000).optional(),
    confirmDependencyImpact: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.expectedRevision === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedRevision'],
        message: 'expectedRevision is required',
      })
    }
    if (value.expectedDraftVersion === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedDraftVersion'],
        message: 'expectedDraftVersion is required',
      })
    }
    if (value.action !== 'edit' && (value.content !== undefined || value.publish !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'content and publish are valid only for edit actions',
      })
    }
    if (value.action === 'edit' && value.reviewSummary !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'reviewSummary is valid only for reviewer decisions' })
    }
  })

const idParamSchema = z.string().uuid()

function entryMutationErrorStatus(message: string): number {
  return message.startsWith('This entry changed') || message.startsWith('Entry has no pending draft') ? 409 : 500
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!idParamSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = EntryPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid playbook entry patch payload' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: entry, error: fetchError } = await service
    .from('playbook_entries')
    .select('id, room_id, entry_type')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

  const roomId = (entry as { room_id: string }).room_id

  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('key')
    .eq('id', roomId)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const auth = await requireRoomAccess((room as { key: string }).key)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const isApprover = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  const willPublish = isApprover && (parsed.data.action === 'approve' || (parsed.data.action === 'edit' && parsed.data.publish !== false))
  if (willPublish && !parsed.data.confirmDependencyImpact) {
    const dependencyResult = await service.from('playbook_doctrine_dependencies').select('active, source_revision_number, target_kind').eq('source_entry_id', id).eq('active', true)
    if (dependencyResult.error && !isOperationalV1SchemaMissing(dependencyResult.error)) return NextResponse.json({ error: dependencyResult.error.message }, { status: 500 })
    const impact = dependencyImpact((dependencyResult.data ?? []).map(row => ({ active: row.active, sourceRevisionNumber: Number(row.source_revision_number), targetKind: String(row.target_kind) })), (parsed.data.expectedRevision ?? 1) + 1)
    if (impact.blocksSilentPublish) return NextResponse.json({ error: `This change affects ${impact.affected} registered downstream ${impact.affected === 1 ? 'dependency' : 'dependencies'}. Review the Dependency Map before publishing.`, dependencyImpact: impact }, { status: 409 })
  }

  if (parsed.data.action === 'approve' || parsed.data.action === 'reject') {
    if (!isApprover) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const result =
      parsed.data.action === 'approve'
        ? await approveEntry(service, {
            id,
            approverId: auth.user.id,
            expectedRevision: parsed.data.expectedRevision,
            expectedDraftVersion: parsed.data.expectedDraftVersion,
          })
        : await rejectEntry(service, {
            id,
            expectedRevision: parsed.data.expectedRevision,
            expectedDraftVersion: parsed.data.expectedDraftVersion,
          })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: entryMutationErrorStatus(result.error) })
    }

    let reviewDecisionRecorded = true
    if (parsed.data.action === 'reject') {
      const reviewResult = await service.rpc('complete_playbook_review_round', {
        p_entry_id: id,
        p_actor_id: auth.user.id,
        p_target_draft_version: parsed.data.expectedDraftVersion,
        p_decision: 'declined',
      })
      if (reviewResult.error && !isReviewSchemaMissing(reviewResult.error)) reviewDecisionRecorded = false
    }
    if (parsed.data.reviewSummary) {
      const summaryResult = await service.rpc('record_playbook_review_decision_summary', {
        p_entry_id: id,
        p_actor_id: auth.user.id,
        p_target_draft_version: parsed.data.expectedDraftVersion,
        p_summary: parsed.data.reviewSummary,
      })
      if (summaryResult.error && !isReviewSchemaMissing(summaryResult.error)) reviewDecisionRecorded = false
    }

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: parsed.data.action === 'approve' ? 'approve_playbook_entry' : 'reject_playbook_entry',
      targetType: 'playbook_entry',
      targetId: id,
      changes: {
        action: parsed.data.action,
        expectedRevision: parsed.data.expectedRevision,
        expectedDraftVersion: parsed.data.expectedDraftVersion,
        reviewDecisionRecorded,
        reviewSummary: parsed.data.reviewSummary ?? null,
      },
    })

    return NextResponse.json({ data: result.data })
  }

  // action === 'edit'
  if (parsed.data.content === undefined) {
    return NextResponse.json({ error: 'content is required for an edit' }, { status: 400 })
  }

  const entryType = (entry as { entry_type: PlaybookEntryType }).entry_type
  const parsedContent = safeParsePlaybookContent(entryType, parsed.data.content)
  if (!parsedContent.success) {
    return NextResponse.json({ error: 'Invalid content for this playbook entry type' }, { status: 400 })
  }

  const result = await editEntry(service, {
    id,
    isApprover,
    incoming: parsedContent.data,
    publishRequested: parsed.data.publish,
    editorId: auth.user.id,
    expectedRevision: parsed.data.expectedRevision,
    expectedDraftVersion: parsed.data.expectedDraftVersion,
  })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: entryMutationErrorStatus(result.error) })
  }

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'edit_playbook_entry',
    targetType: 'playbook_entry',
    targetId: id,
    changes: {
      isApprover,
      publishRequested: parsed.data.publish ?? null,
      resultingStatus: result.data?.status ?? null,
      expectedRevision: parsed.data.expectedRevision,
      expectedDraftVersion: parsed.data.expectedDraftVersion,
    },
  })

  return NextResponse.json({ data: result.data })
}
