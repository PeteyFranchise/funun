export const dynamic = 'force-dynamic'

import { ArtistNav } from '@/components/nav/ArtistNav'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

// Reads the account's approved capability set server-side and passes it to
// ArtistNav as a prop (D-08). Never fetched client-side — capability_grants
// carries the same column-lockdown doctrine as every other privileged table
// (RESEARCH anti-pattern guard).
export default async function ArtistLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient()
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

  return (
    <div className="flex min-h-screen bg-ink text-white">
      <ArtistNav capabilities={capabilities} />
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
