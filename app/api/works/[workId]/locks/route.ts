import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  const service = createServiceClient()
  const { data, error } = await service
    .from('work_lyric_block_locks')
    .select('block_id, user_id, session_id, expires_at')
    .eq('work_id', workId)
    .gt('expires_at', new Date().toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const locks = (data ?? []).map(row => ({
    blockId: row.block_id,
    userId: row.user_id,
    sessionId: row.session_id,
    expiresAt: row.expires_at,
  }))
  return NextResponse.json({ data: locks })
}
