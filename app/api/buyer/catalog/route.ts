import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildCatalogFilter } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'

// ─── GET /api/buyer/catalog (D-16, T-16-17/T-16-18/T-16-20/T-16-21) ───────
// Both requester and approver tiers get a 200 (D-14a/RESEARCH Pitfall 8) —
// browse is never approver-gated. The actual query + rights-ready/privacy
// authorization logic lives in lib/deals/catalog-query.ts's loadCatalogPage
// (a Next.js route module may only export HTTP method handlers plus a
// small route-config set, so the shared I/O function cannot live here) —
// app/(buyer-portal)/buyers/catalog/page.tsx's server-rendered first page
// imports the exact same function, never a second implementation. No
// free-text query parameter is read.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id, buyer_role')
    .eq('user_id', user.id)
    .maybeSingle()

  // Both tiers may browse (D-14a) — only non-members are rejected.
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const searchParams = new URL(request.url).searchParams
  const filter = buildCatalogFilter({
    genre: searchParams.get('genre'),
    mood: searchParams.get('mood'),
    energy: searchParams.get('energy'),
    vocal: searchParams.get('vocal'),
    usageCleared: searchParams.get('usageCleared'),
    key: searchParams.get('key'),
    bpmMin: searchParams.get('bpmMin'),
    bpmMax: searchParams.get('bpmMax'),
  })

  const rawPage = Number(searchParams.get('page'))
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const service = createServiceClient()
  const result = await loadCatalogPage(service, user.id, filter, page)

  return NextResponse.json(result)
}
