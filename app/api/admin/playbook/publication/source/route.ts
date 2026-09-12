import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isRoomLead } from '@/lib/playbook/entries'
import { PLAYBOOK_PUBLICATION_MANIFEST } from '@/lib/playbook/publication-manifest'
import { readPublicationSource } from '@/lib/playbook/publication-source'
import { requireRoomAccess } from '@/lib/playbook/rooms'
import { createServiceClient } from '@/lib/supabase/server'

const QuerySchema = z.object({
  key: z.string().trim().min(1).max(100),
  roomKey: z.string().trim().min(1).max(100),
})

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = QuerySchema.safeParse({ key: url.searchParams.get('key'), roomKey: url.searchParams.get('roomKey') })
  if (!parsed.success) return NextResponse.json({ error: 'A valid manifest key and room are required' }, { status: 400 })

  const item = PLAYBOOK_PUBLICATION_MANIFEST.find(candidate => candidate.key === parsed.data.key)
  if (!item || item.roomKey !== parsed.data.roomKey) {
    return NextResponse.json({ error: 'Publication target is not in the approved manifest' }, { status: 404 })
  }

  const auth = await requireRoomAccess(item.roomKey)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const service = createServiceClient()
  const { data: room, error: roomError } = await service
    .from('playbook_rooms')
    .select('id')
    .eq('key', item.roomKey)
    .maybeSingle()
  if (roomError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const roomId = (room as { id: string }).id

  const canAdopt = auth.staffRole === 'leadership' || (await isRoomLead(service, roomId, auth.user.id))
  if (!canAdopt) return NextResponse.json({ error: 'Only leadership or this room’s lead can preview doctrine adoption' }, { status: 403 })

  const { data: subgroup, error: subgroupError } = await service
    .from('playbook_sub_groups')
    .select('id')
    .eq('room_id', roomId)
    .eq('key', item.subgroupKey)
    .maybeSingle()
  if (subgroupError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!subgroup) return NextResponse.json({ error: 'Target subgroup is not installed' }, { status: 409 })

  try {
    const source = await readPublicationSource(item.sourcePath)
    return NextResponse.json(
      {
        data: {
          key: item.key,
          title: item.title,
          roomKey: item.roomKey,
          subgroupKey: item.subgroupKey,
          subGroupId: (subgroup as { id: string }).id,
          reviewerRoles: item.reviewerRoles,
          gamePlanKeys: item.gamePlanKeys,
          supersedesTitles: item.supersedesTitles,
          ...source,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to load the approved publication source' },
      { status: 500 }
    )
  }
}
