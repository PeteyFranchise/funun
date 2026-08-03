import Link from 'next/link'
import { BUYER_ROLE_LABELS } from '@/lib/buyers/schema'
import type { BuyerRole } from '@/lib/buyers/schema'

// ─── BuyerPortalNav ─────────────────────────────────────────────────────
// Static hrefs for all three Wave 3 surfaces (catalog, shortlists,
// requests) so those page plans add routes under this shell without
// editing this shared file. D-13a: company name is always visible; the
// member's own tier is shown alongside it.
export function BuyerPortalNav({
  companyName,
  buyerRole,
  isOrgAdmin,
}: {
  companyName: string
  buyerRole: BuyerRole
  isOrgAdmin: boolean
}) {
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-white/10 p-4 pt-6">
      <div className="mb-4">
        <p className="truncate text-[14px] font-bold text-white">{companyName}</p>
        <p className="mt-0.5 text-[11px] text-lavdim">
          {BUYER_ROLE_LABELS[buyerRole]}
          {isOrgAdmin ? ' · Org admin' : ''}
        </p>
      </div>
      <Link
        href="/buyers/catalog"
        className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        Catalog
      </Link>
      <Link
        href="/buyers/shortlists"
        className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        Shortlists
      </Link>
      <Link
        href="/buyers/requests"
        className="rounded-lg px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        Requests
      </Link>
    </nav>
  )
}
