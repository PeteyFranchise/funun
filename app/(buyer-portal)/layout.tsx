import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { BuyerPortalNav } from '@/components/buyer/BuyerPortalNav'
import type { BuyerRole } from '@/lib/buyers/schema'

// ─── (buyer-portal) layout ─────────────────────────────────────────
// Own session check, mirroring app/(curator-portal)/layout.tsx's gate but
// for app_metadata.role === 'buyer' (D-11). CRITICAL: this route group's
// path prefix is deliberately NOT added to middleware.ts's isProtected
// array (RESEARCH.md Pitfall 4) — this layout's own getUser() + role check
// is the sole gate for every route under this group.
//
// Buyers authenticate via magic link, never the artist password form — an
// unauthenticated visitor is redirected to /buyers/access (a buyer-specific
// landing page), never to /signin.
export default async function BuyerPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')

  const isBuyer = (user.app_metadata as { role?: string })?.role === 'buyer'
  if (!isBuyer) redirect('/')

  // An auth user carrying the buyer role but no buyer_members row (should
  // never happen via createBuyerAccount's atomic write, but this fails
  // closed rather than rendering portal surfaces with no org context) also
  // lands on the access page.
  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id, buyer_role, is_org_admin')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/buyers/access')

  const { data: org } = await supabase
    .from('buyer_orgs')
    .select('name')
    .eq('id', member.org_id)
    .maybeSingle()

  return (
    <div className="flex min-h-screen bg-ink text-white">
      <BuyerPortalNav
        companyName={org?.name ?? ''}
        buyerRole={member.buyer_role as BuyerRole}
        isOrgAdmin={member.is_org_admin}
      />
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
