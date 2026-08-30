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

// Reads the account's approved capability set server-side and passes it to
// ArtistNav as a prop (D-08). Never fetched client-side — capability_grants
// carries the same column-lockdown doctrine as every other privileged table
// (RESEARCH anti-pattern guard).
export default async function ArtistLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let capabilities: string[] = []
  // Sync Library nav visibility is a DATA-DRIVEN gate (≥1 admitted song),
  // not a static capability — resolved server-side here, alongside
  // capabilities, and passed down as a prop (never client-fetched),
  // mirroring the capabilities read immediately above (26-CONTEXT.md).
  let hasSyncLibraryAccess = false
  if (user) {
    const service = createServiceClient()
    const { data: grants } = await service
      .from('capability_grants')
      .select('capability')
      .eq('profile_id', user.id)
      .eq('status', 'approved')
    capabilities = (grants ?? []).map(g => g.capability)
    hasSyncLibraryAccess = await hasAdmittedSyncListing(service, user.id)

    // ─── D-09's hard gate ────────────────────────────────────────────────
    // A signed-in User Account with a profile row and no handle gets the
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
    //     where "is authenticated" gets used as a proxy for "is a User
    //     Account" and Team Members get locked out of the admin console.
    //   • Being in this route group is cheaper and keeps the check off the
    //     admin tree entirely. But it is NOT a guarantee on its own:
    //     middleware's isProtected check tests only for a signed-in user and
    //     never checks role, so a signed-in Client Partner navigating
    //     directly to /vault DOES render this layout. Route groups separate
    //     where pages live, not who can reach them. The absent-profile-row
    //     branch inside resolveHandleGate is what actually protects them
    //     (D-10b), and lib/handles/gate.test.ts is what proves it.
    //
    // The handle read is a NET-NEW query — this layout had no user_profiles
    // lookup at all. What rides along is the pattern (a server-side round trip
    // for this user is already happening here), not an existing fetch of this
    // column. Precedent for the guard shape: middleware.ts already runs an
    // equivalent "the profile row may not exist, and that is fine" query today
    // for claimed_at, on every authenticated non-auth-route request including
    // staff hitting /admin, and short-circuits safely when the row is null.
    const handleGate = await resolveHandleGate({
      user,
      loadProfile: async userId => {
        const { data } = await service
          .from('user_profiles')
          .select('handle')
          .eq('id', userId)
          .maybeSingle()
        return data ? { handle: (data.handle as string | null) ?? null } : null
      },
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
        capabilities={capabilities}
        hasSyncLibraryAccess={hasSyncLibraryAccess}
        userId={user?.id}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-hair bg-[rgba(10,10,15,.72)] px-6 py-4 backdrop-blur-[20px]">
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

  return <ArtistLayoutClient userId={user.id}>{body}</ArtistLayoutClient>
}
