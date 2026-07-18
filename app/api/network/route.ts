import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { loadNetworkData } from '@/lib/network/query'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/network — the member's own Network tab (DISCOVER-04): following,
// followers, accepted connections, pending outbound/inbound connection
// requests, and the viewer's OWN blocklist.
//
// Reads run entirely on the session-bound client so the RLS policies
// already scoped to auth.uid() (follows_select_all,
// connections_select_participant, blocks_select_own) stay authoritative.
// This route never uses the service client, so there is no code path here
// that could expose "who blocked the viewer" — see lib/network/query.ts.
export async function GET() {
  if (DEMO) {
    return NextResponse.json({
      connections: [],
      following: [],
      followers: [],
      pendingOutgoing: [],
      pendingIncoming: [],
      blocked: [],
    })
  }

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = await loadNetworkData(supabase, user.id)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load your network'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
