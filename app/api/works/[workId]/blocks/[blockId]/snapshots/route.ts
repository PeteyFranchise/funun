import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import type { LyricBlockSnapshot, LyricBlockSnapshotView } from '@/types/catalogue'

type SnapshotRow = Omit<LyricBlockSnapshot, 'capture_key'>

type ProfileRow = {
  id: string
  artist_name: string | null
  handle: string | null
}

// Recovery history is private Writer's Room data. Access is checked before
// returning text or resolving member display names; no public profile route
// or public diary table is used as a shortcut.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const { data: block, error: blockError } = await supabase
    .from('lyric_blocks')
    .select('id, text')
    .eq('id', blockId)
    .eq('work_id', workId)
    .maybeSingle()

  if (blockError) return NextResponse.json({ error: blockError.message }, { status: 500 })
  if (!block) return NextResponse.json({ error: 'Block not found.' }, { status: 404 })

  const { data, error } = await supabase
    .from('work_lyric_block_snapshots')
    .select('id, work_id, block_id, reason, text, captured_by_user_id, created_at')
    .eq('work_id', workId)
    .eq('block_id', blockId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const snapshots = ((data ?? []) as SnapshotRow[])
  const actorIds = Array.from(
    new Set(snapshots.map(snapshot => snapshot.captured_by_user_id).filter((id): id is string => Boolean(id)))
  )
  const names = new Map<string, string>()

  if (actorIds.length > 0) {
    const service = createServiceClient()
    const { data: profiles } = await service
      .from('user_profiles')
      .select('id, artist_name, handle')
      .in('id', actorIds)

    for (const profile of ((profiles ?? []) as ProfileRow[])) {
      names.set(profile.id, profile.artist_name?.trim() || profile.handle || 'A writer')
    }
  }

  const presented: LyricBlockSnapshotView[] = snapshots.map(snapshot => ({
    id: snapshot.id,
    block_id: snapshot.block_id,
    reason: snapshot.reason,
    text: snapshot.text,
    created_at: snapshot.created_at,
    actorName: snapshot.captured_by_user_id
      ? (names.get(snapshot.captured_by_user_id) ?? 'A writer')
      : 'A writer',
  }))

  return NextResponse.json({ data: presented, currentText: block.text })
}
