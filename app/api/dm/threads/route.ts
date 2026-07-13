import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { buildThreadViews } from '@/lib/social/dm'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/dm/threads[?unread=true]  → thread list + unread state
// buildThreadViews() lives in lib/social/dm.ts (Plan 05) so the
// /messages server page can build the same initial list directly without
// an internal self-fetch round-trip.
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ data: [], unreadCount: 0 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wantsUnreadOnly = new URL(request.url).searchParams.get('unread') === 'true'
  const views = await buildThreadViews(supabase, user.id)

  if (wantsUnreadOnly) {
    // Unread count over DIRECT threads only — pending requests are not
    // "unread messages" for the badge (D-07 note).
    const unreadCount = views.filter(v => v.status === 'direct' && v.hasUnread).length
    return NextResponse.json({ unreadCount })
  }

  return NextResponse.json({ data: views })
}
