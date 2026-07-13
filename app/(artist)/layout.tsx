export const dynamic = 'force-dynamic'

import { ArtistNav } from '@/components/nav/ArtistNav'
import { NotificationBell } from '@/components/nav/NotificationBell'
import { MessagesIcon } from '@/components/nav/MessagesIcon'
import { PresenceTracker } from '@/components/nav/PresenceTracker'
import { ArtistLayoutClient } from '@/components/nav/ArtistLayoutClient'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

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
  if (user) {
    const service = createServiceClient()
    const { data: grants } = await service
      .from('capability_grants')
      .select('capability')
      .eq('profile_id', user.id)
      .eq('status', 'approved')
    capabilities = (grants ?? []).map(g => g.capability)
  }

  const body = (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav capabilities={capabilities} />
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
