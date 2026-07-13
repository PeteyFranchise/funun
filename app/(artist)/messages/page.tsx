import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { buildThreadViews } from '@/lib/social/dm'
import { Topbar } from '@/components/layout/Topbar'
import { MessagesPageClient } from '@/components/messages/MessagesPageClient'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── /messages (Task 3, D-01) ─────────────────────────────────────────────
// Server component: fetches the initial thread list + the viewer's own
// verified flag (for the D-17 rate-limit budget) directly via
// buildThreadViews() (lib/social/dm.ts) — mirrors app/(artist)/vault/page.tsx's
// server-fetch-then-client-shell pattern. Resolves an initial ?with={userId}
// (profile Message button deep-link) into a stand-in contact when no thread
// exists yet for that pair.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; with?: string }>
}) {
  const params = await searchParams

  if (DEMO) {
    return (
      <>
        <Topbar title="Messages" subtitle="Your direct conversations" />
        <MessagesPageClient viewerId="demo-user" viewerVerified={false} initialThreads={[]} initialThreadId={null} initialWith={null} />
      </>
    )
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/signin')

  const [threads, viewerRes] = await Promise.all([
    buildThreadViews(supabase, user.id),
    // Explicit column list — never select('*') on artist_profiles (migration
    // 040 column lockdown returns 42501 otherwise).
    supabase.from('artist_profiles').select('verified').eq('id', user.id).maybeSingle(),
  ])

  const viewerVerified = !!(viewerRes.data as { verified?: boolean | null } | null)?.verified

  let initialWith: { id: string; name: string; avatarUrl: string | null; handle: string; lastSeenAt: string | null } | null = null
  if (params.with && params.with !== user.id && !threads.some(t => t.other.id === params.with)) {
    const { data: otherProfile } = await supabase
      .from('artist_profiles')
      .select('artist_name, avatar_url, handle, last_seen_at')
      .eq('id', params.with)
      .maybeSingle()
    const row = otherProfile as
      | { artist_name?: string | null; avatar_url?: string | null; handle?: string | null; last_seen_at?: string | null }
      | null
    if (row) {
      initialWith = {
        id: params.with,
        name: row.artist_name || 'Member',
        avatarUrl: row.avatar_url ?? null,
        handle: row.handle ?? '',
        lastSeenAt: row.last_seen_at ?? null,
      }
    }
  }

  return (
    <>
      <Topbar title="Messages" subtitle="Your direct conversations" />
      <MessagesPageClient
        viewerId={user.id}
        viewerVerified={viewerVerified}
        initialThreads={threads}
        initialThreadId={params.thread ?? null}
        initialWith={initialWith}
      />
    </>
  )
}
