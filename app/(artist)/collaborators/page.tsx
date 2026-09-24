import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import {
  redactHiddenMemberLinks,
  resolveCollaboratorIdentityHints,
} from '@/lib/collaborators/identity-hints.server'
import { CollaboratorRoster } from '@/components/collaborators/CollaboratorRoster'
import { COLLABORATOR_ROSTER_COLUMNS } from '@/lib/collaborators'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { Topbar } from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams: Promise<{ tab?: string }>
}

export default async function CollaboratorsPage({ searchParams }: PageProps) {
  const { tab } = await searchParams
  const initialTab = tab === 'credits' ? 'credits' : 'roster'

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // My Roster: collaborators this user has added (Phase 1 behavior)
  const { data } = await supabase
    .from('collaborators')
    .select(COLLABORATOR_ROSTER_COLUMNS)
    .eq('user_id', user?.id ?? '')
    .is('archived_at', null)
    .order('name', { ascending: true })

  const rosterRows = (data ?? []) as unknown as CollaboratorProfile[]

  // Viewer-scoped @handle for each claimed row, so two collaborators named
  // Eric are distinguishable. This replaced a raw `user_profiles(id, handle)`
  // read that was described as RLS-scoped but is not an authorization boundary
  // (user_profiles SELECT is `USING (true)`, column-limited only). The resolver
  // applies is_public, profile visibility and BOTH block directions, and never
  // throws: an unresolvable state yields no handles rather than a 500.
  const identityHints = await resolveCollaboratorIdentityHints(
    supabase,
    createServiceClient(),
    user?.id ?? null,
    rosterRows
  )

  // `claimed_by` IS the disclosure — it is the member's account id, and these
  // rows become client props. Stripping it for a non-memberVisible row is what
  // stops a blocked member's account reaching the browser at all, rather than
  // merely being unrendered. Done AFTER the resolver, which needs the column.
  //
  // The row itself stays: a block on this platform filters rather than severs
  // (app/api/network/blocks/route.ts inserts a row and stops; connections and
  // follows are left in place and filtered at read time by no_block()), so the
  // roster matches. Unclaiming would destroy a real link and lose it on
  // unblock, which is why this needed no migration.
  const collaborators = redactHiddenMemberLinks(rosterRows, identityHints)

  // Latest invite per collaborator — drives each card's "Invited …" status and
  // the Resend affordance. RLS "Inviting user manages invites" (migration 018)
  // authorizes reading one's own invites; ordered newest-first so the first
  // row seen per collaborator is the latest.
  const inviteStatus: Record<string, { sentAt: string; status: string }> = {}
  const { data: inviteRows } = await supabase
    .from('collaborator_invites')
    .select('collaborator_id, sent_at, status')
    .eq('inviting_user_id', user?.id ?? '')
    .order('sent_at', { ascending: false })
  for (const row of inviteRows ?? []) {
    if (row.collaborator_id && row.sent_at && !inviteStatus[row.collaborator_id]) {
      inviteStatus[row.collaborator_id] = { sentAt: row.sent_at, status: row.status }
    }
  }

  // My Credits: collaborator rows where this user is the claimed party.
  // Cross-user read authorized by "Claimed users see own credits" RLS policy
  // (migration 026) — no service role client needed.
  const { data: creditsData } = await supabase
    .from('collaborators')
    .select(
      `id, name, pro, ipi, claimed_by, user_id,
      split_sheet_parties!inner (
        id, split_percentage, role,
        split_sheets (
          song_name, vault_project_id
        )
      )`
    )
    .eq('claimed_by', user?.id ?? '')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // `!inner` is intentional: claimed collaborator rows are identity links,
  // not credits by themselves. A row enters My Credits only when it has an
  // actual split-sheet party visible to the signed-in Member.
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
          identityHints={identityHints}
          inviteStatus={inviteStatus}
        />
      </div>
    </>
  )
}
