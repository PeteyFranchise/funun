import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createWorkAccessDeps, resolveWorkAccess } from '@/lib/catalogue/access'

const ClaimSchema = z
  .object({
    session_id: z.string().uuid(),
    takeover: z.boolean().optional().default(false),
  })
  .strict()

const ReleaseSchema = z
  .object({ session_id: z.string().uuid() })
  .strict()

type LockRpcRow = {
  granted: boolean
  out_block_id: string
  holder_user_id: string
  holder_session_id: string
  lease_expires_at: string
}

function present(row: LockRpcRow) {
  return {
    granted: row.granted,
    lock: {
      blockId: row.out_block_id,
      userId: row.holder_user_id,
      sessionId: row.holder_session_id,
      expiresAt: row.lease_expires_at,
    },
  }
}

async function authorize(workId: string) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) {
    return { response: NextResponse.json({ error: access.reason }, { status: access.status }) }
  }
  return { user }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params
  const auth = await authorize(workId)
  if ('response' in auth) return auth.response

  const parsed = ClaimSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lock payload' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.rpc('claim_work_lyric_block_lock', {
    p_work_id: workId,
    p_block_id: blockId,
    p_uid: auth.user.id,
    p_session_id: parsed.data.session_id,
    p_takeover: parsed.data.takeover,
  })
  if (error) {
    const status = error.message.includes('lyric_block_not_found') ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  const row = (data as LockRpcRow[] | null)?.[0]
  if (!row) return NextResponse.json({ error: 'Could not resolve section lock' }, { status: 500 })
  return NextResponse.json({ data: present(row) }, { status: row.granted ? 200 : 409 })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workId: string; blockId: string }> }
) {
  const { workId, blockId } = await params
  const auth = await authorize(workId)
  if ('response' in auth) return auth.response

  const parsed = ReleaseSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lock release payload' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.rpc('release_work_lyric_block_lock', {
    p_work_id: workId,
    p_block_id: blockId,
    p_uid: auth.user.id,
    p_session_id: parsed.data.session_id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { released: data === true, blockId } })
}
