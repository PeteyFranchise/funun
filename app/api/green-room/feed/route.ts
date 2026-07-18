import { NextResponse } from 'next/server'
import { isGreenRoomTab, type GreenRoomTab } from '@/lib/green-room/feed'
import {
  clampFeedLimit,
  loadGreenRoomFeed,
  parseFeedCursor,
} from '@/lib/green-room/feed-query'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/green-room/feed?tab=for_you&cursor=<opaque>&limit=20
// Returns typed Green Room cards only. Reads use the session-bound Supabase
// client so migration 057's RLS + green_room_can_view_post() remain the
// authoritative visibility/custom-audience/block checks.
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ cards: [], nextCursor: null })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = new URL(request.url).searchParams
  const rawTab = searchParams.get('tab') ?? 'for_you'
  if (!isGreenRoomTab(rawTab)) {
    return NextResponse.json({ error: 'Invalid Green Room tab' }, { status: 400 })
  }

  const rawCursor = searchParams.get('cursor')
  const cursor = rawCursor ? parseFeedCursor(rawCursor) : null
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: 'Invalid feed cursor' }, { status: 400 })
  }

  try {
    const data = await loadGreenRoomFeed(supabase, user.id, {
      tab: rawTab as GreenRoomTab,
      cursor,
      limit: clampFeedLimit(searchParams.get('limit')),
    })
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load Green Room feed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

