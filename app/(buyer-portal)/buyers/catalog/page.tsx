import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { buildCatalogFilter } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'
import { CatalogBrowser } from '@/components/buyer/CatalogBrowser'

export const dynamic = 'force-dynamic'

// ─── Catalog browse page (D-16) ─────────────────────────────────────────
// Server component: renders the first, unfiltered page of results via the
// SAME loadCatalogPage the API route calls (no duplicated privacy logic,
// no extra network round trip). CatalogBrowser owns all filter state,
// pagination, and re-fetching via GET /api/buyer/catalog from here on.
export default async function CatalogPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/buyers/access')

  const service = createServiceClient()
  const filter = buildCatalogFilter({})
  const initial = await loadCatalogPage(service, user.id, filter, 1)

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-white/40">Catalog</p>
      <h1 className="mt-1 text-2xl font-semibold text-white">Browse rights-ready catalog</h1>
      <p className="mt-1 max-w-2xl text-sm text-white/50">
        Filtered browse only — genre, mood/energy, vocals, usage cleared, musical key, and BPM. No
        free-text search (D-16). Every result is public, rights-ready, and privacy-checked.
      </p>

      <div className="mt-8">
        <CatalogBrowser initialCards={initial.data} initialPage={initial.page} pageSize={initial.pageSize} />
      </div>
    </div>
  )
}
