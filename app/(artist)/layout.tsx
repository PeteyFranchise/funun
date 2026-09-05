export const dynamic = 'force-dynamic'

import { ArtistNav } from '@/components/nav/ArtistNav'
import { NotificationBell } from '@/components/nav/NotificationBell'
import { MessagesIcon } from '@/components/nav/MessagesIcon'
import { PresenceTracker } from '@/components/nav/PresenceTracker'
import { ArtistLayoutClient } from '@/components/nav/ArtistLayoutClient'
import { ChooseHandleGate } from '@/components/handles/ChooseHandleGate'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdmittedSyncListing } from '@/lib/sync-library/hub-access'
import { resolveHandleGate } from '@/lib/handles/gate'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import { GlobalCaptureHeaderButton } from '@/components/ideas/GlobalQuickCapture'
import { redirect } from 'next/navigation'
import { getStaffRoles } from '@/lib/admin/staff-role'
import { resolveAccountContext } from '@/lib/accounts/account-context'
import { SessionIdentityGuard } from '@/components/auth/SessionIdentityGuard'

export default async function ArtistLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sync Library nav visibility is a DATA-DRIVEN gate (≥1 admitted song),
  // resolved server-side and passed down as a prop (never client-fetched).
  let hasSyncLibraryAccess = false
  let navUser: { name: string } | undefined
  let isMemberAccount = false
  let clientPartner: { organizationName: string } | undefined

  if (user) {
    const service = createServiceClient()
    // Client Partner access is a relationship, not a separate login or a
    // permanent user type. An existing Member can therefore switch into The
    // Crate without losing or replacing their personal workspace.
    const { data: buyerMembership } = await service
      .from('buyer_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (buyerMembership) {
      const { data: buyerOrganization } = await service
        .from('buyer_orgs')
        .select('name')
        .eq('id', buyerMembership.org_id)
        .maybeSingle()
      if (buyerOrganization?.name) {
        clientPartner = { organizationName: buyerOrganization.name }
      }
    }

    // ─── D-09's hard gate ────────────────────────────────────────────────
    // A signed-in Member Account with a profile row and no handle gets the
    // choose-a-handle screen INSTEAD of the app, until it picks one. This is
    // what drains the handle-less accounts, and therefore what plan 07's
    // NOT NULL constraint depends on.
    //
    // WHY IT LIVES HERE AND NOT IN middleware.ts (D-10a) — the next person to
    // read this will be tempted to move it:
    //   • middleware runs on EVERY request holding only the auth session, so
    //     it would need a database round trip per request just to learn
    //     whether a profile row exists. It also gates /admin in the same
    //     isProtected expression as /vault — which is exactly the context
    //     where "is authenticated" gets used as a proxy for "is a Member
    //     Account" and Team Members get locked out of the admin console.
    //   • Being in this route group is cheaper and keeps the check off the
    //     admin tree entirely. But it is NOT a guarantee on its own:
    //     middleware's isProtected check tests only for a signed-in user and
    //     never checks role, so a signed-in Client Partner navigating
    //     directly to /vault DOES render this layout. Route groups separate
    //     where pages live, not who can reach them. resolveAccountContext()
    //     now performs the actual staff/member/buyer-context redirect above.
    //
    // The handle read is a NET-NEW query — this layout had no user_profiles
    // lookup at all. What rides along is the pattern (a server-side round trip
    // for this user is already happening here), not an existing fetch of this
    // column. Precedent for the guard shape: middleware.ts already runs an
    // equivalent "the profile row may not exist, and that is fine" query today
    // for claimed_at, on every authenticated non-auth-route request including
    // staff hitting /admin, and short-circuits safely when the row is null.
    // Fetched once, used twice: the gate decision below, and the nav footer's
    // identity label (the spot that read "Your Profile" for every artist —
    // ArtistNav's user prop existed but nothing ever fed it). Same D-11 rule
    // as the profile header: artist name if set, otherwise the @handle.
    const { data: profileRow } = await service
      .from('user_profiles')
      .select('handle, artist_name')
      .eq('id', user.id)
      .maybeSingle()

    const accountContext = resolveAccountContext({
      hasMemberProfile: profileRow !== null,
      clientPartnerMembershipCount: buyerMembership ? 1 : 0,
      staffRoles: getStaffRoles(user),
    })
    if (accountContext.isFununTeamMember) redirect('/admin')
    if (!accountContext.hasMemberWorkspace) {
      redirect(accountContext.hasClientPartnerWorkspace ? '/sync/catalog' : '/sync/access')
    }

    hasSyncLibraryAccess = await hasAdmittedSyncListing(service, user.id)
    isMemberAccount = accountContext.hasMemberWorkspace
    const navName = profileRow
      ? profileDisplayTitle({
          artistName: (profileRow.artist_name as string | null) ?? null,
          handle: (profileRow.handle as string | null) ?? null,
        })
      : ''
    if (navName) navUser = { name: navName }

    const handleGate = await resolveHandleGate({
      user,
      loadProfile: async () =>
        profileRow ? { handle: (profileRow.handle as string | null) ?? null } : null,
      renderGate: userId => <ChooseHandleGate userId={userId} />,
    })
    // Returned directly rather than composed with children: no nav, no
    // header, no presence tracker, no docked-widget wrapper — so no page
    // below renders and no page-level data is fetched behind it (T-36-33).
    if (handleGate) return handleGate
  }

  const body = (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav
        hasSyncLibraryAccess={hasSyncLibraryAccess}
        clientPartner={clientPartner}
        userId={user?.id}
        user={navUser}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-hair bg-[rgba(10,10,15,.72)] px-6 py-4 backdrop-blur-[20px]">
          {user && <GlobalCaptureHeaderButton />}
          {user && <MessagesIcon userId={user.id} />}
          {user && <NotificationBell userId={user.id} />}
        </header>
        {children}
      </div>
      {user && <PresenceTracker userId={user.id} />}
    </div>
  )

  // The docked-widget wrapper + dock-open context are only meaningful for an
  // authenticated session (PresenceTracker/MessagesIcon are also user-gated
  // above) — render children directly when unauthenticated.
  if (!user) return body

  return (
    <SessionIdentityGuard
      identity={{ userId: user.id, context: 'personal', label: navUser?.name || user.email || 'Member' }}
    >
      <ArtistLayoutClient userId={user.id} enableGlobalCapture={isMemberAccount}>{body}</ArtistLayoutClient>
    </SessionIdentityGuard>
  )
}
