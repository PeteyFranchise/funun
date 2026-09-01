import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'
import type { LyricBlock } from '@/types/catalogue'

const RestoreSchema = z
  .object({ session_id: z.string().uuid() })
  .strict()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string; snapshotId: string }> }
) {
  const { workId, blockId, snapshotId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const parsed = RestoreSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid restore payload' }, { status: 400 })

  const { data, error } = await supabase.rpc('restore_locked_lyric_block_snapshot', {
    p_work_id: workId,
    p_block_id: blockId,
    p_snapshot_id: snapshotId,
    p_session_id: parsed.data.session_id,
  })

  if (error || !data) {
    const message = error?.message ?? 'Could not restore this lyric version.'
    const status = message.includes('lyric_snapshot_not_found')
      ? 404
      : message.includes('lyric_lock_required') || message.includes('lyric_block_not_editable')
        ? 409
        : 500
    const publicMessage = status === 409
      ? 'This section must be free and reserved by this tab before restoring.'
      : status === 404
        ? 'That lyric version is no longer available.'
        : message
    return NextResponse.json({ error: publicMessage }, { status })
  }

  return NextResponse.json({ data: data as LyricBlock })
}
