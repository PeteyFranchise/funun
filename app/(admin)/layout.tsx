import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/lib/admin/gate'
import { ADMIN_THEME_COOKIE, readAdminTheme } from '@/lib/admin/theme'
import { ADMIN_CONSOLE_CSS } from '@/components/admin/console-theme'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { SignOutButton } from '@/components/auth/SignOutButton'

const NAV_LINK_CLASS =
  'rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink-2)] transition hover:bg-[color:var(--border)] hover:text-[color:var(--ink)]'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  // Widened (Phase 25, D-01): any staff role (leadership/AE/BD) is admitted
  // here — not just leadership (the pre-existing is_admin-only gate). Every
  // leadership-only page under /admin/* still carries its own inline
  // leadership self-guard (verified in 25-06 Task 3) — this layout gate is
  // deliberately NOT the sole authority (Pitfall 3).
  const role = getStaffRole(user)
  if (!role) redirect('/')
  const isLeadership = role === 'leadership'

  // 25-08: dark is the Team Console default; the cookie is read
  // server-side so `data-theme` is correct on the very first paint (no
  // flash) — same discipline as the buyer portal layout's readBuyerTheme.
  const cookieStore = await cookies()
  const theme = readAdminTheme(cookieStore.get(ADMIN_THEME_COOKIE)?.value)

  return (
    <div className="fncon" data-theme={theme}>
      <style>{ADMIN_CONSOLE_CSS}</style>
      <div className="flex min-h-screen bg-[color:var(--ground)] text-[color:var(--ink)]">
        {/* Admin sidebar — lightweight, no ArtistNav reuse */}
        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-[color:var(--border)] bg-[color:var(--panel)] p-4 pt-6">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ink-3)]">
            Admin
          </p>
          {isLeadership && (
            <>
              <Link href="/checklist" className={NAV_LINK_CLASS}>
                Checklist Items
              </Link>
              <Link href="/tips" className={NAV_LINK_CLASS}>
                Tips
              </Link>
              <Link href="/admin/curators" className={NAV_LINK_CLASS}>
                PitchPlug · Curators
              </Link>
              <Link href="/admin/members" className={NAV_LINK_CLASS}>
                Industry Members
              </Link>
              <Link href="/admin/team-members" className={NAV_LINK_CLASS}>
                Team Members
              </Link>
              {/* R5 (31-08): the leadership control tower is hidden from
                  every non-leadership staff role — an AE's own book lives
                  at /admin/my-client-partners below, visible to all staff.
                  This link stays leadership-only alongside the other
                  leadership-only rooms above (unchanged behavior, just
                  now paired with the explicit R5 rationale). */}
              <Link href="/admin/buyer-orgs" className={NAV_LINK_CLASS}>
                Client Partners
              </Link>
              <Link href="/admin/deals" className={NAV_LINK_CLASS}>
                Deals
              </Link>
              <Link href="/admin/deals/metrics" className={NAV_LINK_CLASS}>
                GTM Metrics
              </Link>
              <Link href="/admin/green-room-placements" className={NAV_LINK_CLASS}>
                Green Room Placements
              </Link>
              <Link href="/admin/reports" className={NAV_LINK_CLASS}>
                Reports
              </Link>
              <Link href="/admin/verification" className={NAV_LINK_CLASS}>
                Verification
              </Link>
              <Link href="/admin/esign-usage" className={NAV_LINK_CLASS}>
                E-Sign Usage
              </Link>
            </>
          )}
          {/* Sync Library curation (26-10) — leadership + ae, matching the
              backing routes' requireStaff(['leadership','ae']) exactly
              (26-CONTEXT.md's "broader permissioned-staff curation role");
              bd does not see this link. Kept as its own condition (not
              folded into the isLeadership-only block above) so ae staff can
              navigate to a page they are actually permitted to use. */}
          {(isLeadership || role === 'ae') && (
            <Link href="/admin/sync-library" className={NAV_LINK_CLASS}>
              Sync Library
            </Link>
          )}
          {/* Every staff role (leadership/AE/BD) sees these links. */}
          <Link href="/admin/lead-engine" className={NAV_LINK_CLASS}>
            Lead Engine
          </Link>
          {/* Slice-1 rooms (31-08, R1/R5): nav order encodes the AE
              pipeline funnel — Crate Requests (demand inbox, absorbs the
              Lead Engine per 31-SPEC R10) precedes Selects (the
              cross-client pipeline hub). Every staff role sees both. */}
          <Link href="/admin/crate-requests" className={NAV_LINK_CLASS}>
            Crate Requests
          </Link>
          <Link href="/admin/selects" className={NAV_LINK_CLASS}>
            Selects
          </Link>
          <Link href="/admin/my-client-partners" className={NAV_LINK_CLASS}>
            My Client Partners
          </Link>
          {/* Selects (31-10) — the AE's curate-and-send console + own-book
              list. Reachability fix (deviation, Rule 2): the builder/list
              pages this phase ships had no nav entry point. Sits next to My
              Client Partners for now; the 31-UI-SPEC's full nav ordering
              (between Crate Requests and Deals) lands once those
              Phase-31/31.1 rooms exist. */}
          <Link href="/admin/selects" className={NAV_LINK_CLASS}>
            Selects
          </Link>
          <Link href="/admin/directory" className={NAV_LINK_CLASS}>
            Directory
          </Link>
          {/* Artist Invites (Phase 27, D-06/D-14) — waitlist + invite
              management is open to any staff role; the page-level
              "Reopen & broadcast" action is separately gated to Leadership
              inside ArtistInvitesAdmin via the server-resolved isLeadership
              prop, not by hiding this nav link. */}
          <Link href="/admin/artist-invites" className={NAV_LINK_CLASS}>
            Artist Invites
          </Link>
          <div className="mt-auto flex flex-col gap-1 border-t border-[color:var(--border)] pt-3">
            <AdminThemeToggle theme={theme} />
            <div className="px-3 py-2 [&>button]:text-[13px] [&>button]:text-[color:var(--ink-3)] [&>button:hover]:text-[color:var(--ink)]">
              <SignOutButton />
            </div>
          </div>
        </nav>
        <div className="flex min-h-screen flex-1 flex-col bg-[color:var(--ground)]">{children}</div>
      </div>
    </div>
  )
}
