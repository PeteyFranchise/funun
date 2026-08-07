import { cookies } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { FNBL_CSS } from '@/components/buyer/fnbl-theme'
import { BuyerTopNav } from '@/components/buyer/BuyerTopNav'
import { BUYER_THEME_COOKIE, readBuyerTheme } from '@/lib/buyers/theme'
import type { BuyerRole } from '@/lib/buyers/schema'

// ─── /sync layout ───────────────────────────────────────────────────────
// 23-02: renamed from app/(buyer-portal)/layout.tsx to a real /sync path
// segment as part of the ROADMAP-locked /buyers/* → /sync/* unification.
//
// CRITICAL BEHAVIORAL CHANGE from the old (buyer-portal) layout: this
// layout does NOT redirect logged-out visitors. The /sync surface is
// public-browse-with-gated-engagement (23-03 builds the public catalog on
// top of this non-gating shell) — a public catalogue browse cannot live
// under a layout that force-redirects every unauthenticated visitor.
// Per-authenticated-route gating (requests/shortlists still require a
// buyer session) now lives INSIDE those pages: each keeps its own
// getUser() + buyer_members membership check and redirects to /sync/access
// when absent, exactly as before, just no longer backstopped by the layout.
//
// This route segment is deliberately NOT added to middleware.ts's
// isProtected array (RESEARCH.md Pitfall 4) — each page's own auth check
// (or, for public pages, the absence of one) is the sole gate.
//
// 22-03: the shell is the light `.fnbl` system (buyer side is LIGHT,
// artist side stays dark). FNBL_CSS is injected ONCE here; readBuyerTheme
// picks the data-theme attribute server-side from the buyer's cookie so
// there is no light->dark flash on load. BuyerTopNav is the shared nav for
// authenticated buyer-portal routes — it renders ONLY when a buyer session
// exists; an anonymous visitor sees the catalogue's own public header
// (23-03 builds the anon nav) instead of the authenticated portal nav.
export default async function SyncLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  type BuyerMembership = { org_id: string; buyer_role: BuyerRole; is_org_admin: boolean }
  let member: BuyerMembership | null = null
  let orgName = ''

  const isBuyer = user != null && (user.app_metadata as { role?: string })?.role === 'buyer'
  if (isBuyer) {
    const { data: memberRow } = await supabase
      .from('buyer_members')
      .select('org_id, buyer_role, is_org_admin')
      .eq('user_id', user!.id)
      .maybeSingle()
    member = memberRow as BuyerMembership | null

    if (member) {
      const { data: org } = await supabase
        .from('buyer_orgs')
        .select('name')
        .eq('id', member.org_id)
        .maybeSingle()
      orgName = org?.name ?? ''
    }
  }

  const cookieStore = await cookies()
  const theme = readBuyerTheme(cookieStore.get(BUYER_THEME_COOKIE)?.value)

  return (
    <div className="fnbl" data-theme={theme}>
      <style>{FNBL_CSS}</style>
      {member && (
        <BuyerTopNav
          companyName={orgName}
          buyerRole={member.buyer_role}
          isOrgAdmin={member.is_org_admin}
          theme={theme}
        />
      )}
      {children}
    </div>
  )
}
