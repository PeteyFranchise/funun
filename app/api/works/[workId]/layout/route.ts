import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'
import { WriterRoomLayoutSchema } from '@/lib/catalogue/writer-room-layout'

type RouteCtx = { params: Promise<{ workId: string }> }

// PUT /api/works/[workId]/layout — private presentation state only.
// The authenticated identity supplies user_id; the body cannot name an
// account or a work. RLS independently repeats both row ownership and current
// work access, so losing room access also makes the saved layout unreachable.
export async function PUT(request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, userId, 'contribute')
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  const body = await request.json().catch(() => null)
  const parsed = WriterRoomLayoutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid room layout' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('work_room_layouts')
    .upsert(
      {
        work_id: workId,
        user_id: userId as string,
        layout: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'work_id,user_id' }
    )
    .select('layout, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Could not save the room layout' }, { status: 500 })
  }

  return NextResponse.json({ data })
}
