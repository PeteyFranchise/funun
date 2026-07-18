import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  clampDiscoverLimit,
  loadDiscoverResults,
  parseDiscoverCursor,
  parseDiscoverFilters,
} from '@/lib/green-room/discover'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// GET /api/green-room/discover?q=&role=&openTo=&genre=&location=&relationship=&capability=&cursor=&limit=
//
// People Search. Reads run on the session-bound client so RLS stays
// authoritative; the discover layer additionally enforces is_public,
// self-exclusion, bidirectional block exclusion, and a public-safe column
// projection (never PII / private profile fields). The service client is used
// ONLY to compute the bidirectional block-exclusion set (see loadBlockedIds).
export async function GET(request: Request) {
  if (DEMO) return NextResponse.json({ results: [], nextCursor: null })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = new URL(request.url).searchParams

  const rawCursor = searchParams.get('cursor')
  const cursor = rawCursor ? parseDiscoverCursor(rawCursor) : null
  if (rawCursor && !cursor) {
    return NextResponse.json({ error: 'Invalid discover cursor' }, { status: 400 })
  }

  const filters = parseDiscoverFilters(searchParams)
  const limit = clampDiscoverLimit(searchParams.get('limit'))

  try {
    const service = createServiceClient()
    const data = await loadDiscoverResults(supabase, service, user.id, filters, cursor, limit)
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search people'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
