import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { buildCatalogFilter } from '@/lib/deals/catalog'
import { loadCatalogPage } from '@/lib/deals/catalog-query'
import { CatalogBrowserLight } from '@/components/buyer/CatalogBrowserLight'
import { mapCardsToLightRows, SAMPLE_CATALOG_ROWS } from '@/lib/deals/catalog-sample'
import { getStaffRole } from '@/lib/admin/gate'

export const dynamic = 'force-dynamic'

// ─── Catalog browse page (D-16) ─────────────────────────────────────────
// 23-02: moved from app/(buyer-portal)/buyers/catalog/page.tsx to
// app/sync/catalog/page.tsx as part of the /buyers/* → /sync/* unification.
// 23-03: opened to logged-out visitors (locked directive 4 — a public
// visitor browses + plays simulated previews with no auth wall; engagement
// (shortlist/License) still pops the login/register modal, wired in 23-07).
// Branches on session presence:
//   - no user                     → public browse: loadCatalogPage(..., null,
//                                    ...), CatalogBrowserLight isPublic (its
//                                    own self-contained header + Login
//                                    button, NOT embedded — BuyerTopNav is
//                                    for authenticated members only)
//   - user, no buyer_members row  → redirect to /sync/access (unchanged)
//   - user is a buyer             → authenticated embedded experience
//                                    (unchanged)
//
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
//
// 30-08: role-aware staff layers on this SAME surface. staffMode is
// resolved SERVER-SIDE ONLY via getStaffRole(user) (never a client
// flag/query-param — T-30-02, the same authority app/(admin)/admin/
// sync-library/page.tsx uses). A staff visitor (leadership/ae/bd/anr) sees
// the layered Crate on this exact URL; a buyer or logged-out visitor sees
// the unchanged clean storefront. A staff account that is NOT also a
// buyer_members row bypasses the /sync/access redirect below (a pure staff
// account has no reason to hold buyer membership) but is never passed as
// loadCatalogPage's buyerUserId — no block-list resolution runs against a
// staff account, matching the anonymous-visitor path above.
export default async function CatalogPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const service = createServiceClient()
  const filter = buildCatalogFilter({})
  const staffRole = user ? getStaffRole(user) : null

  if (!user) {
    const initial = await loadCatalogPage(service, null, filter, 1)
    const liveRows = mapCardsToLightRows(initial.data)
    const rows = liveRows.length > 0 ? liveRows : SAMPLE_CATALOG_ROWS
    return <CatalogBrowserLight rows={rows} isPublic />
  }

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member && !staffRole) redirect('/sync/access')

  const initial = await loadCatalogPage(service, member ? user.id : null, filter, 1, staffRole)

  const liveRows = mapCardsToLightRows(initial.data)
  // 30-08: carry the server-attached staff object through onto each
  // CatalogRow by id — mapCardsToLightRows' declared return type is
  // CatalogCard[] (it must stay ignorant of the staff-only shape), so the
  // staff layer is zipped on here instead of widening that shared mapper.
  const staffById = new Map(initial.data.map(c => [c.id, c.staff]))
  const rows0 = staffRole ? liveRows.map(r => ({ ...r, staff: staffById.get(r.id) })) : liveRows
  const rows = rows0.length > 0 ? rows0 : SAMPLE_CATALOG_ROWS

  return <CatalogBrowserLight rows={rows} embedded staffMode={staffRole} />
}
