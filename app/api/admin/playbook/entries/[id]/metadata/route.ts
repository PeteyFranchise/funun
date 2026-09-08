import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { isRoomLead, type PlaybookEntryRow } from '@/lib/playbook/entries'
import { logStaffAction } from '@/lib/staff/audit'

const TemplateLinkSchema = z
  .object({
    templateId: z.string().uuid(),
    relationshipKind: z.enum(['reference', 'required_reading']),
  })
  .strict()

const MetadataSchema = z
  .object({
    ownerId: z.string().uuid().nullable(),
    reviewDueAt: z.string().datetime({ offset: true }).nullable(),
    reviewIntervalDays: z.number().int().min(1).max(730).nullable(),
    templateLinks: z.array(TemplateLinkSchema).max(50),
    markReviewed: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.templateLinks.map(link => link.templateId)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templateLinks'], message: 'Duplicate template link' })
    }
  })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid entry id' }, { status: 400 })
  }
  const parsed = MetadataSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid Playbook metadata' }, { status: 400 })

  const service = createServiceClient()
  const { data: entry, error: entryError } = await service
    .from('playbook_entries')
    .select('id, room_id')
    .eq('id', id)
    .maybeSingle()
  if (entryError) return NextResponse.json({ error: entryError.message }, { status: 500 })
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
  const canManage = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (parsed.data.ownerId) {
    const { data: ownerRows, error: ownerError } = await service
      .from('funun_staff')
      .select('user_id')
      .eq('user_id', parsed.data.ownerId)
      .limit(1)
    if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 })
    if (!ownerRows?.length) return NextResponse.json({ error: 'Owner must be a Funūn Team Member' }, { status: 400 })
  }

  const templateIds = parsed.data.templateLinks.map(link => link.templateId)
  if (templateIds.length > 0) {
    const { data: templates, error: templatesError } = await service
      .from('member_game_plan_templates')
      .select('id')
      .in('id', templateIds)
    if (templatesError) return NextResponse.json({ error: templatesError.message }, { status: 500 })
    if ((templates ?? []).length !== templateIds.length) {
      return NextResponse.json({ error: 'One or more Gameplan templates do not exist' }, { status: 400 })
    }
  }

  const templateLinks = parsed.data.templateLinks.map(link => ({
    template_id: link.templateId,
    relationship_kind: link.relationshipKind,
  }))
  const { data: updated, error: updateError } = await service.rpc('set_playbook_entry_metadata', {
    p_entry_id: id,
    p_owner_id: parsed.data.ownerId,
    p_review_due_at: parsed.data.reviewDueAt,
    p_review_interval_days: parsed.data.reviewIntervalDays,
    p_template_links: templateLinks,
    p_actor_id: auth.user.id,
    p_mark_reviewed: parsed.data.markReviewed ?? false,
  })
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: links, error: linksError } = await service
    .from('playbook_entry_game_plan_links')
    .select('member_template_id, relationship_kind')
    .eq('entry_id', id)
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: parsed.data.markReviewed ? 'review_playbook_entry' : 'update_playbook_entry_metadata',
    targetType: 'playbook_entry',
    targetId: id,
    changes: {
      ownerId: parsed.data.ownerId,
      reviewDueAt: parsed.data.reviewDueAt,
      reviewIntervalDays: parsed.data.reviewIntervalDays,
      templateLinks,
      markReviewed: parsed.data.markReviewed ?? false,
    },
  })

  const row = updated as PlaybookEntryRow
  return NextResponse.json({
    data: {
      ...row,
      game_plan_links: links ?? [],
    },
  })
}
