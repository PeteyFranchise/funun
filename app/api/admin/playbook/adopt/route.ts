import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createEntry, editEntry, isRoomLead } from '@/lib/playbook/entries'
import {
  documentContent,
  DocumentContentSchema,
  PLAYBOOK_TITLE_MAX,
  readDocumentBody,
} from '@/lib/playbook/content'
import {
  classifyAdoption,
  normalizePlaybookSourcePath,
  playbookSourceHash,
  PLAYBOOK_SOURCE_PATH_MAX,
} from '@/lib/playbook/adoption'
import { PLAYBOOK_PUBLICATION_MANIFEST } from '@/lib/playbook/publication-manifest'
import { readPublicationSource } from '@/lib/playbook/publication-source'
import { logStaffAction } from '@/lib/staff/audit'

const AdoptionSchema = z
  .object({
    action: z.enum(['check', 'adopt', 'propose_update']),
    manifestKey: z.string().trim().min(1).max(100).optional(),
    roomKey: z.string().trim().min(1).max(100),
    subGroupId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(PLAYBOOK_TITLE_MAX),
    sourcePath: z.string().trim().min(1).max(PLAYBOOK_SOURCE_PATH_MAX),
    markdown: z.string().min(1),
  })
  .strict()

type ExistingSource = {
  id: string
  room_id: string
  source_hash: string | null
  title: string
  slug: string | null
  status: string
  content: Record<string, unknown>
  draft_content: Record<string, unknown> | null
  revision_number: number
  draft_version: number
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => ({}))) as unknown
  const parsed = AdoptionSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid doctrine adoption payload' }, { status: 400 })

  let sourcePath: string
  try {
    sourcePath = normalizePlaybookSourcePath(parsed.data.sourcePath)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid doctrine source path' },
      { status: 400 }
    )
  }

  const contentResult = DocumentContentSchema.safeParse(documentContent(parsed.data.markdown))
  if (!contentResult.success) {
    return NextResponse.json({ error: 'Markdown document is empty or too large' }, { status: 400 })
  }

  const auth = await requireRoomAccess(parsed.data.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', parsed.data.roomKey)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: roomError.message }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const roomId = (room as { id: string }).id

  const canAdopt = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canAdopt) return NextResponse.json({ error: 'Only leadership or this room’s lead can adopt doctrine' }, { status: 403 })

  if (parsed.data.subGroupId) {
    const { data: subgroup, error: subgroupError } = await service
      .from('playbook_sub_groups')
      .select('id')
      .eq('id', parsed.data.subGroupId)
      .eq('room_id', roomId)
      .maybeSingle()
    if (subgroupError) return NextResponse.json({ error: subgroupError.message }, { status: 500 })
    if (!subgroup) return NextResponse.json({ error: 'Subgroup does not belong to this room' }, { status: 400 })
  }

  if (parsed.data.manifestKey) {
    const manifestItem = PLAYBOOK_PUBLICATION_MANIFEST.find(item => item.key === parsed.data.manifestKey)
    const manifestMatches =
      manifestItem?.roomKey === parsed.data.roomKey &&
      manifestItem.title === parsed.data.title &&
      manifestItem.sourcePath === sourcePath
    if (!manifestMatches || !manifestItem) {
      return NextResponse.json({ error: 'Guided adoption payload does not match the approved manifest' }, { status: 409 })
    }
    const canonicalSource = await readPublicationSource(manifestItem.sourcePath).catch(() => null)
    if (!canonicalSource || canonicalSource.markdown !== contentResult.data.body) {
      return NextResponse.json({ error: 'Guided adoption source changed during review. Reload and verify it again.' }, { status: 409 })
    }
  }

  const sourceHash = playbookSourceHash(contentResult.data.body)
  const { data: existingData, error: existingError } = await service
    .from('playbook_entries')
    .select('id, room_id, source_hash, title, slug, status, content, draft_content, revision_number, draft_version')
    .eq('source_kind', 'adopted_markdown')
    .eq('source_path', sourcePath)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const existing = (existingData as ExistingSource | null) ?? null
  const state = classifyAdoption({ targetRoomId: roomId, sourceHash, existing })
  const publicExisting =
    existing?.room_id === roomId
      ? {
          id: existing.id,
          title: existing.title,
          slug: existing.slug,
          status: existing.status,
          publishedBody: readDocumentBody(existing.content),
          hasPendingDraft: existing.draft_content !== null,
          revisionNumber: existing.revision_number,
          draftVersion: existing.draft_version,
        }
      : null

  if (parsed.data.action === 'check') {
    return NextResponse.json({ data: { state, sourcePath, sourceHash, existing: publicExisting } })
  }

  if (parsed.data.action === 'propose_update') {
    if (state !== 'changed' || !existing || existing.room_id !== roomId) {
      return NextResponse.json({ error: 'A changed source in this room is required' }, { status: 409 })
    }
    if (existing.draft_content) {
      return NextResponse.json(
        { error: 'This entry already has a pending draft. Review or reject it before proposing another source update.' },
        { status: 409 }
      )
    }

    const result = await editEntry(service, {
      id: existing.id,
      isApprover: true,
      incoming: contentResult.data,
      publishRequested: false,
      editorId: auth.user.id,
      expectedRevision: existing.revision_number,
      expectedDraftVersion: existing.draft_version,
      draftSourceHash: sourceHash,
    })
    if (result.error) return NextResponse.json({ error: result.error }, { status: 409 })

    await logStaffAction(service, {
      actorId: auth.user.id,
      action: 'propose_playbook_source_revision',
      targetType: 'playbook_entry',
      targetId: existing.id,
      changes: {
        roomKey: parsed.data.roomKey,
        sourcePath,
        previousSourceHash: existing.source_hash,
        proposedSourceHash: sourceHash,
      },
    })

    return NextResponse.json({ data: { state: 'update_proposed', entry: result.data } })
  }

  if (state !== 'available') {
    const error =
      state === 'unchanged'
        ? 'This exact source has already been adopted'
        : state === 'changed'
          ? 'The repository source changed. Review it against the existing entry; Funūn will not overwrite it automatically.'
          : 'This source has already been adopted in another Playbook room'
    return NextResponse.json({ error, data: { state, existing: publicExisting } }, { status: 409 })
  }

  const adoptedAt = new Date().toISOString()
  const result = await createEntry(service, {
    roomId,
    subGroupId: parsed.data.subGroupId ?? null,
    entryType: 'document',
    title: parsed.data.title,
    incoming: contentResult.data,
    isApprover: true,
    publishRequested: false,
    authorId: auth.user.id,
    source: { kind: 'adopted_markdown', path: sourcePath, hash: sourceHash, adoptedAt },
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  await logStaffAction(service, {
    actorId: auth.user.id,
    action: 'adopt_playbook_doctrine_draft',
    targetType: 'playbook_entry',
    targetId: result.data?.id ?? null,
    changes: { roomKey: parsed.data.roomKey, sourcePath, sourceHash, status: result.data?.status ?? null },
  })

  return NextResponse.json({ data: { state: 'adopted', entry: result.data } })
}
