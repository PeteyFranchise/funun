import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import { loadShortlistEntries } from '@/lib/deals/shortlists'
import { ShortlistPanel } from '@/components/buyer/ShortlistPanel'

export const dynamic = 'force-dynamic'

// ─── Org-shared shortlist page (D-14c) ─────────────────────────────────
// Renders every project saved by ANY member of the caller's org via the
// SAME loadShortlistEntries the API route's GET handler calls, so the
// "re-evaluate rights-readiness at render time" rule and dual-level
// attribution never drift between the two surfaces. Invisible to artists
// — nothing here is reachable or referenced from any artist-facing route.
export default async function ShortlistsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/buyers/access')

  const { data: member } = await supabase
    .from('buyer_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) redirect('/buyers/access')

  const service = createServiceClient()
  const entries = await loadShortlistEntries(service, member.org_id)

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-white/40">Shortlists</p>
      <h1 className="mt-1 text-2xl font-semibold text-white">Org shortlist</h1>
      <p className="mt-1 max-w-2xl text-sm text-white/50">
        Every project saved by anyone on your team, visible to the whole org — scout saves, approver
        reviews (D-14c). Invisible to artists.
      </p>

      <div className="mt-8">
        <ShortlistPanel initialEntries={entries} />
      </div>
    </div>
  )
}
