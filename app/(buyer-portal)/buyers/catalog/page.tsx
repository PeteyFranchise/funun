import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { buildCatalogFilter } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'
import { CatalogBrowserLight } from '@/components/buyer/CatalogBrowserLight'
import { mapCardsToLightRows, SAMPLE_CATALOG_ROWS } from '@/lib/deals/catalog-sample'

export const dynamic = 'force-dynamic'

// ─── Catalog browse page (D-16) ─────────────────────────────────────────
// Server component: renders the first, unfiltered page of results via the
// SAME loadCatalogPage the API route calls (no duplicated privacy logic).
//
// Slice 1 of the buyer-catalogue redesign renders Claude Design's faithful
// LIGHT catalogue (CatalogBrowserLight). The buyer side is LIGHT to distinguish
// it from the dark artist side (owner decision, 2026-08-03). The live catalog
// query does not yet carry artist/energy/length/tri-state-rights, so where
// there are no live rights-ready rows we render the representative fixture so
// the design shows in full — enriching the query + wiring live filter/pagination
// + the player/modal is slice 1.5/2.
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

  const liveRows = mapCardsToLightRows(initial.data)
  const rows = liveRows.length > 0 ? liveRows : SAMPLE_CATALOG_ROWS

  return <CatalogBrowserLight rows={rows} embedded />
}
