import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

// ─── (curator-portal) layout ─────────────────────────────────────────
// Own session check, mirroring app/(admin)/layout.tsx's is_admin gate but
// for app_metadata.role === 'curator'. CRITICAL: this route group's path
// prefix (/portal) is deliberately NOT added to middleware.ts's isProtected
// array (RESEARCH.md Pitfall 3, T-06-14) — this layout's own getUser() +
// role check is the sole gate for every route under this group.
//
// Curators authenticate via magic link, never the artist password form —
// an unauthenticated visitor is redirected to /curators/claim (a curator-
// specific landing page), never to /signin.
export default async function CuratorPortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/curators/claim')

  const isCurator = (user.app_metadata as { role?: string })?.role === 'curator'
  if (!isCurator) redirect('/')

  return (
    <div className="flex min-h-screen bg-ink text-white">
      {/* Own portal shell — does not reuse ArtistNav/Topbar (UI-SPEC). */}
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  )
}
