import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess, createWorkAccessDeps } from '@/lib/catalogue/access'

type RouteCtx = { params: Promise<{ workId: string }> }

// Large audio bodies are never proxied through a serverless function. Current
// clients use /upload-intent followed by /complete, where storage metadata is
// authoritative. Keeping this authenticated tombstone gives stale clients an
// actionable upgrade response without buffering their multipart body.
export async function POST(_request: Request, { params }: RouteCtx) {
  const { workId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(
    createWorkAccessDeps(supabase),
    workId,
    user.id,
    'contribute'
  )
  if (!access.granted) {
    return NextResponse.json({ error: access.reason }, { status: access.status })
  }

  return NextResponse.json(
    {
      error: 'Direct audio uploads are no longer accepted. Refresh Funūn and try the upload again.',
      uploadFlow: 'signed-upload-intent',
    },
    { status: 410 }
  )
}
