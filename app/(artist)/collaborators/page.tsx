import { createServerClient } from '@/lib/supabase/server'
import { CollaboratorRoster } from '@/components/collaborators/CollaboratorRoster'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ tab?: string }>
}

export default async function CollaboratorsPage({ searchParams }: PageProps) {
  const { tab } = await searchParams
  const initialTab = tab === 'credits' ? 'credits' : 'roster'

  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // My Roster: collaborators this user has added (Phase 1 behavior)
  const { data } = await supabase
    .from('collaborators')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('name', { ascending: true })

  const collaborators = (data ?? []) as CollaboratorProfile[]

  // My Credits: collaborator rows where this user is the claimed party.
  // Cross-user read authorized by "Claimed users see own credits" RLS policy
  // (migration 026) — no service role client needed.
  const { data: creditsData } = await supabase
    .from('collaborators')
    .select(
      `id, name, pro, ipi, claimed_by, user_id,
      split_sheet_parties (
        split_percentage, role,
        split_sheets (
          song_name, vault_project_id
        )
      )`
    )
    .eq('claimed_by', user?.id ?? '')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // Cast through unknown — the credits rows are a subset of CollaboratorProfile
  // joined with split_sheet_parties. The missing created_at/updated_at fields
  // are not needed in the Credits tab render.
  const credits = (creditsData ?? []) as unknown as CollaboratorProfile[]

  return (
    <>
      <Topbar
        title="Collaborators"
        subtitle="Your roster — add once, auto-fill everywhere."
      />
      <div className="px-9 py-8">
        <CollaboratorRoster
          collaborators={collaborators}
          credits={credits}
          initialTab={initialTab}
        />
      </div>
    </>
  )
}
