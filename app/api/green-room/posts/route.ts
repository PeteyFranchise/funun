import { NextResponse } from 'next/server'
import { createGreenRoomPost } from '@/lib/green-room/post-write'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST /api/green-room/posts
// Creates a draft or published Green Room post. All validation lives in
// lib/green-room/post-write.ts so the eventual UI and tests share the same
// composer contract.
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const result = await createGreenRoomPost(supabase, user.id, body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ data: result.post }, { status: 201 })
}

